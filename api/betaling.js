// /api/betaling.js
import { huidigePrijs } from '../lib/prijs.js';
import { unseal } from '../lib/gate.js';

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

  // ===== PRIJS — server-side, datum-afhankelijk (één bron van waarheid) =====
  // Het bedrag dat Mollie afschrijft komt HIER vandaan, niet uit de browser.
  // Zo kan de getoonde prijs nooit afwijken van wat er afgeschreven wordt.
  const p = huidigePrijs();

  try {
    const mollieRes = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: p.bedrag },
        description: 'Strava Trainingsrapport — Michel Kreder Coaching',
        // iDEAL + Bancontact: Mollie toont een keuzescherm met deze twee methodes.
        // (Bancontact verschijnt pas zodra Mollie de aanvraag heeft goedgekeurd.)
        method: ['ideal', 'bancontact'],
        locale: 'nl_NL',
        redirectUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-callback',
        webhookUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-webhook',
        metadata: {
          naam: slim.naam,
          email: (email || '').toString().slice(0, 120),
          // BINDING (punt 6): nonce uit de versleutelde blob. /api/rapport eist
          // dat deze overeenkomt voordat het rapport wordt vrijgegeven.
          nonce: stravaData?.nonce || '',
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
      // prijs + isDeal teruggeven zodat de frontend hetzelfde kan tonen.
      return res.status(200).json({
        checkoutUrl: betaling._links.checkout.href,
        pid: betaling.id,
        prijs: p.prijs,
        isDeal: p.isDeal
      });
    }

    console.error('Mollie error:', JSON.stringify(betaling));
    return res.status(500).json({ error: 'Betaling aanmaken mislukt' });
  } catch (err) {
    console.error('Betaling error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
