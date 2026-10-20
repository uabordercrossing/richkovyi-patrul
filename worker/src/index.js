import { SignJWT, importPKCS8 } from 'jose';

const FIREBASE_AUDIENCE =
	'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const MAX_AUTH_DATA_AGE_SECONDS = 24 * 60 * 60;

function corsHeaders(origin, allowedOrigin) {
	const headers = {
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};
	if (origin === allowedOrigin) {
		headers['Access-Control-Allow-Origin'] = allowedOrigin;
	}
	return headers;
}

function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

function toHex(buffer) {
	return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(keyData, message) {
	const key = await crypto.subtle.importKey(
		'raw',
		keyData,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

async function verifyTelegramInitData(initData, botToken) {
	const params = new URLSearchParams(initData);
	const hash = params.get('hash');
	if (!hash) return { ok: false, reason: 'missing hash' };
	params.delete('hash');

	const authDate = Number(params.get('auth_date'));
	if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_DATA_AGE_SECONDS) {
		return { ok: false, reason: 'stale auth_date' };
	}

	const dataCheckString = [...params.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');

	const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
	const computedHash = toHex(await hmacSha256(secretKey, dataCheckString));

	if (!timingSafeEqual(computedHash, hash)) {
		return { ok: false, reason: 'bad signature' };
	}

	const userJson = params.get('user');
	if (!userJson) return { ok: false, reason: 'missing user' };
	const user = JSON.parse(userJson);
	if (!user.id) return { ok: false, reason: 'missing user id' };

	return { ok: true, user };
}

async function createFirebaseCustomToken(serviceAccount, uid) {
	const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
	const now = Math.floor(Date.now() / 1000);

	return new SignJWT({
		uid,
		aud: FIREBASE_AUDIENCE,
	})
		.setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
		.setIssuer(serviceAccount.client_email)
		.setSubject(serviceAccount.client_email)
		.setIssuedAt(now)
		.setExpirationTime(now + 3600)
		.sign(privateKey);
}

export default {
	async fetch(request, env) {
		const origin = request.headers.get('Origin') || '';
		const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers });
		}

		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405, headers });
		}

		let body;
		try {
			body = await request.json();
		} catch {
			return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
				status: 400,
				headers: { ...headers, 'Content-Type': 'application/json' },
			});
		}

		const { initData } = body;
		if (!initData) {
			return new Response(JSON.stringify({ error: 'missing initData' }), {
				status: 400,
				headers: { ...headers, 'Content-Type': 'application/json' },
			});
		}

		const verification = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
		if (!verification.ok) {
			return new Response(JSON.stringify({ error: 'unauthorized', reason: verification.reason }), {
				status: 401,
				headers: { ...headers, 'Content-Type': 'application/json' },
			});
		}

		const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
		const uid = `tg_${verification.user.id}`;
		const token = await createFirebaseCustomToken(serviceAccount, uid);

		return new Response(JSON.stringify({ token, uid }), {
			headers: { ...headers, 'Content-Type': 'application/json' },
		});
	},
};
