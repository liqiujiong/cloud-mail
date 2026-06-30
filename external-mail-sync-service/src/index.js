import { ImapFlow } from 'imapflow';
import { SocksClient } from 'socks';
import tls from 'node:tls';
import net from 'node:net';
import http from 'node:http';

const PORT = Number(process.env.PORT || 8788);
const MAX_LIMIT = 100;
const IMAP_CONNECTION_TIMEOUT = Number(process.env.IMAP_CONNECTION_TIMEOUT || 15000);
const IMAP_GREETING_TIMEOUT = Number(process.env.IMAP_GREETING_TIMEOUT || 10000);
const IMAP_SOCKET_TIMEOUT = Number(process.env.IMAP_SOCKET_TIMEOUT || 30000);
const IMAP_PROBE_TIMEOUT = Number(process.env.IMAP_PROBE_TIMEOUT || 2000);
const imapModeCache = new Map();

function assertInternalToken(req) {
	const token = req.headers['x-internal-token'];
	if (!process.env.INTERNAL_TOKEN || token !== process.env.INTERNAL_TOKEN) {
		return { success: false, status: 401, error: 'Unauthorized' };
	}
}

function json(res, status, data) {
	res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(data));
}

function safeJson(res, status, data) {
	if (res.destroyed || res.writableEnded) {
		return;
	}
	try {
		json(res, status, data);
	} catch {
	}
}

function isClientAbortError(error) {
	return error?.code === 'ECONNRESET' || /aborted/i.test(error?.message || '');
}

async function readJson(req) {
	const chunks = [];
	for await (const chunk of req) {
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function normalizeProtocol(protocol) {
	return String(protocol || '').toUpperCase();
}

function normalizeLimit(value, fallback = 50) {
	const limit = Number(value ?? fallback);
	if (limit <= 0) {
		return 0;
	}
	return Math.min(limit, MAX_LIMIT);
}

function proxyUrl(proxy) {
	if (!proxy?.host || !proxy?.port) {
		return undefined;
	}
	const auth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || '')}@` : '';
	return `socks5://${auth}${proxy.host}:${proxy.port}`;
}

async function createSocksSocket(proxy, host, port) {
	if (!proxy?.host || !proxy?.port) {
		return null;
	}
	const result = await SocksClient.createConnection({
		proxy: {
			host: proxy.host,
			port: Number(proxy.port),
			type: 5,
			userId: proxy.username || undefined,
			password: proxy.password || undefined
		},
		command: 'connect',
		destination: {
			host,
			port: Number(port)
		}
	});
	return result.socket;
}

function imapCacheKey(payload) {
	const imap = payload.imap;
	return `${imap.secure !== false ? 'ssl' : 'plain'}://${imap.host}:${Number(imap.port || 993)}`;
}

function quoteImapString(value) {
	return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function createPlainImapSocket(payload, timeout = IMAP_SOCKET_TIMEOUT) {
	const imap = payload.imap;
	const socket = await createSocksSocket(payload.proxy, imap.host, imap.port)
		|| net.connect(Number(imap.port || 143), imap.host);
	socket.setTimeout(timeout);
	return socket;
}

async function readProbeBanner(payload) {
	const socket = await createPlainImapSocket(payload, IMAP_PROBE_TIMEOUT);
	try {
		return await new Promise((resolve, reject) => {
			let buffer = '';
			const timer = setTimeout(() => reject(new Error('IMAP_PROBE_TIMEOUT')), IMAP_PROBE_TIMEOUT);
			const cleanup = () => {
				clearTimeout(timer);
				socket.off('data', onData);
				socket.off('error', onError);
				socket.off('timeout', onTimeout);
			};
			const onData = (chunk) => {
				buffer += chunk.toString('utf8');
				const index = buffer.indexOf('\r\n');
				if (index >= 0) {
					cleanup();
					resolve(buffer.slice(0, index));
				}
			};
			const onError = (error) => {
				cleanup();
				reject(error);
			};
			const onTimeout = () => {
				cleanup();
				reject(new Error('IMAP_PROBE_TIMEOUT'));
			};
			socket.on('data', onData);
			socket.once('error', onError);
			socket.once('timeout', onTimeout);
		});
	} finally {
		socket.destroy();
	}
}

async function resolveImapMode(payload) {
	if (payload.imap?.secure !== false) {
		return 'imapflow';
	}
	const key = imapCacheKey(payload);
	const cached = imapModeCache.get(key);
	if (cached) {
		return cached;
	}
	let mode = 'imapflow';
	try {
		const banner = await readProbeBanner(payload);
		if (/proxy ready/i.test(banner)) {
			mode = 'raw-proxy';
		}
	} catch {
		mode = 'imapflow';
	}
	imapModeCache.set(key, mode);
	return mode;
}

class RawImapClient {
	constructor(payload) {
		this.payload = payload;
		this.socket = null;
		this.buffer = Buffer.alloc(0);
		this.tagNum = 1;
	}

	async connect() {
		this.socket = await createPlainImapSocket(this.payload);
		this.socket.on('data', chunk => {
			this.buffer = Buffer.concat([this.buffer, chunk]);
		});
		await this.readLine();
	}

	nextTag() {
		return `A${String(this.tagNum++).padStart(3, '0')}`;
	}

	write(tag, command) {
		this.socket.write(`${tag} ${command}\r\n`, 'binary');
	}

	async waitForBuffer(predicate, timeout = IMAP_SOCKET_TIMEOUT) {
		if (predicate()) {
			return;
		}
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => cleanup(new Error('IMAP_TIMEOUT')), timeout);
			const cleanup = (error) => {
				clearTimeout(timer);
				this.socket.off('data', onData);
				this.socket.off('error', onError);
				this.socket.off('timeout', onTimeout);
				error ? reject(error) : resolve();
			};
			const onData = () => {
				if (predicate()) {
					cleanup();
				}
			};
			const onError = (error) => cleanup(error);
			const onTimeout = () => cleanup(new Error('IMAP_TIMEOUT'));
			this.socket.on('data', onData);
			this.socket.once('error', onError);
			this.socket.once('timeout', onTimeout);
		});
	}

	async readLine() {
		await this.waitForBuffer(() => this.buffer.indexOf('\r\n') >= 0);
		const index = this.buffer.indexOf('\r\n');
		const line = this.buffer.slice(0, index).toString('utf8');
		this.buffer = this.buffer.slice(index + 2);
		return line;
	}

	async readBytes(length) {
		await this.waitForBuffer(() => this.buffer.length >= length);
		const data = this.buffer.slice(0, length);
		this.buffer = this.buffer.slice(length);
		return data;
	}

	async readResponseItem() {
		const line = await this.readLine();
		const literalMatch = line.match(/\{(\d+)\}$/);
		if (!literalMatch) {
			return { line };
		}
		return {
			line,
			literal: await this.readBytes(Number(literalMatch[1]))
		};
	}

	async readTagged(tag) {
		const lines = [];
		const literals = [];
		while (true) {
			const item = await this.readResponseItem();
			lines.push(item.line);
			if (item.literal) {
				literals.push(item);
			}
			if (item.line.startsWith(`${tag} OK`)) {
				return { lines, literals };
			}
			if (item.line.startsWith(`${tag} NO`) || item.line.startsWith(`${tag} BAD`)) {
				throw new Error(item.line);
			}
		}
	}

	async command(command) {
		const tag = this.nextTag();
		this.write(tag, command);
		return this.readTagged(tag);
	}

	async loginAndSelect() {
		const loginTag = this.nextTag();
		const selectTag = this.nextTag();
		this.write(loginTag, `LOGIN ${quoteImapString(this.payload.imap.username)} ${quoteImapString(this.payload.imap.password)}`);
		while (true) {
			const item = await this.readResponseItem();
			if (item.line.startsWith(`${loginTag} OK`)) {
				break;
			}
			if (item.line.startsWith(`${loginTag} NO`) || item.line.startsWith(`${loginTag} BAD`)) {
				throw new Error(item.line);
			}
			if (/^\* OK .*Dovecot/i.test(item.line) || /^\* OK .*CAPABILITY/i.test(item.line)) {
				break;
			}
		}
		this.write(selectTag, `SELECT ${quoteImapString(this.payload.imap.mailbox || 'INBOX')}`);
		const response = await this.readTagged(selectTag);
		return Number((response.lines.join('\n').match(/\* (\d+) EXISTS/) || [])[1] || 0);
	}

	async logout() {
		if (!this.socket) {
			return;
		}
		try {
			await this.command('LOGOUT');
		} catch {
		}
		this.socket.destroy();
	}
}

function parseSearchUids(lines) {
	const searchLine = lines.find(line => line.startsWith('* SEARCH')) || '';
	return searchLine.replace(/^\* SEARCH\s*/, '')
		.split(/\s+/)
		.map(item => item.trim())
		.filter(Boolean);
}

function messageIdFromRaw(raw) {
	const text = raw.toString('utf8');
	const match = text.match(/^Message-ID:\s*(.+)$/im);
	return match ? match[1].trim() : '';
}

function mapError(error, protocol) {
	const message = error?.message || 'UNKNOWN_ERROR';
	if (/auth|login|password|credentials/i.test(message)) {
		return `${protocol}_AUTH_FAILED`;
	}
	if (/certificate|tls|ssl/i.test(message)) {
		return `${protocol}_SSL_FAILED`;
	}
	if (/timeout|timed out/i.test(message)) {
		return `${protocol}_TIMEOUT`;
	}
	if (/socks|proxy/i.test(message)) {
		return 'SOCKS5_CONNECT_FAILED';
	}
	return message;
}

async function withImapClient(payload, fn) {
	const imap = payload.imap;
	const client = new ImapFlow({
		host: imap.host,
		port: Number(imap.port || 993),
		secure: imap.secure !== false,
		doSTARTTLS: imap.secure === false ? false : undefined,
		auth: {
			user: imap.username,
			pass: imap.password,
			loginMethod: 'LOGIN'
		},
		proxy: proxyUrl(payload.proxy),
		connectionTimeout: IMAP_CONNECTION_TIMEOUT,
		greetingTimeout: IMAP_GREETING_TIMEOUT,
		socketTimeout: IMAP_SOCKET_TIMEOUT,
		logger: false
	});

	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.logout().catch(() => {});
	}
}

async function testImap(payload) {
	if (await resolveImapMode(payload) === 'raw-proxy') {
		return testRawImap(payload);
	}
	return withImapClient(payload, async (client) => {
		const mailbox = await client.mailboxOpen(payload.imap.mailbox || 'INBOX');
		return {
			success: true,
			protocol: 'IMAP',
			total: mailbox.exists,
			mailbox: mailbox.path
		};
	});
}

async function fetchImap(payload) {
	if (await resolveImapMode(payload) === 'raw-proxy') {
		return fetchRawImap(payload);
	}
	const known = new Set((payload.knownUids || []).map(String));
	const limit = normalizeLimit(payload.limit);
	const result = { success: true, total: 0, fetched: 0, skipped: 0, errors: [] };

	await withImapClient(payload, async (client) => {
		const mailbox = await client.mailboxOpen(payload.imap.mailbox || 'INBOX');
		result.total = mailbox.exists;
		const start = limit > 0 ? Math.max(1, mailbox.exists - limit + 1) : 1;
		const range = `${start}:*`;
		const messages = [];

		for await (const message of client.fetch(range, { uid: true, envelope: true, source: true })) {
			messages.push(message);
		}

		for (const message of messages.sort((a, b) => Number(a.uid) - Number(b.uid))) {
			const uid = String(message.uid);
			if (known.has(uid)) {
				result.skipped += 1;
				continue;
			}
			await ingestRawMail({
				externalAccountId: payload.externalAccountId,
				protocol: 'IMAP',
				mailbox: payload.imap.mailbox || 'INBOX',
				uid,
				uidl: '',
				messageId: message.envelope?.messageId || '',
				raw: Buffer.from(message.source).toString('base64')
			});
			result.fetched += 1;
		}
	});

	return result;
}

async function testRawImap(payload) {
	const client = new RawImapClient(payload);
	try {
		await client.connect();
		const total = await client.loginAndSelect();
		return {
			success: true,
			protocol: 'IMAP',
			total,
			mailbox: payload.imap.mailbox || 'INBOX'
		};
	} finally {
		await client.logout();
	}
}

async function fetchRawImap(payload) {
	const known = new Set((payload.knownUids || []).map(String));
	const limit = normalizeLimit(payload.limit);
	const result = { success: true, total: 0, fetched: 0, skipped: 0, errors: [] };
	const client = new RawImapClient(payload);

	try {
		await client.connect();
		result.total = await client.loginAndSelect();
		const search = await client.command('UID SEARCH ALL');
		const uids = parseSearchUids(search.lines);
		const targetUids = limit > 0 ? uids.slice(-limit) : uids;

		for (const uid of targetUids) {
			if (known.has(uid)) {
				result.skipped += 1;
				continue;
			}
			const response = await client.command(`UID FETCH ${uid} (UID RFC822.SIZE BODY.PEEK[])`);
			const body = response.literals[0]?.literal;
			if (!body) {
				result.errors.push({ uid, error: 'IMAP_EMPTY_MESSAGE' });
				continue;
			}
			await ingestRawMail({
				externalAccountId: payload.externalAccountId,
				protocol: 'IMAP',
				mailbox: payload.imap.mailbox || 'INBOX',
				uid,
				uidl: '',
				messageId: messageIdFromRaw(body),
				raw: body.toString('base64')
			});
			result.fetched += 1;
		}
	} finally {
		await client.logout();
	}

	return result;
}

function readLine(socket, timeout = 30000) {
	return new Promise((resolve, reject) => {
		let buffer = '';
		const timer = setTimeout(() => cleanup(new Error('POP3_TIMEOUT')), timeout);
		const onData = (chunk) => {
			buffer += chunk.toString('binary');
			const index = buffer.indexOf('\r\n');
			if (index >= 0) {
				const line = buffer.slice(0, index);
				cleanup(null, line);
			}
		};
		const cleanup = (error, line) => {
			clearTimeout(timer);
			socket.off('data', onData);
			socket.off('error', cleanup);
			error ? reject(error) : resolve(line);
		};
		socket.on('data', onData);
		socket.once('error', cleanup);
	});
}

function readMulti(socket, timeout = 30000) {
	return new Promise((resolve, reject) => {
		let buffer = '';
		const timer = setTimeout(() => cleanup(new Error('POP3_TIMEOUT')), timeout);
		const onData = (chunk) => {
			buffer += chunk.toString('binary');
			if (buffer.includes('\r\n.\r\n')) {
				cleanup(null, buffer.slice(0, buffer.indexOf('\r\n.\r\n')));
			}
		};
		const cleanup = (error, data) => {
			clearTimeout(timer);
			socket.off('data', onData);
			socket.off('error', cleanup);
			error ? reject(error) : resolve(data);
		};
		socket.on('data', onData);
		socket.once('error', cleanup);
	});
}

async function popCommand(socket, command, multi = false) {
	socket.write(`${command}\r\n`, 'binary');
	const data = multi ? await readMulti(socket) : await readLine(socket);
	if (!data.startsWith('+OK')) {
		throw new Error(data);
	}
	return data;
}

async function withPop3Socket(payload, fn) {
	const pop3 = payload.pop3;
	const socket = await createSocksSocket(payload.proxy, pop3.host, pop3.port);
	const conn = pop3.secure === false
		? (socket || net.connect(Number(pop3.port || 110), pop3.host))
		: tls.connect({
			host: pop3.host,
			port: Number(pop3.port || 995),
			socket: socket || undefined,
			servername: pop3.host
		});

	await readLine(conn);
	await popCommand(conn, `USER ${pop3.username}`);
	await popCommand(conn, `PASS ${pop3.password}`);

	try {
		return await fn(conn);
	} finally {
		await popCommand(conn, 'QUIT').catch(() => {});
		conn.end();
	}
}

async function testPop3(payload) {
	return withPop3Socket(payload, async (socket) => {
		const stat = await popCommand(socket, 'STAT');
		const [, total] = stat.split(/\s+/);
		await popCommand(socket, 'UIDL', true);
		return {
			success: true,
			protocol: 'POP3',
			total: Number(total || 0)
		};
	});
}

async function fetchPop3(payload) {
	const known = new Set((payload.knownUidls || []).map(String));
	const limit = normalizeLimit(payload.limit);
	const result = { success: true, total: 0, fetched: 0, skipped: 0, errors: [] };

	await withPop3Socket(payload, async (socket) => {
		const stat = await popCommand(socket, 'STAT');
		const [, total] = stat.split(/\s+/);
		result.total = Number(total || 0);
		const uidlResp = await popCommand(socket, 'UIDL', true);
		const uidls = uidlResp.split('\r\n')
			.slice(1)
			.map(line => line.trim().split(/\s+/))
			.filter(parts => parts.length >= 2)
			.map(([index, uidl]) => ({ index: Number(index), uidl }));

		const targetUidls = limit > 0 ? uidls.slice(-limit) : uidls;
		for (const item of targetUidls) {
			if (known.has(item.uidl)) {
				result.skipped += 1;
				continue;
			}
			const rawResp = await popCommand(socket, `RETR ${item.index}`, true);
			const raw = rawResp.split('\r\n').slice(1).join('\r\n');
			await ingestRawMail({
				externalAccountId: payload.externalAccountId,
				protocol: 'POP3',
				mailbox: '',
				uid: '',
				uidl: item.uidl,
				messageId: '',
				raw: Buffer.from(raw, 'binary').toString('base64')
			});
			result.fetched += 1;
		}
	});

	return result;
}

async function ingestRawMail(payload) {
	if (!process.env.WORKER_BASE_URL) {
		throw new Error('WORKER_BASE_URL is not configured');
	}
	const res = await fetch(`${process.env.WORKER_BASE_URL.replace(/\/$/, '')}/api/internal/externalMail/ingest`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-internal-token': process.env.INTERNAL_TOKEN || ''
		},
		body: JSON.stringify(payload)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || data.code !== 200) {
		throw new Error(data.message || 'INGEST_FAILED');
	}
	return data.data;
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);
	const startedAt = Date.now();
	const logRequest = (status, extra = {}) => {
		console.log(JSON.stringify({
			event: 'request',
			method: req.method,
			path: url.pathname,
			status,
			durationMs: Date.now() - startedAt,
			...extra
		}));
	};
	if (req.method === 'GET' && url.pathname === '/healthz') {
		json(res, 200, { success: true });
		logRequest(200);
		return;
	}

	if (req.method !== 'POST' || !['/sync/test', '/sync/fetch'].includes(url.pathname)) {
		json(res, 404, { success: false, error: 'Not Found' });
		logRequest(404);
		return;
	}

	const unauthorized = assertInternalToken(req);
	if (unauthorized) {
		json(res, unauthorized.status, unauthorized);
		logRequest(unauthorized.status, { error: unauthorized.error });
		return;
	}

	let payload = {};
	let protocol = '';
	try {
		payload = await readJson(req);
		protocol = normalizeProtocol(payload.protocol);
		const data = url.pathname === '/sync/test'
			? (protocol === 'POP3' ? await testPop3(payload) : await testImap(payload))
			: (protocol === 'POP3' ? await fetchPop3(payload) : await fetchImap(payload));
		safeJson(res, 200, data);
		logRequest(200, { protocol, externalAccountId: payload.externalAccountId });
	} catch (error) {
		if (isClientAbortError(error)) {
			logRequest(499, { protocol, externalAccountId: payload.externalAccountId, error: error.code || error.message });
			return;
		}
		const code = mapError(error, protocol);
		console.warn(JSON.stringify({ code, protocol, externalAccountId: payload.externalAccountId }));
		safeJson(res, 500, { success: false, error: code, message: code });
		logRequest(500, { protocol, externalAccountId: payload.externalAccountId, error: code });
	}
});

server.listen(PORT, () => {
	console.log(`external mail sync service started on ${PORT}`);
});
