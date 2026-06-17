// /lib/gate.js
// Gedeelde versleuteling voor de "server-side gate". De volledige analyse gaat
// VERSLEUTELD naar de browser; pas na een bij Mollie bevestigde betaling wordt
// 'ie vrijgegeven. Eén plek voor seal/unseal, zodat de sleutel-check niet meer
// gekopieerd staat over drie bestanden.
import crypto from 'node:crypto';

// PUNT 5 — GATE_SECRET hard laten falen.
// Zonder GATE_SECRET zou de sleutel sha256('') zijn: een publiek bekende
// constante, waarmee de versleuteling waardeloos is. Daarom: ontbreekt 'ie,
// dan gooien we een fout i.p.v. stil door te draaien. (De aanroepende routes
// vangen dit netjes af → de bezoeker krijgt een foutmelding, geen onveilige blob.)
function _key() {
  const s = process.env.GATE_SECRET || '';
  if (!s) {
    throw new Error('GATE_SECRET ontbreekt. Zet een willekeurige geheime string (min. 32 tekens) in Vercel.');
  }
  if (s.length < 24) {
    console.warn('GATE_SECRET is kort (<24 tekens). Gebruik liever een willekeurige string van 32+ tekens.');
  }
  return crypto.createHash('sha256').update(s).digest();
}

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const ci = crypto.createCipheriv('aes-256-gcm', _key(), iv);
  const e = Buffer.concat([ci.update(JSON.stringify(obj), 'utf8'), ci.final()]);
  const t = ci.getAuthTag();
  return Buffer.concat([iv, t, e]).toString('base64url');
}

export function unseal(blob) {
  const b = Buffer.from(String(blob), 'base64url');
  const iv = b.subarray(0, 12), t = b.subarray(12, 28), e = b.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', _key(), iv);
  d.setAuthTag(t);
  return JSON.parse(Buffer.concat([d.update(e), d.final()]).toString('utf8'));
}

// PUNT 6 — unieke binding-sleutel per analyse. Wordt in de blob gestopt
// (strava-callback) én in de Mollie-metadata (betaling), en vergeleken in de
// gate (rapport). Zo hoort elke betaling bij precies één analyse.
export function nieuweNonce() {
  return crypto.randomBytes(16).toString('base64url'); // ~22 tekens
}
