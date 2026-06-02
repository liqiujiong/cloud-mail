import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import externalAccountService from '../service/external-account-service';

async function list(c) {
	const data = await externalAccountService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
}

async function add(c) {
	const data = await externalAccountService.add(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
}

async function update(c) {
	const data = await externalAccountService.update(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
}

async function remove(c) {
	await externalAccountService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
}

async function test(c) {
	const data = await externalAccountService.test(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
}

async function sync(c) {
	const data = await externalAccountService.sync(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
}

async function favertive(c) {
	const data = await externalAccountService.setFavertive(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
}

async function favertiveBatch(c) {
	const data = await externalAccountService.setFavertiveBatch(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
}

async function exportAccounts(c) {
	const data = await externalAccountService.export(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
}

app.get('/externalAccount/list', list);
app.post('/externalAccount/add', add);
app.put('/externalAccount/update', update);
app.delete('/externalAccount/delete', remove);
app.post('/externalAccount/test', test);
app.post('/externalAccount/sync', sync);
app.post('/externalAccount/favertive', favertive);
app.post('/externalAccount/favertiveBatch', favertiveBatch);
app.post('/externalAccount/export', exportAccounts);

app.get('/external-account/list', list);
app.post('/external-account/add', add);
app.put('/external-account/update', update);
app.delete('/external-account/delete', remove);
app.post('/external-account/test', test);
app.post('/external-account/sync', sync);
app.post('/external-account/favertive', favertive);
app.post('/external-account/favertive-batch', favertiveBatch);
app.post('/external-account/export', exportAccounts);
