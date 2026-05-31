import PostalMime from 'postal-mime';
import constant from '../const/constant';
import { emailConst, isDel } from '../const/entity-const';
import aiService from './ai-service';
import attService from './att-service';
import emailService from './email-service';
import fileUtils from '../utils/file-utils';
import emailUtils from '../utils/email-utils';

function toDbDate(value) {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return date.toISOString().slice(0, 19).replace('T', ' ');
}

const mailReceiveService = {
	async saveParsedMail(c, parsedMail, sourceMeta, options = {}) {
		const { r2Domain, aiCode, aiCodeFilter } = options;
		const toEmail = sourceMeta.toEmail || parsedMail.to?.[0]?.address || '';
		const toName = parsedMail.to?.find(item => item.address === toEmail)?.name || emailUtils.getName(toEmail);
		const code = await aiService.extractCode(c, parsedMail, { aiCode, aiCodeFilter });

		const params = {
			toEmail,
			toName,
			sendEmail: parsedMail.from?.address || '',
			name: parsedMail.from?.name || emailUtils.getName(parsedMail.from?.address),
			subject: parsedMail.subject,
			code,
			content: parsedMail.html,
			text: parsedMail.text,
			cc: parsedMail.cc ? JSON.stringify(parsedMail.cc) : '[]',
			bcc: parsedMail.bcc ? JSON.stringify(parsedMail.bcc) : '[]',
			recipient: JSON.stringify(parsedMail.to || []),
			inReplyTo: parsedMail.inReplyTo,
			relation: parsedMail.references,
			messageId: sourceMeta.messageId || parsedMail.messageId || '',
			userId: sourceMeta.userId || 0,
			accountId: sourceMeta.accountId || 0,
			isDel: sourceMeta.isDel ?? isDel.DELETE,
			status: sourceMeta.status ?? emailConst.status.SAVING,
			sourceType: sourceMeta.sourceType || emailConst.sourceType.CLOUDFLARE_ROUTING,
			externalAccountId: sourceMeta.externalAccountId || 0,
			externalUid: sourceMeta.externalUid || '',
			externalMailbox: sourceMeta.externalMailbox || '',
			syncTime: sourceMeta.syncTime || null,
			createTime: sourceMeta.createTime || toDbDate(parsedMail.date)
		};

		const attachments = [];
		const cidAttachments = [];

		for (let item of parsedMail.attachments || []) {
			let attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) {
				cidAttachments.push(attachment);
			}
		}

		let emailRow = await emailService.receive(c, params, cidAttachments, r2Domain);

		attachments.forEach(attachment => {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		});

		try {
			if (attachments.length > 0) {
				await attService.addAtt(c, attachments);
			}
		} catch (e) {
			console.error(e);
		}

		return emailRow;
	},

	async saveRawMail(c, raw, sourceMeta, options = {}) {
		const parsedMail = await PostalMime.parse(raw);
		return this.saveParsedMail(c, parsedMail, sourceMeta, options);
	}
};

export default mailReceiveService;
