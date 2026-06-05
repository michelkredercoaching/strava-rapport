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

    // Stap 3: Haal best efforts op voor FTP detectie
    // We halen de laatste 200 activiteiten op voor best power/hr detectie
    const alleActiviteitenRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const alleActiviteiten = await alleActiviteitenRes.json();

    // Stap 4: Bereken statistieken
    const stats = berekenStats(activiteiten, alleActiviteiten, athlete);

    // Stap 5: Redirect naar rapport pagina
    const dataParam = encodeURIComponent(JSON.stringify(stats));
    res.redirect(`/?data=${dataParam}`);

  } catch (err) {
    console.error('Strava callback error:', err);
    res.redirect('/?error=server_error');
  }
}

function berekenStats(activiteiten90, alleActiviteiten, athlete) {
  const fietsritten90 = activiteiten90.filter(a =>
    a.type === 'Ride' || a.type === 'VirtualRide'
  );
  const alleRitten = alleActiviteiten.filter(a =>
    a.type === 'Ride' || a.type === 'VirtualRide'
  );

  if (fietsritten90.length === 0) {
    return {
      naam: athlete?.firstname || 'Sporter',
      aantalActiviteiten: 0,
      urenPerWeek: 0,
      prestatiescore: 10,
      vo2maxSessies: 0,
      zones: [0, 0, 0, 0, 0],
      duurvermogen: 'slecht',
      herstelbalans: 'slecht',
      intensiteitsverdeling: 'slecht',
      zonescore: 'slecht',
      heeftVermogensmeter: false,
      ftp: null,
      maxHf: null,
      omslagpunt: null,
      maxGapDagen: 90,
      gemAfstandPerWeek: 0,
      langsteRit: 0,
    };
  }

  // ===== BASISSTATS =====
  const totaalSeconden = fietsritten90.reduce((sum, a) => sum + (a.moving_time || 0), 0);
  const urenPerWeek = Math.round((totaalSeconden / 3600 / 13) * 10) / 10;
  const gemAfstandPerWeek = Math.round(fietsritten90.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000 / 13 * 10) / 10;
  const langsteRit = Math.round(Math.max(...fietsritten90.map(a => a.distance || 0)) / 1000);

  // ===== GAP DETECTIE =====
  const datums = fietsritten90
    .map(a => new Date(a.start_date).getTime())
    .sort((a, b) => a - b);
  let maxGapDagen = 0;
  for (let i = 1; i < datums.length; i++) {
    const gap = (datums[i] - datums[i-1]) / (1000 * 60 * 60 * 24);
    if (gap > maxGapDagen) maxGapDagen = gap;
  }
  maxGapDagen = Math.round(maxGapDagen);

  // ===== VERMOGENSMETER DETECTIE =====
  const rittenMetVermogen = fietsritten90.filter(a => a.average_watts && a.device_watts);
  const heeftVermogensmeter = rittenMetVermogen.length >= 3;

  // ===== FTP DETECTIE (alleen vermogensmeter) =====
  let ftp = null;
  let bestE20min = null;
  let bestE12min = null;

  if (heeftVermogensmeter) {
    // Beste gemiddeld vermogen uit alle ritten (schatting beste 20min = langste hoge inspanning)
    // We gebruiken weighted average power of average watts van ritten > 15min
    const langeritten = alleRitten.filter(a =>
      a.device_watts && a.average_watts && a.moving_time > 900
    );

    if (langeritten.length > 0) {
      // Sorteer op gemiddeld vermogen, neem beste
      const gesorteerd = langeritten.sort((a, b) => b.average_watts - a.average_watts);

      // Beste 20min schatting: hoogste gemiddeld vermogen van ritten 18-25 min
      const ritten20min = gesorteerd.filter(a => a.moving_time >= 1080 && a.moving_time <= 1500);
      if (ritten20min.length > 0) {
        bestE20min = Math.round(ritten20min[0].average_watts);
        ftp = Math.round(bestE20min * 0.95);
      }

      // Beste 12min schatting als fallback
      if (!ftp) {
        const ritten12min = gesorteerd.filter(a => a.moving_time >= 660 && a.moving_time <= 840);
        if (ritten12min.length > 0) {
          bestE12min = Math.round(ritten12min[0].average_watts);
          ftp = Math.round(bestE12min * 0.88);
        }
      }

      // Absolute fallback: hoogste gemiddeld vermogen * 0.85
      if (!ftp && gesorteerd.length > 0) {
        ftp = Math.round(gesorteerd[0].average_watts * 0.85);
      }
    }
  }

  // ===== MAX HARTSLAG DETECTIE =====
  // Top 3 hoogste max HR → gemiddelde
  const maxHrWaarden = alleRitten
    .filter(a => a.max_heartrate && a.max_heartrate > 100)
    .map(a => a.max_heartrate)
    .sort((a, b) => b - a)
    .slice(0, 3);

  const maxHf = maxHrWaarden.length > 0
    ? Math.round(maxHrWaarden.reduce((s, v) => s + v, 0) / maxHrWaarden.length)
    : null;

  const omslagpunt = maxHf ? Math.round(maxHf * 0.90) : null;

  // ===== GEMIDDELDE INTENSITEIT =====
  const rittenMetHr = fietsritten90.filter(a => a.average_heartrate);
  const gemHr = rittenMetHr.length > 0
    ? Math.round(rittenMetHr.reduce((sum, a) => sum + a.average_heartrate, 0) / rittenMetHr.length)
    : null;
  const gemIntensiteit = gemHr && maxHf ? Math.round((gemHr / maxHf) * 100) : null;

  // ===== ZONE ANALYSE =====
  let zones = [0, 0, 0, 0, 0, 0]; // 6 zones
  let vo2maxSessies = 0;

  if (heeftVermogensmeter && ftp) {
    // FTP zones
    fietsritten90.forEach(rit => {
      if (!rit.average_watts || !rit.device_watts) return;
      const pct = (rit.average_watts / ftp) * 100;
      if (pct < 55) zones[0]++;
      else if (pct < 76) zones[1]++;
      else if (pct < 86) zones[2]++;
      else if (pct < 96) zones[3]++;
      else if (pct < 106) zones[4]++;
      else { zones[5]++; vo2maxSessies++; }
      if (pct >= 96) vo2maxSessies++;
    });
  } else if (omslagpunt) {
    // Hartslag zones op omslagpunt
    fietsritten90.forEach(rit => {
      if (!rit.average_heartrate) return;
      const pct = (rit.average_heartrate / omslagpunt) * 100;
      if (pct < 75) zones[0]++;
      else if (pct < 85) zones[1]++;
      else if (pct < 95) zones[2]++;
      else if (pct < 100) zones[3]++;
      else { zones[4]++; vo2maxSessies++; }
    });
    zones = zones.slice(0, 5);
  } else {
    // Geen data: schatting op basis van gemiddelde intensiteit
    zones = [10, 55, 25, 7, 3];
  }

  // Zones omzetten naar percentages
  const totaalZone = zones.reduce((s, v) => s + v, 0) || 1;
  const zonesPct = zones.map(z => Math.round((z / totaalZone) * 100));

  // ===== HERSTELRATIO =====
  const zwaarRitten = fietsritten90.filter(a => {
    if (heeftVermogensmeter && ftp && a.average_watts) return (a.average_watts / ftp) > 0.86;
    if (omslagpunt && a.average_heartrate) return a.average_heartrate > omslagpunt * 0.95;
    return false;
  }).length;
  const herstelRatioGetal = zwaarRitten > 0
    ? '1:' + Math.round((fietsritten90.length - zwaarRitten) / zwaarRitten)
    : null;

  // ===== BEOORDELINGEN =====
  const duurZonePct = zonesPct[1] || 0; // Z2/D1
  const grijsZonePct = zonesPct[2] || 0; // Z3/D2
  const duurvermogen = urenPerWeek >= 8 ? 'goed' : urenPerWeek >= 5 ? 'matig' : 'slecht';
  const intensiteitsverdeling = grijsZonePct > 35 ? 'slecht' : duurZonePct > 50 ? 'goed' : 'matig';
  const herstelbalans = maxGapDagen > 14 ? 'slecht' : maxGapDagen > 7 ? 'matig' : 'goed';
  const zonescore = vo2maxSessies >= 3 ? 'goed' : vo2maxSessies > 0 ? 'matig' : 'slecht';

  // ===== PRESTATIESCORE =====
  let score = 50;
  if (urenPerWeek >= 6) score += 8;
  if (urenPerWeek >= 10) score += 8;
  if (vo2maxSessies >= 3) score += 12;
  if (vo2maxSessies === 0) score -= 15;
  if (duurZonePct > 50) score += 8;
  if (grijsZonePct > 35) score -= 10;
  if (maxGapDagen > 14) score -= 8;
  if (fietsritten90.length >= 30) score += 5;
  score = Math.max(10, Math.min(95, Math.round(score)));

  return {
    naam: athlete?.firstname || 'Sporter',
    aantalActiviteiten: fietsritten90.length,
    urenPerWeek,
    prestatiescore: score,
    vo2maxSessies,
    zones: zonesPct,
    duurvermogen,
    herstelbalans,
    intensiteitsverdeling,
    zonescore,
    heeftVermogensmeter,
    ftp,
    bestE20min,
    bestE12min,
    maxHf,
    omslagpunt,
    gemHr,
    gemIntensiteit,
    herstelRatio: herstelRatioGetal,
    maxGapDagen,
    gemAfstandPerWeek,
    langsteRit,
  };
}
