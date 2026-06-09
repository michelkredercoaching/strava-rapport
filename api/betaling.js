import crypto from 'node:crypto';

// ===== Versleuteling (server-side gate) =====
function _key(){ return crypto.createHash('sha256').update(String(process.env.GATE_SECRET||'')).digest(); }
function unseal(blob){ const b=Buffer.from(String(blob),'base64url'); const iv=b.subarray(0,12),t=b.subarray(12,28),e=b.subarray(28); const d=crypto.createDecipheriv('aes-256-gcm',_key(),iv); d.setAuthTag(t); return JSON.parse(Buffer.concat([d.update(e),d.final()]).toString('utf8')); }

// Geeft de ontsleutelde analyse ALLEEN terug na een bij Mollie bevestigde betaling.
// Dit is de echte poort: zonder een 'paid' payment-id komt er geen FTP, geen
// zones en geen rapport de browser in.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { blob, pid } = req.body || {};
  if (!blob || !pid) return res.status(400).json({ error: 'Ontbrekende gegevens' });

  try {
    // 1) Verifieer bij Mollie dat dit echt een betaalde transactie is.
    const mr = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(pid)}`, {
      headers: { Authorization: `Bearer ${process.env.MOLLIE_API_KEY}` }
    });
    const betaling = await mr.json();
    if (betaling.status !== 'paid') {
      return res.status(402).json({ error: 'Betaling niet bevestigd' });
    }

    // 2) Ontsleutel de analyse.
    const stats = unseal(blob);

    // 3) Binding: de blob moet horen bij déze betaling (voorkomt hergebruik van
    //    één betaling voor andermans data). We checken de FTP uit de metadata.
    const mFtp = betaling.metadata && betaling.metadata.ftp;
    if (mFtp != null && mFtp !== '' && String(stats.ftp) !== String(mFtp)) {
      return res.status(403).json({ error: 'Rapport hoort niet bij deze betaling' });
    }

    return res.status(200).json({ stravaData: stats });
  } catch (e) {
    console.error('Rapport error:', e);
    return res.status(400).json({ error: 'Kon rapport niet ontsleutelen' });
  }
}
