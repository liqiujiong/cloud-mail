import BizError from '../error/biz-error.js';

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const MAX_DELTA_PAGES = 200;
const MAX_MIME_BYTES = 20 * 1024 * 1024;

function graphErrorMessage(data, status) {
	const code = data?.error?.code || data?.error || `HTTP_${status}`;
	const message = data?.error?.message || data?.error_description || 'Microsoft Graph request failed';
	return `MICROSOFT_GRAPH_${code}: ${message}`;
}

async function throwGraphError(response) {
	const text = await response.text().catch(() => '');
	let data = {};
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = {};
	}
	const error = new BizError(graphErrorMessage(data, response.status));
	error.remoteStatus = response.status;
	throw error;
}

async function fetchJson(url, accessToken) {
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!response.ok) {
		await throwGraphError(response);
	}
	return response.json();
}

async function readBoundedBody(response) {
	const contentLength = Number(response.headers.get('content-length') || 0);
	if (contentLength > MAX_MIME_BYTES) {
		throw new BizError('MICROSOFT_GRAPH_MESSAGE_TOO_LARGE');
	}
	if (!response.body) {
		return new Uint8Array();
	}

	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		total += value.byteLength;
		if (total > MAX_MIME_BYTES) {
			await reader.cancel();
			throw new BizError('MICROSOFT_GRAPH_MESSAGE_TOO_LARGE');
		}
		chunks.push(value);
	}

	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

const microsoftGraphMailService = {
	async authenticate(account) {
		if (!account.microsoftClientId || !account.microsoftRefreshToken) {
			throw new BizError('Microsoft Client ID and OAuth refresh token are required');
		}
		const response = await fetch(TOKEN_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: account.microsoftClientId,
				grant_type: 'refresh_token',
				refresh_token: account.microsoftRefreshToken
			})
		});
		if (!response.ok) {
			await throwGraphError(response);
		}
		const data = await response.json();
		if (!data.access_token) {
			throw new BizError('MICROSOFT_GRAPH_ACCESS_TOKEN_MISSING');
		}
		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token || account.microsoftRefreshToken
		};
	},

	async testConnection(account, accessToken) {
		const [profile, inbox] = await Promise.all([
			fetchJson(`${GRAPH_BASE_URL}/me?$select=mail,userPrincipalName`, accessToken),
			fetchJson(`${GRAPH_BASE_URL}/me/mailFolders/inbox?$select=displayName,totalItemCount`, accessToken)
		]);
		const expected = String(account.email || '').trim().toLowerCase();
		const addresses = [profile.mail, profile.userPrincipalName]
			.filter(Boolean)
			.map(value => String(value).toLowerCase());
		if (expected && !addresses.includes(expected)) {
			throw new BizError('MICROSOFT_GRAPH_ACCOUNT_MISMATCH');
		}
		return {
			success: true,
			protocol: 'MICROSOFT_GRAPH',
			total: Number(inbox.totalItemCount || 0),
			mailbox: inbox.displayName || 'Inbox'
		};
	},

	async listInboxChanges(accessToken, deltaLink = '') {
		let nextUrl = deltaLink || `${GRAPH_BASE_URL}/me/mailFolders/inbox/messages/delta?$top=50&$select=id,internetMessageId,receivedDateTime`;
		let pageCount = 0;
		const messages = [];
		let nextDeltaLink = '';

		while (nextUrl) {
			pageCount += 1;
			if (pageCount > MAX_DELTA_PAGES) {
				throw new BizError('MICROSOFT_GRAPH_DELTA_PAGE_LIMIT');
			}
			const data = await fetchJson(nextUrl, accessToken);
			for (const item of data.value || []) {
				if (item.id && !item['@removed']) {
					messages.push(item);
				}
			}
			nextDeltaLink = data['@odata.deltaLink'] || nextDeltaLink;
			nextUrl = data['@odata.nextLink'] || '';
		}

		if (!nextDeltaLink) {
			throw new BizError('MICROSOFT_GRAPH_DELTA_LINK_MISSING');
		}
		return { messages, deltaLink: nextDeltaLink };
	},

	async listInboxMessages(accessToken, limit = 0) {
		const pageSize = limit > 0 ? Math.min(limit, 50) : 50;
		let nextUrl = `${GRAPH_BASE_URL}/me/mailFolders/inbox/messages?$top=${pageSize}&$select=id,internetMessageId,receivedDateTime&$orderby=receivedDateTime%20desc`;
		let pageCount = 0;
		const messages = [];

		while (nextUrl) {
			pageCount += 1;
			if (pageCount > MAX_DELTA_PAGES) {
				throw new BizError('MICROSOFT_GRAPH_MESSAGE_PAGE_LIMIT');
			}
			const data = await fetchJson(nextUrl, accessToken);
			messages.push(...(data.value || []).filter(item => item.id));
			if (limit > 0 && messages.length >= limit) {
				break;
			}
			nextUrl = data['@odata.nextLink'] || '';
		}

		return limit > 0 ? messages.slice(0, limit) : messages;
	},

	async downloadMime(accessToken, messageId) {
		const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(messageId)}/$value`, {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
		if (!response.ok) {
			await throwGraphError(response);
		}
		return readBoundedBody(response);
	}
};

export default microsoftGraphMailService;
