import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const externalAccount = sqliteTable('external_account', {
	externalAccountId: integer('external_account_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	protocol: text('protocol').notNull(),
	imapHost: text('imap_host').default('').notNull(),
	imapPort: integer('imap_port').default(993).notNull(),
	imapSecure: integer('imap_secure').default(1).notNull(),
	imapMailbox: text('imap_mailbox').default('INBOX').notNull(),
	popHost: text('pop_host').default('').notNull(),
	popPort: integer('pop_port').default(995).notNull(),
	popSecure: integer('pop_secure').default(1).notNull(),
	username: text('username').notNull(),
	passwordEncrypted: text('password_encrypted').notNull(),
	proxyType: text('proxy_type').default('SOCKS5').notNull(),
	proxyHost: text('proxy_host').default('').notNull(),
	proxyPort: integer('proxy_port').default(0).notNull(),
	proxyUsername: text('proxy_username').default('').notNull(),
	proxyPasswordEncrypted: text('proxy_password_encrypted').default('').notNull(),
	status: text('status').default('normal').notNull(),
	lastSyncTime: text('last_sync_time'),
	lastSyncResult: text('last_sync_result').default('').notNull(),
	lastErrorCode: text('last_error_code').default('').notNull(),
	lastError: text('last_error').default('').notNull(),
	syncing: integer('syncing').default(0).notNull(),
	syncLockTime: text('sync_lock_time'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	isDel: integer('is_del').default(0).notNull()
});

export default externalAccount;
