import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const externalMailUid = sqliteTable('external_mail_uid', {
	externalMailUidId: integer('external_mail_uid_id').primaryKey({ autoIncrement: true }),
	externalAccountId: integer('external_account_id').notNull(),
	protocol: text('protocol').notNull(),
	mailbox: text('mailbox').default('').notNull(),
	uid: text('uid').default('').notNull(),
	uidl: text('uidl').default('').notNull(),
	messageId: text('message_id').default('').notNull(),
	emailId: integer('email_id').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
});

export default externalMailUid;
