import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { emailConst, isDel, roleConst } from '../const/entity-const';
import email from '../entity/email';
import externalAccount from '../entity/external-account';
import userService from './user-service';
import KvConst from '../const/kv-const';
import externalAccountService from './external-account-service';

async function ensureExternalOriginalEmailColumn(c) {
	try {
		await c.env.db.prepare(`ALTER TABLE external_account ADD COLUMN original_email TEXT NOT NULL DEFAULT '';`).run();
	} catch {
		// Column already exists on initialized databases.
	}
	try {
		await c.env.db.prepare(`UPDATE external_account SET original_email = email WHERE original_email = '';`).run();
	} catch {
		// Keep public endpoints available during rollout.
	}
}

const publicService = {

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel } = params

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		num = (num - 1) * size;

		let conditions = []

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`)
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async mailboxEmailList(c, params) {
		await ensureExternalOriginalEmailColumn(c);
		const mailboxEmail = String(params.email || '').trim();
		const size = Math.min(Math.max(Number(params.size || 5), 1), 50);
		const type = params.type ?? emailConst.type.RECEIVE;
		const mailIsDel = params.isDel ?? isDel.NORMAL;
		let externalAccountRow = null;

		if (!mailboxEmail) {
			throw new BizError('email is required');
		}

		externalAccountRow = await orm(c).select().from(externalAccount).where(and(
			sql`${externalAccount.email} COLLATE NOCASE = ${mailboxEmail}`,
			eq(externalAccount.isDel, isDel.NORMAL)
		)).get();

		if (!externalAccountRow) {
			externalAccountRow = await orm(c).select().from(externalAccount).where(and(
				sql`${externalAccount.originalEmail} COLLATE NOCASE = ${mailboxEmail}`,
				eq(externalAccount.isDel, isDel.NORMAL)
			)).get();
		}

		if (externalAccountRow) {
			c.set('user', { email: c.env.admin });
			try {
				await externalAccountService.sync(c, {
					externalAccountId: externalAccountRow.externalAccountId,
					limit: size
				}, 0);
			} catch (e) {
				if (e.message !== 'MAILBOX_LOCKED') {
					throw e;
				}
			}
		}

		const domains = Array.isArray(c.env.domain) ? c.env.domain : [c.env.domain];
		const isInternalMailbox = !externalAccountRow && domains.includes(emailUtils.getDomain(mailboxEmail));
		const mailbox = externalAccountRow ? {
			email: externalAccountRow.email,
			originalEmail: externalAccountRow.originalEmail || externalAccountRow.email,
			exists: true,
			type: 'external',
			source: 'external_account',
			externalAccountId: externalAccountRow.externalAccountId,
			name: externalAccountRow.name,
			remark: externalAccountRow.remark,
			protocol: externalAccountRow.protocol,
			status: externalAccountRow.status,
			lastSyncTime: externalAccountRow.lastSyncTime,
			lastSyncResult: externalAccountRow.lastSyncResult,
			lastErrorCode: externalAccountRow.lastErrorCode,
			lastError: externalAccountRow.lastError,
			isFavertive: externalAccountRow.isFavertive
		} : {
			email: mailboxEmail,
			exists: isInternalMailbox,
			type: isInternalMailbox ? 'internal' : 'not_found',
			source: isInternalMailbox ? 'cloudflare_routing' : 'none'
		};

		if (!mailbox.exists) {
			return {
				mailbox,
				emails: []
			};
		}

		const conditions = [
			eq(email.type, type),
			eq(email.isDel, mailIsDel)
		];

		if (externalAccountRow) {
			conditions.push(eq(email.externalAccountId, externalAccountRow.externalAccountId));
		} else {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE = ${mailboxEmail}`);
		}

		const query = orm(c).select({
			emailId: email.emailId,
			sendEmail: email.sendEmail,
			sendName: email.name,
			subject: email.subject,
			toEmail: email.toEmail,
			toName: email.toName,
			type: email.type,
			createTime: email.createTime,
			content: email.content,
			text: email.text,
			isDel: email.isDel,
			sourceType: email.sourceType,
			externalAccountId: email.externalAccountId,
			externalMailbox: email.externalMailbox,
			syncTime: email.syncTime
		}).from(email).where(and(...conditions));

		if (params.timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return {
			mailbox,
			emails: await query.limit(size)
		};
	},

	async addUser(c, params) {
		const { list } = params;

		if (list.length === 0) return;

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			const { salt, hash } = await saltHashUtils.hashPassword(
				emailRow.password || cryptoUtils.genRandomPwd()
			);

			emailRow.salt = salt;
			emailRow.hash = hash;
		}


		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const userList = [];

		for (const emailRow of list) {
			let { email, hash, salt, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			const userSql = `INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
			VALUES ('${email}', '${hash}', '${salt}', '${type}', '${os}', '${browser}', '${activeIp}', '${activeIp}', '${device}', '${activeTime}', '${activeTime}')`

			const accountSql = `INSERT INTO account (email, name, user_id)
			VALUES ('${email}', '${emailUtils.getName(email)}', 0);`;

			userList.push(c.env.db.prepare(userSql));
			userList.push(c.env.db.prepare(accountSql));

		}

		userList.push(c.env.db.prepare(`UPDATE account SET user_id = (SELECT user_id FROM user WHERE user.email = account.email) WHERE user_id = 0;`))

		try {
			await c.env.db.batch(userList);
		} catch (e) {
			if(e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password } = params

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (email !== c.env.admin) {
			throw new BizError(t('notAdmin'));
		}

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	}

}

export default publicService
