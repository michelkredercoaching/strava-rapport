export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stravaData } = req.body;

  // Stuur alleen de essentiële velden mee — de rest genereert Claude opnieuw
  const slim = {
    naam: stravaData?.naam || 'Sporter',
    aantalActiviteiten: stravaData?.aantalActiviteiten || 0,
    urenPerWeek: stravaData?.urenPerWeek || 0,
    prestatiescore: stravaData?.prestatiescore || 0,
    vo2maxSessies: stravaData?.vo2maxSessies || 0,
    zones: stravaData?.zones || [],
    duurZonePct: stravaData?.duurZonePct || 0,
    grijsZonePct: stravaData?.grijsZonePct || 0,
    kwaliteitZonePct: stravaData?.kwaliteitZonePct || 0,
    duurvermogen: stravaData?.duurvermogen || 'matig',
    herstelbalans: stravaData?.herstelbalans || 'matig',
    intensiteitsverdeling: stravaData?.intensiteitsverdeling || 'matig',
    zonescore: stravaData?.zonescore || 'matig',
    heeftVermogensmeter: stravaData?.heeftVermogensmeter || false,
    ftp: stravaData?.ftp || null,
    maxHf: stravaData?.maxHf || null,
    omslagpunt: stravaData?.omslagpunt || null,
    gemIntensiteit: stravaData?.gemIntensiteit || null,
    herstelRatio: stravaData?.herstelRatio || null,
    gemAfstandPerWeek: stravaData?.gemAfstandPerWeek || 0,
    langsteRit: stravaData?.langsteRit || 0,
  };
  // rittenRuw weglaten — die is groot en niet nodig na betaling

  const dataParam = encodeURIComponent(JSON.stringify(slim));

  // Check URL lengte — Mollie max is 1023 tekens voor redirectUrl
  const redirectUrl = `https://rapport.michelkredercoaching.nl/api/betaling-callback?sid={id}&d=${dataParam}`;

  if (redirectUrl.length > 1020) {
    // Nog verder inkorten: alleen de absolute kern
    const mini = {
      naam: slim.naam,
      aantalActiviteiten: slim.aantalActiviteiten,
      urenPerWeek: slim.urenPerWeek,
      prestatiescore: slim.prestatiescore,
      vo2maxSessies: slim.vo2maxSessies,
      zones: slim.zones,
      ftp: slim.ftp,
      maxHf: slim.maxHf,
      omslagpunt: slim.omslagpunt,
      heeftVermogensmeter: slim.heeftVermogensmeter,
      duurZonePct: slim.duurZonePct,
      grijsZonePct: slim.grijsZonePct,
      kwaliteitZonePct: slim.kwaliteitZonePct,
    };
    const miniParam = encodeURIComponent(JSON.stringify(mini));
    const mollieRes = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: '19.00' },
        description: 'Strava Trainingsrapport — Michel Kreder Coaching',
        redirectUrl: `https://rapport.michelkredercoaching.nl/api/betaling-callback?sid={id}&d=${miniParam}`,
        webhookUrl: `https://rapport.michelkredercoaching.nl/api/betaling-webhook`,
        metadata: { naam: slim.naam }
      })
    });
    const betaling = await mollieRes.json();
    if (betaling._links?.checkout?.href) {
      return res.status(200).json({ checkoutUrl: betaling._links.checkout.href });
    }
    console.error('Mollie error:', JSON.stringify(betaling));
    return res.status(500).json({ error: 'Betaling aanmaken mislukt' });
  }

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
        metadata: { naam: slim.naam }
      })
    });
    const betaling = await mollieRes.json();
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
