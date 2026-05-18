export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?error=strava_denied');
  }

  try {
    // Stap 1: Wissel code in voor access token
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.redirect('/?error=token_failed');
    }

    const accessToken = tokenData.access_token;
    const athlete = tokenData.athlete;

    // Stap 2: Haal activiteiten op (laatste 90 dagen)
    const negentigDagenGeleden = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
    
    const activiteitenRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${negentigDagenGeleden}&per_page=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const activiteiten = await activiteitenRes.json();

    // Stap 3: Bereken statistieken
    const stats = berekenStats(activiteiten, athlete);

    // Stap 4: Redirect naar rapport pagina met data
    const dataParam = encodeURIComponent(JSON.stringify(stats));
    res.redirect(`/?data=${dataParam}#rapport`);

  } catch (err) {
    console.error('Strava callback error:', err);
    res.redirect('/?error=server_error');
  }
}

function berekenStats(activiteiten, athlete) {
  const fietsritten = activiteiten.filter(a => 
    a.type === 'Ride' || a.type === 'VirtualRide'
  );

  if (fietsritten.length === 0) {
    return {
      naam: athlete?.firstname || 'Sporter',
      aantalActiviteiten: 0,
      urenPerWeek: 0,
      prestatiescore: 0,
      vo2maxSessies: 0,
      zoneverdeling: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
      duurvermogen: 'matig',
      herstelbalans: 'matig',
      intensiteitsverdeling: 'matig',
      zonescore: 'matig'
    };
  }

  // Totale tijd in uren
  const totaalSeconden = fietsritten.reduce((sum, a) => sum + (a.moving_time || 0), 0);
  const totaalUren = totaalSeconden / 3600;
  const urenPerWeek = Math.round((totaalUren / 13) * 10) / 10; // 90 dagen = ~13 weken

  // Gemiddelde hartslag
  const rittenMetHr = fietsritten.filter(a => a.average_heartrate);
  const gemHr = rittenMetHr.length > 0
    ? rittenMetHr.reduce((sum, a) => sum + a.average_heartrate, 0) / rittenMetHr.length
    : 0;

  // Schat zoneverdeling op basis van gemiddelde hartslag
  // Max HR schatting: 220 - leeftijd (we gebruiken 180 als standaard)
  const maxHr = 180;
  const hrPct = gemHr > 0 ? (gemHr / maxHr) * 100 : 67;

  let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;
  
  if (hrPct < 60) { z1 = 40; z2 = 45; z3 = 10; z4 = 3; z5 = 2; }
  else if (hrPct < 70) { z1 = 10; z2 = 60; z3 = 22; z4 = 5; z5 = 3; }
  else if (hrPct < 80) { z1 = 8; z2 = 35; z3 = 40; z4 = 12; z5 = 5; }
  else { z1 = 5; z2 = 20; z3 = 35; z4 = 25; z5 = 15; }

  // VO2max sessies: ritten met max HR > 90% of hoge intensiteit
  const vo2maxSessies = fietsritten.filter(a => 
    (a.max_heartrate && a.max_heartrate > maxHr * 0.9) ||
    (a.average_watts && a.average_watts > 250)
  ).length;

  // Prestatiescore (0-100)
  let score = 50;
  if (urenPerWeek >= 6) score += 10;
  if (urenPerWeek >= 10) score += 10;
  if (vo2maxSessies > 2) score += 15;
  if (vo2maxSessies === 0) score -= 20;
  if (z2 > 50) score += 10;
  if (z3 > 40) score -= 10;
  score = Math.max(10, Math.min(95, score));

  // Beoordelingen
  const duurvermogen = urenPerWeek >= 8 ? 'goed' : urenPerWeek >= 5 ? 'matig' : 'slecht';
  const herstelbalans = fietsritten.length > 0 
    ? (fietsritten.length / 13 <= 5 ? 'goed' : fietsritten.length / 13 <= 8 ? 'matig' : 'slecht')
    : 'matig';
  const intensiteitsverdeling = z3 > 35 ? 'slecht' : z2 > 50 ? 'goed' : 'matig';
  const zonescore = vo2maxSessies > 2 ? 'goed' : vo2maxSessies > 0 ? 'matig' : 'slecht';

  return {
    naam: athlete?.firstname || 'Sporter',
    aantalActiviteiten: fietsritten.length,
    urenPerWeek,
    prestatiescore: Math.round(score),
    vo2maxSessies,
    zoneverdeling: { z1, z2, z3, z4, z5 },
    duurvermogen,
    herstelbalans,
    intensiteitsverdeling,
    zonescore,
    gemHr: Math.round(gemHr)
  };
}
