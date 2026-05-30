const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function base64ToBytes(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function importKey(secret) {
	const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
	return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

const secretCryptoUtils = {
	getSecret(c) {
		return c.env.external_mail_crypto_key || c.env.jwt_secret;
	},

	async encrypt(c, value = '') {
		if (!value) {
			return '';
		}
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const key = await importKey(this.getSecret(c));
		const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
		const bytes = new Uint8Array(iv.length + encrypted.byteLength);
		bytes.set(iv, 0);
		bytes.set(new Uint8Array(encrypted), iv.length);
		return bytesToBase64(bytes);
	},

	async decrypt(c, value = '') {
		if (!value) {
			return '';
		}
		const bytes = base64ToBytes(value);
		const iv = bytes.slice(0, 12);
		const data = bytes.slice(12);
		const key = await importKey(this.getSecret(c));
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
		return decoder.decode(decrypted);
	}
};

export default secretCryptoUtils;
