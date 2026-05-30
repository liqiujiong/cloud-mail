import orm from '../entity/orm';
import externalAccount from '../entity/external-account';
import externalMailUid from '../entity/external-mail-uid';
import { and, count, desc, eq } from 'drizzle-orm';
import { emailConst, externalAccountConst, isDel } from '../const/entity-const';
import BizError from '../error/biz-error';
import secretCryptoUtils from '../utils/secret-crypto-utils';
import mailReceiveService from './mail-receive-service';
import settingService from './setting-service';
import userService from './user-service';
import roleService from './role-service';
import dayjs from 'dayjs';

const LOCK_MINUTES = 30;
const decoder = new TextDecoder();

function base64ToString(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return decoder.decode(bytes);
}

function normalizeProtocol(protocol) {
	return String(protocol || '').toUpperCase();
}

function sanitize(row) {
	if (!row) {
		return row;
	}
	const data = { ...row };
	delete data.passwordEncrypted;
	delete data.proxyPasswordEncrypted;
	data.hasPassword = row.passwordEncrypted ? 1 : 0;
	data.hasProxyPassword = row.proxyPasswordEncrypted ? 1 : 0;
	return data;
}

function sourceTypeByProtocol(protocol) {
	return normalizeProtocol(protocol) === externalAccountConst.protocol.POP3
		? emailConst.sourceType.EXTERNAL_POP3
		: emailConst.sourceType.EXTERNAL_IMAP;
}

async function toNodePayload(c, row, limit) {
	const password = await secretCryptoUtils.decrypt(c, row.passwordEncrypted);
	const proxyPassword = await secretCryptoUtils.decrypt(c, row.proxyPasswordEncrypted);
	const protocol = normalizeProtocol(row.protocol);
	const payload = {
		externalAccountId: row.externalAccountId,
		protocol,
		limit,
		imap: {
			host: row.imapHost,
			port: row.imapPort,
			secure: !!row.imapSecure,
			mailbox: row.imapMailbox || 'INBOX',
			username: row.username,
			password
		},
		pop3: {
			host: row.popHost,
			port: row.popPort,
			secure: !!row.popSecure,
			username: row.username,
			password
		},
		proxy: {
			type: row.proxyType || 'SOCKS5',
			host: row.proxyHost,
			port: row.proxyPort,
			username: row.proxyUsername,
			password: proxyPassword
		}
	};

	if (protocol === externalAccountConst.protocol.IMAP) {
		payload.knownUids = await externalAccountService.knownUids(c, row.externalAccountId, row.imapMailbox || 'INBOX');
	} else {
		payload.knownUidls = await externalAccountService.knownUidls(c, row.externalAccountId);
	}

	return payload;
}

async function callSyncService(c, path, payload) {
	if (!c.env.external_mail_sync_url) {
		throw new BizError('external_mail_sync_url is not configured');
	}

	const url = c.env.external_mail_sync_url.replace(/\/$/, '') + path;
	let res;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-token': c.env.external_mail_internal_token || ''
			},
			body: JSON.stringify(payload)
		});
	} catch (e) {
		throw new BizError(`external sync service request failed: ${e.message || e.name || 'fetch failed'}`);
	}
	const text = await res.text().catch(() => '');
	let data = {};
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = {};
	}
	if (!res.ok || data.success === false) {
		const detail = text && !data.message && !data.error
			? `: ${text.slice(0, 160)}`
			: '';
		throw new BizError(data.message || data.error || `external sync service failed: HTTP ${res.status}${detail}`);
	}
	return data;
}

const externalAccountService = {
	async list(c, params, userId) {
		const userRow = c.get('user');
		const conditions = [eq(externalAccount.isDel, isDel.NORMAL)];
		if (userRow.email !== c.env.admin) {
			conditions.push(eq(externalAccount.userId, userId));
		}
		if (params.protocol) {
			conditions.push(eq(externalAccount.protocol, normalizeProtocol(params.protocol)));
		}
		const list = await orm(c).select().from(externalAccount).where(and(...conditions)).orderBy(desc(externalAccount.externalAccountId)).all();
		return list.map(sanitize);
	},

	async detail(c, externalAccountId, userId) {
		const row = await orm(c).select().from(externalAccount).where(and(
			eq(externalAccount.externalAccountId, Number(externalAccountId)),
			eq(externalAccount.isDel, isDel.NORMAL)
		)).get();
		if (!row) {
			throw new BizError('External account does not exist');
		}
		const userRow = c.get('user');
		if (userRow.email !== c.env.admin && row.userId !== userId) {
			throw new BizError('Unauthorized', 403);
		}
		return row;
	},

	async add(c, params, userId) {
		const protocol = normalizeProtocol(params.protocol);
		if (![externalAccountConst.protocol.IMAP, externalAccountConst.protocol.POP3].includes(protocol)) {
			throw new BizError('Protocol must be IMAP or POP3');
		}
		if (!params.password) {
			throw new BizError('Password is required');
		}
		await this.checkAccountLimit(c, userId);
		const data = await this.toSaveData(c, params, userId);
		const row = await orm(c).insert(externalAccount).values(data).returning().get();
		return sanitize(row);
	},

	async checkAccountLimit(c, userId) {
		const userRow = await userService.selectById(c, userId);
		if (userRow.email === c.env.admin) {
			return;
		}
		const roleRow = await roleService.selectById(c, userRow.type);
		if (!roleRow.externalAccountCount || roleRow.externalAccountCount <= 0) {
			return;
		}
		const totalRow = await orm(c).select({ total: count() }).from(externalAccount).where(and(
			eq(externalAccount.userId, userId),
			eq(externalAccount.isDel, isDel.NORMAL)
		)).get();
		if (totalRow.total >= roleRow.externalAccountCount) {
			throw new BizError('外部邮箱账号数量已达上限', 403);
		}
	},

	async update(c, params, userId) {
		const row = await this.detail(c, params.externalAccountId, userId);
		const data = await this.toSaveData(c, params, row.userId, row);
		data.updateTime = dayjs().format('YYYY-MM-DD HH:mm:ss');
		await orm(c).update(externalAccount).set(data).where(eq(externalAccount.externalAccountId, row.externalAccountId)).run();
		return sanitize(await this.detail(c, row.externalAccountId, row.userId));
	},

	async toSaveData(c, params, userId, oldRow = null) {
		return {
			userId,
			name: params.name || params.email,
			email: params.email,
			protocol: normalizeProtocol(params.protocol),
			imapHost: params.imapHost || '',
			imapPort: Number(params.imapPort || 993),
			imapSecure: params.imapSecure ? 1 : 0,
			imapMailbox: params.imapMailbox || 'INBOX',
			popHost: params.popHost || '',
			popPort: Number(params.popPort || 995),
			popSecure: params.popSecure ? 1 : 0,
			username: params.username || params.email,
			passwordEncrypted: params.password ? await secretCryptoUtils.encrypt(c, params.password) : (oldRow?.passwordEncrypted || ''),
			proxyType: 'SOCKS5',
			proxyHost: params.proxyHost || '',
			proxyPort: Number(params.proxyPort || 0),
			proxyUsername: params.proxyUsername || '',
			proxyPasswordEncrypted: params.proxyPassword ? await secretCryptoUtils.encrypt(c, params.proxyPassword) : (oldRow?.proxyPasswordEncrypted || ''),
			status: params.status || oldRow?.status || externalAccountConst.status.NORMAL
		};
	},

	async delete(c, params, userId) {
		const row = await this.detail(c, params.externalAccountId, userId);
		await orm(c).update(externalAccount).set({
			isDel: isDel.DELETE,
			updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(externalAccount.externalAccountId, row.externalAccountId)).run();
	},

	async test(c, params, userId) {
		const row = params.externalAccountId
			? await this.detail(c, params.externalAccountId, userId)
			: { ...(await this.toSaveData(c, params, userId)), externalAccountId: 0 };
		const payload = await toNodePayload(c, row, 1);
		const data = await callSyncService(c, '/sync/test', payload);
		if (row.externalAccountId) {
			await orm(c).update(externalAccount).set({
				status: externalAccountConst.status.NORMAL,
				lastErrorCode: '',
				lastError: '',
				updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
			}).where(eq(externalAccount.externalAccountId, row.externalAccountId)).run();
		}
		return data;
	},

	async sync(c, params, userId) {
		const row = await this.detail(c, params.externalAccountId, userId);
		if (row.status === externalAccountConst.status.DISABLED) {
			throw new BizError('External account is disabled');
		}
		const locked = row.syncing && row.syncLockTime && dayjs().diff(dayjs(row.syncLockTime), 'minute') < LOCK_MINUTES;
		if (locked) {
			throw new BizError('MAILBOX_LOCKED');
		}

		await orm(c).update(externalAccount).set({
			syncing: 1,
			syncLockTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
			updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(externalAccount.externalAccountId, row.externalAccountId)).run();

		try {
			const limit = Math.min(Number(params.limit || 50), 100);
			const payload = await toNodePayload(c, row, limit);
			const data = await callSyncService(c, '/sync/fetch', payload);
			await this.updateSyncResult(c, row.externalAccountId, {
				success: true,
				result: `新增 ${data.fetched || 0} 封，跳过 ${data.skipped || 0} 封。`
			});
			return data;
		} catch (e) {
			await this.updateSyncResult(c, row.externalAccountId, {
				success: false,
				errorCode: e.message,
				error: e.message
			});
			throw e;
		}
	},

	async updateSyncResult(c, externalAccountId, result) {
		await orm(c).update(externalAccount).set({
			syncing: 0,
			syncLockTime: null,
			lastSyncTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
			lastSyncResult: result.result || '',
			lastErrorCode: result.success ? '' : (result.errorCode || 'UNKNOWN_ERROR'),
			lastError: result.success ? '' : (result.error || ''),
			status: result.success ? externalAccountConst.status.NORMAL : externalAccountConst.status.SYNC_FAILED,
			updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(externalAccount.externalAccountId, Number(externalAccountId))).run();
	},

	async knownUids(c, externalAccountId, mailbox) {
		const rows = await orm(c).select({ uid: externalMailUid.uid }).from(externalMailUid).where(and(
			eq(externalMailUid.externalAccountId, Number(externalAccountId)),
			eq(externalMailUid.protocol, externalAccountConst.protocol.IMAP),
			eq(externalMailUid.mailbox, mailbox || 'INBOX')
		)).all();
		return rows.map(item => item.uid);
	},

	async knownUidls(c, externalAccountId) {
		const rows = await orm(c).select({ uidl: externalMailUid.uidl }).from(externalMailUid).where(and(
			eq(externalMailUid.externalAccountId, Number(externalAccountId)),
			eq(externalMailUid.protocol, externalAccountConst.protocol.POP3)
		)).all();
		return rows.map(item => item.uidl);
	},

	async ingest(c, payload) {
		const row = await orm(c).select().from(externalAccount).where(and(
			eq(externalAccount.externalAccountId, Number(payload.externalAccountId)),
			eq(externalAccount.isDel, isDel.NORMAL)
		)).get();
		if (!row) {
			throw new BizError('External account does not exist');
		}

		const protocol = normalizeProtocol(payload.protocol || row.protocol);
		const mailbox = payload.mailbox || row.imapMailbox || '';
		const uid = String(payload.uid || '');
		const uidl = String(payload.uidl || '');
		const existsConditions = [
			eq(externalMailUid.externalAccountId, row.externalAccountId),
			eq(externalMailUid.protocol, protocol)
		];
		if (protocol === externalAccountConst.protocol.IMAP) {
			existsConditions.push(eq(externalMailUid.mailbox, mailbox));
			existsConditions.push(eq(externalMailUid.uid, uid));
		} else {
			existsConditions.push(eq(externalMailUid.uidl, uidl));
		}

		const existed = await orm(c).select().from(externalMailUid).where(and(...existsConditions)).get();
		if (existed) {
			return { skipped: true, emailId: existed.emailId };
		}

		const { r2Domain, aiCode, aiCodeFilter } = await settingService.query(c);
		const raw = base64ToString(payload.raw || '');
		const emailRow = await mailReceiveService.saveRawMail(c, raw, {
			userId: row.userId,
			accountId: 0,
			toEmail: row.email,
			isDel: isDel.NORMAL,
			status: emailConst.status.RECEIVE,
			sourceType: sourceTypeByProtocol(protocol),
			externalAccountId: row.externalAccountId,
			externalUid: protocol === externalAccountConst.protocol.IMAP ? uid : uidl,
			externalMailbox: mailbox,
			messageId: payload.messageId || '',
			syncTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}, { r2Domain, aiCode, aiCodeFilter });

		await orm(c).insert(externalMailUid).values({
			externalAccountId: row.externalAccountId,
			protocol,
			mailbox,
			uid,
			uidl,
			messageId: payload.messageId || emailRow.messageId || '',
			emailId: emailRow.emailId
		}).run();

		return { skipped: false, emailId: emailRow.emailId };
	}
};

export default externalAccountService;
