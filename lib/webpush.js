// /lib/webpush.js
// Pushberichten versturen zonder extra npm-pakket (07-10-2026). Volgt de
// standaarden: VAPID (RFC 8292) voor de afzender en aes128gcm (RFC 8291)
// voor de versleuteling. Werkt met Chrome/Android (FCM), Firefox en Safari
// (iPhone met de app op het beginscherm, iOS 16.4+).
//
// Env: VAPID_PUBLIC  (base64url, 65 bytes ongecomprimeerde P-256 sleutel)
//      VAPID_PRIVATE (base64url, 32 bytes "d")
// Sleutels maken: node -e "import('./lib/webpush.js').then(m=>console.log(m.maakSleutels()))"
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const vanB64u = (s) => Buffer.from(String(s), 'base64url');

export function maakSleutels() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { VAPID_PUBLIC: b64u(ecdh.getPublicKey()), VAPID_PRIVATE: b64u(ecdh.getPrivateKey()) };
}

function privateKeyObject(publicB64, privateB64) {
  const pub = vanB64u(publicB64);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateB64, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk'
  });
}

function vapidHeader(endpoint, publicB64, privateB64, contact) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${body}`), { key: privateKeyObject(publicB64, privateB64), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${body}.${b64u(sig)}, k=${publicB64}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Versleutel de inhoud voor één abonnement (RFC 8291, aes128gcm, één record).
export function versleutel(payload, keys) {
  const uaPublic = vanB64u(keys.p256dh);
  const authSecret = vanB64u(keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, enc]);
}

// Verstuur. Geeft { ok, status, weg } terug; weg = abonnement bestaat niet
// meer (404/410), dan moet de aanroeper het verwijderen.
export async function stuurPush(abonnement, bericht, { publicKey = process.env.VAPID_PUBLIC, privateKey = process.env.VAPID_PRIVATE, contact = 'mailto:info@michelkredercoaching.nl', ttl = 3 * 3600 } = {}) {
  if (!publicKey || !privateKey) return { ok: false, status: 0, fout: 'geen VAPID-sleutels' };
  if (!abonnement || !abonnement.endpoint || !abonnement.keys) return { ok: false, status: 0, fout: 'geen abonnement' };
  try {
    const body = versleutel(JSON.stringify(bericht), abonnement.keys);
    const r = await fetch(abonnement.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(abonnement.endpoint, publicKey, privateKey, contact),
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        TTL: String(ttl), Urgency: 'normal'
      },
      body,
      signal: AbortSignal.timeout(10000)
    });
    return { ok: r.ok, status: r.status, weg: r.status === 404 || r.status === 410 };
  } catch (e) { return { ok: false, status: 0, fout: String(e && e.message || e) }; }
}
