import app from '../hono/hono';
import result from '../model/result';
import BizError from '../error/biz-error';
import externalAccountService from '../service/external-account-service';

function checkInternalToken(c) {
	const token = c.req.header('x-internal-token');
	if (!c.env.external_mail_internal_token || token !== c.env.external_mail_internal_token) {
		throw new BizError('Unauthorized', 401);
	}
}

async function ingest(c) {
	checkInternalToken(c);
	const data = await externalAccountService.ingest(c, await c.req.json());
	return c.json(result.ok(data));
}

async function syncResult(c) {
	checkInternalToken(c);
	const params = await c.req.json();
	await externalAccountService.updateSyncResult(c, params.externalAccountId, params);
	return c.json(result.ok());
}

app.post('/internal/externalMail/ingest', ingest);
app.post('/internal/external-mail/ingest', ingest);
app.post('/internal/externalMail/syncResult', syncResult);
app.post('/internal/external-mail/sync-result', syncResult);
