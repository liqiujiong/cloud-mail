import { ImapFlow } from 'imapflow';
import { SocksClient } from 'socks';
import tls from 'node:tls';
import net from 'node:net';
import http from 'node:http';

const PORT = Number(process.env.PORT || 8788);
const MAX_LIMIT = 100;

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
		auth: {
			user: imap.username,
			pass: imap.password
		},
		proxy: proxyUrl(payload.proxy),
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
	const known = new Set((payload.knownUids || []).map(String));
	const limit = Math.min(Number(payload.limit || 50), MAX_LIMIT);
	const result = { success: true, total: 0, fetched: 0, skipped: 0, errors: [] };

	await withImapClient(payload, async (client) => {
		const mailbox = await client.mailboxOpen(payload.imap.mailbox || 'INBOX');
		result.total = mailbox.exists;
		const start = Math.max(1, mailbox.exists - limit + 1);
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
	const limit = Math.min(Number(payload.limit || 50), MAX_LIMIT);
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

		for (const item of uidls.slice(-limit)) {
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

	const payload = await readJson(req);
	const protocol = normalizeProtocol(payload.protocol);
	try {
		const data = url.pathname === '/sync/test'
			? (protocol === 'POP3' ? await testPop3(payload) : await testImap(payload))
			: (protocol === 'POP3' ? await fetchPop3(payload) : await fetchImap(payload));
		json(res, 200, data);
		logRequest(200, { protocol, externalAccountId: payload.externalAccountId });
	} catch (error) {
		const code = mapError(error, protocol);
		console.warn(JSON.stringify({ code, protocol, externalAccountId: payload.externalAccountId }));
		json(res, 500, { success: false, error: code, message: code });
		logRequest(500, { protocol, externalAccountId: payload.externalAccountId, error: code });
	}
});

server.listen(PORT, () => {
	console.log(`external mail sync service started on ${PORT}`);
});
