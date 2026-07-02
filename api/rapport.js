// /api/rapport.js
// Geeft de ontsleutelde analyse ALLEEN terug na een bij Mollie bevestigde
// betaling. Dit is de echte poort: zonder een 'paid' payment-id én een
// kloppende binding komt er geen FTP, geen zones en geen rapport de browser in.
import { unseal } from '../lib/gate.js';
import crypto from 'node:crypto';

// Zelfde handtekening-sleutel als de webhook + het WordPress-snippet.
const PP_SECRET = process.env.PP_TOKEN_SECRET || '';
function maakToken(email) {
  if (!PP_SECRET || !email) return { token: '', deadlineNL: '' };
  const exp = Date.now() + 4 * 24 * 3600 * 1000;         // 4 dagen geldig (buffer)
  const payload = `${String(email).toLowerCase()}|${exp}`;
  const sig = crypto.createHmac('sha256', PP_SECRET).update(payload).digest('hex').slice(0, 16);
  const token = Buffer.from(`${payload}|${sig}`).toString('base64url');
  const deadlineNL = new Date(Date.now() + 72 * 3600 * 1000)  // in de tekst tonen we 72 uur
    .toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return { token, deadlineNL };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { blob, pid } = req.body || {};
  if (!blob || !pid) return res.status(400).json({ error: 'Ontbrekende gegevens' });

  try {
    // 1) Verifieer bij Mollie dat dit echt een betaalde transactie is.
    const mr = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(pid)}`, {
      headers: { Authorization: `Bearer ${process.env.MOLLIE_API_KEY}` },
      signal: AbortSignal.timeout(15000) // nooit eindeloos op Mollie wachten
    });
    const betaling = await mr.json();
    if (betaling.status !== 'paid') {
      return res.status(402).json({ error: 'Betaling niet bevestigd', status: betaling.status });
    }

    // 2) Ontsleutel de analyse.
    const stats = unseal(blob);

    // 3) BINDING: de blob moet bij DEZE betaling horen (nonce-vergelijking).
    const mNonce = betaling.metadata && betaling.metadata.nonce;
    if (!mNonce || !stats.nonce || String(stats.nonce) !== String(mNonce)) {
      console.error('Binding mislukt: nonce komt niet overeen ·', pid);
      return res.status(403).json({ error: 'Rapport hoort niet bij deze betaling' });
    }

    // 4) Nonce niet teruggeven aan de browser — het is een interne binding-sleutel.
    const { nonce, ...schoneData } = stats;

    // 5) Tegoed-linkje meesturen voor de upsell op het rapport (zelfde token-vorm
    //    als in de mail). Zo kan de rapportknop de korting meteen toepassen.
    const email = betaling.metadata && betaling.metadata.email;
    const { token, deadlineNL } = maakToken(email);
    schoneData.ppToken = token;
    schoneData.ppDeadline = deadlineNL;

    return res.status(200).json({ stravaData: schoneData });

  } catch (e) {
    console.error('Rapport error:', e);
    return res.status(400).json({ error: 'Kon rapport niet ontsleutelen' });
  }
}
