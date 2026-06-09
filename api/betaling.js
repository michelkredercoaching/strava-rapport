export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { stravaData, email } = req.body;
  const slim = {
    naam: stravaData?.naam || 'Sporter',
    aantalActiviteiten: stravaData?.aantalActiviteiten || 0,
    urenPerWeek: stravaData?.urenPerWeek || 0,
    prestatiescore: stravaData?.prestatiescore || 0,
    vo2maxSessies: stravaData?.vo2maxSessies || 0,
    zones: stravaData?.zones || [],
    ftp: stravaData?.ftp || null,
    maxHf: stravaData?.maxHf || null,
    omslagpunt: stravaData?.omslagpunt || null,
    heeftVermogensmeter: stravaData?.heeftVermogensmeter || false,
    duurZonePct: stravaData?.duurZonePct || 0,
    grijsZonePct: stravaData?.grijsZonePct || 0,
    kwaliteitZonePct: stravaData?.kwaliteitZonePct || 0,
    duurvermogen: stravaData?.duurvermogen || 'matig',
    herstelbalans: stravaData?.herstelbalans || 'matig',
    intensiteitsverdeling: stravaData?.intensiteitsverdeling || 'matig',
    zonescore: stravaData?.zonescore || 'matig',
    gemIntensiteit: stravaData?.gemIntensiteit || null,
    herstelRatio: stravaData?.herstelRatio || null,
    herstelScore: stravaData?.herstelScore ?? null,
    gemAfstandPerWeek: stravaData?.gemAfstandPerWeek || 0,
    langsteRit: stravaData?.langsteRit || 0,
  };
  const dataParam = encodeURIComponent(JSON.stringify(slim));
  // Mollie vervangt {id} NIET altijd — gebruik daarom de webhookUrl om payment ID
  // te weten, en stuur data gewoon direct mee in redirectUrl zonder payment ID check.
  // Na redirect checkt betaling-callback via query param 'sid' het payment ID.
  // Mollie stuurt het payment ID mee als 'id' query param in de redirectUrl als je
  // {id} gebruikt — dit werkt WEL in de redirectUrl maar je moet 'id' lezen, niet 'sid'.
  const redirectUrl = `https://rapport.michelkredercoaching.nl/api/betaling-callback?d=${dataParam}`;
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
        redirectUrl,
        webhookUrl: `https://rapport.michelkredercoaching.nl/api/betaling-webhook`,
        // Compacte kerndata + e-mail mee in de metadata, zodat de webhook (die
        // alleen het payment-id krijgt en de redirect-data NIET ziet) de PDF kan
        // bouwen en de klant + interne mail kan versturen. Max ~1kB — past ruim.
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
    if (betaling._links?.checkout?.href) {
      return res.status(200).json({ checkoutUrl: betaling._links.checkout.href });
    }
    console.error('Mollie error:', JSON.stringify(betaling));
    return res.status(500).json({ error: 'Betaling aanmaken mislukt' });
  } catch (err) {
    console.error('Betaling error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
