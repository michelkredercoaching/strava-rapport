import crypto from 'node:crypto';

// ===== Versleuteling (server-side gate) =====
function _key(){ return crypto.createHash('sha256').update(String(process.env.GATE_SECRET||'')).digest(); }
function unseal(blob){ const b=Buffer.from(String(blob),'base64url'); const iv=b.subarray(0,12),t=b.subarray(12,28),e=b.subarray(28); const d=crypto.createDecipheriv('aes-256-gcm',_key(),iv); d.setAuthTag(t); return JSON.parse(Buffer.concat([d.update(e),d.final()]).toString('utf8')); }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { blob, email } = req.body || {};

  // De volledige analyse zit versleuteld in 'blob' (door strava-callback gemaakt).
  // We ontsleutelen 'm hier server-side om de Mollie-metadata + PDF te kunnen bouwen.
  let stravaData;
  try {
    stravaData = unseal(blob);
  } catch (e) {
    console.error('Blob ontsleutelen mislukt:', e);
    return res.status(400).json({ error: 'Ongeldige sessie. Koppel Strava opnieuw.' });
  }

  const slim = {
    naam: stravaData?.naam || 'Sporter',
    aantalActiviteiten: stravaData?.aantalActiviteiten || 0,
    urenPerWeek: stravaData?.urenPerWeek || 0,
    prestatiescore: stravaData?.prestatiescore || 0,
    vo2maxSessies: stravaData?.vo2maxSessies || 0,
    zones: stravaData?.zones || [],
    ftp: stravaData?.ftp || null,
    gemIntensiteit: stravaData?.gemIntensiteit || null,
    herstelScore: stravaData?.herstelScore ?? null,
  };

  try {
    const mollieRes = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: '19.00' },
        description: 'Strava Trainingsrapport — Michel Kreder Coaching',
        // Statische redirect: na betaling komt de klant op /?betaald=true.
        // De blob + payment-id staan in de browseropslag; /api/rapport
        // ontsleutelt pas na een bij Mollie bevestigde betaling.
        redirectUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-callback',
        webhookUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-webhook',
        metadata: {
          naam: slim.naam,
          email: (email || '').toString().slice(0, 120),
          ftp: slim.ftp,
          uren: slim.urenPerWeek,
          score: slim.prestatiescore,
          vo2max: slim.vo2maxSessies,
          herstel: slim.herstelScore,
          intensiteit: slim.gemIntensiteit,
          ritten: slim.aantalActiviteiten,
          zones: Array.isArray(slim.zones) ? slim.zones.join('-') : ''
        }
      })
    });
    const betaling = await mollieRes.json();
    console.log('Mollie response:', JSON.stringify(betaling).substring(0, 200));
    if (betaling._links?.checkout?.href && betaling.id) {
      return res.status(200).json({ checkoutUrl: betaling._links.checkout.href, pid: betaling.id });
    }
    console.error('Mollie error:', JSON.stringify(betaling));
    return res.status(500).json({ error: 'Betaling aanmaken mislukt' });
  } catch (err) {
    console.error('Betaling error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
