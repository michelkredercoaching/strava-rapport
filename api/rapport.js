// /api/rapport.js
// Geeft de ontsleutelde analyse ALLEEN terug na een bij Mollie bevestigde
// betaling. Dit is de echte poort: zonder een 'paid' payment-id én een
// kloppende binding komt er geen FTP, geen zones en geen rapport de browser in.
import { unseal } from '../lib/gate.js';

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

    // 3) BINDING (punt 6): de blob moet bij DEZE betaling horen.
    //    Bij het aanmaken van de betaling is de nonce uit de blob in de
    //    Mollie-metadata gezet. Komt 'ie niet overeen, dan probeert iemand een
    //    andere blob te ontgrendelen met deze betaling → weigeren.
    //    Werkt ook als er geen FTP is (anders dan de oude FTP-check).
    const mNonce = betaling.metadata && betaling.metadata.nonce;
    if (!mNonce || !stats.nonce || String(stats.nonce) !== String(mNonce)) {
      console.error('Binding mislukt: nonce komt niet overeen ·', pid);
      return res.status(403).json({ error: 'Rapport hoort niet bij deze betaling' });
    }

    // 4) Nonce niet teruggeven aan de browser — het is een interne binding-sleutel.
    const { nonce, ...schoneData } = stats;
    return res.status(200).json({ stravaData: schoneData });

  } catch (e) {
    console.error('Rapport error:', e);
    return res.status(400).json({ error: 'Kon rapport niet ontsleutelen' });
  }
}
