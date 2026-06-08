export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?error=strava_denied');
  }

  try {
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

    const negentigDagenGeleden = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
    const activiteitenRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${negentigDagenGeleden}&per_page=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const activiteiten = await activiteitenRes.json();

    const alleActiviteitenRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const alleActiviteiten = await alleActiviteitenRes.json();

    const fietsritten90 = activiteiten.filter(a => a.type === 'Ride' || a.type === 'VirtualRide');
    const rittenVoorStreams = fietsritten90.slice(0, 30);

    const streamResults = await Promise.all(
      rittenVoorStreams.map(rit =>
        fetch(`https://www.strava.com/api/v3/activities/${rit.id}/streams?keys=watts,heartrate&key_by_type=true`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        .then(r => r.json())
        .then(stream => ({ id: rit.id, stream }))
        .catch(() => ({ id: rit.id, stream: null }))
      )
    );

    const streamMap = {};
    streamResults.forEach(r => { if (r.stream) streamMap[r.id] = r.stream; });

    if (streamResults.length > 0) {
      console.log('Stream keys rit 0:', Object.keys(streamResults[0]?.stream || {}));
    }

    const stats = berekenStats(activiteiten, alleActiviteiten, athlete, streamMap);

    const dataParam = encodeURIComponent(JSON.stringify(stats));
    res.redirect(`/?data=${dataParam}`);

  } catch (err) {
    console.error('Strava callback error:', err);
    res.redirect('/?error=server_error');
  }
}

function berekenStats(activiteiten90, alleActiviteiten, athlete, streamMap = {}) {
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

  // ===== VERMOGENSMETER =====
  const rittenMetEchtVermogen = fietsritten90.filter(a => a.average_watts && a.device_watts === true);
  const heeftVermogensmeter = rittenMetEchtVermogen.length >= 1;

  // ===== FTP DETECTIE =====
  let ftp = null;
  let bestE20min = null;
  let bestE12min = null;

  if (heeftVermogensmeter) {
    const alleEchteRitten = alleRitten.filter(a =>
      a.device_watts === true && a.average_watts && a.moving_time > 300
    );

    if (alleEchteRitten.length > 0) {
      const gesorteerd = alleEchteRitten.sort((a, b) => b.average_watts - a.average_watts);

      const ritten20min = gesorteerd.filter(a => a.moving_time >= 1080 && a.moving_time <= 1500);
      if (ritten20min.length > 0) {
        bestE20min = Math.round(ritten20min[0].average_watts);
        ftp = Math.round(bestE20min * 0.95);
      }

      if (!ftp) {
        const ritten12min = gesorteerd.filter(a => a.moving_time >= 600 && a.moving_time <= 900);
        if (ritten12min.length > 0) {
          bestE12min = Math.round(ritten12min[0].average_watts);
          ftp = Math.round(bestE12min * 0.88);
        }
      }

      if (!ftp) {
        const langsteRitMetVermogen = alleEchteRitten
          .filter(a => a.moving_time > 1800)
          .sort((a, b) => b.average_watts - a.average_watts)[0];
        if (langsteRitMetVermogen) {
          ftp = Math.round(langsteRitMetVermogen.average_watts * 0.80);
        }
      }

      if (!ftp && gesorteerd.length > 0) {
        ftp = Math.round(gesorteerd[0].average_watts * 0.75);
      }
    }
  }

  // ===== MAX HARTSLAG =====
  const maxHrWaarden = alleRitten
    .filter(a => a.max_heartrate && a.max_heartrate > 80)
    .map(a => a.max_heartrate)
    .sort((a, b) => b - a)
    .slice(0, 3);

  const maxHrWaardenFallback = fietsritten90
    .filter(a => a.max_heartrate && a.max_heartrate > 80)
    .map(a => a.max_heartrate)
    .sort((a, b) => b - a)
    .slice(0, 3);

  const gebruikteHrWaarden = maxHrWaarden.length > 0 ? maxHrWaarden : maxHrWaardenFallback;

  const maxHf = gebruikteHrWaarden.length > 0
    ? Math.round(gebruikteHrWaarden.reduce((s, v) => s + v, 0) / gebruikteHrWaarden.length)
    : null;

  const omslagpunt = maxHf ? Math.round(maxHf * 0.90) : null;

  // ===== GEMIDDELDE INTENSITEIT =====
  const rittenMetHr = fietsritten90.filter(a => a.average_heartrate);
  const gemHr = rittenMetHr.length > 0
    ? Math.round(rittenMetHr.reduce((sum, a) => sum + a.average_heartrate, 0) / rittenMetHr.length)
    : null;
  const gemIntensiteit = gemHr && maxHf ? Math.round((gemHr / maxHf) * 100) : null;

  // ===== ZONE ANALYSE op basis van streams (seconden per zone) =====
  let zones = [0, 0, 0, 0, 0, 0];
  let vo2maxSessies = 0;
  let heeftStreamData = false;

  if (heeftVermogensmeter && ftp) {
    fietsritten90.forEach(rit => {
      const stream = streamMap[rit.id];
      if (stream?.watts?.data) {
        heeftStreamData = true;
        stream.watts.data.forEach(w => {
          if (!w) return;
          const pct = (w / ftp) * 100;
          if (pct < 55) zones[0]++;
          else if (pct < 76) zones[1]++;
          else if (pct < 86) zones[2]++;
          else if (pct < 96) zones[3]++;
          else if (pct < 106) zones[4]++;
          else zones[5]++;
        });
      } else if (rit.average_watts && rit.device_watts) {
        // Fallback gemiddeld vermogen: verdeel tijd over zones met 60/20/20 model
        const pct = (rit.average_watts / ftp) * 100;
        const t = rit.moving_time || 3600;
        const grenzen = [55, 76, 86, 96, 106];
        let dz = 5;
        for (let i = 0; i < grenzen.length; i++) {
          if (pct < grenzen[i]) { dz = i; break; }
        }
        zones[dz] += Math.round(t * 0.60);
        zones[Math.max(0, dz - 1)] += Math.round(t * 0.20);
        zones[Math.min(5, dz + 1)] += Math.round(t * 0.20);
      }
    });

    // VO2max sessies: > 3 minuten boven 105% FTP (stream), of max_watts > 105% FTP
    vo2maxSessies = fietsritten90.filter(rit => {
      const stream = streamMap[rit.id];
      if (stream?.watts?.data) {
        const secsBovenFtp = stream.watts.data.filter(w => w && (w / ftp) > 1.05).length;
        return secsBovenFtp > 180;
      }
      // Fallback: max_watts beschikbaar via Strava activiteit
      if (rit.max_watts) return (rit.max_watts / ftp) > 1.05 && rit.moving_time > 600;
      return rit.average_watts && (rit.average_watts / ftp) > 0.96;
    }).length;

  } else if (omslagpunt) {
    zones = [0, 0, 0, 0, 0];
    fietsritten90.forEach(rit => {
      const stream = streamMap[rit.id];
      if (stream?.heartrate?.data) {
        heeftStreamData = true;
        stream.heartrate.data.forEach(hr => {
          if (!hr) return;
          const pct = (hr / omslagpunt) * 100;
          if (pct < 75) zones[0]++;
          else if (pct < 85) zones[1]++;
          else if (pct < 95) zones[2]++;
          else if (pct < 100) zones[3]++;
          else zones[4]++;
        });
      } else if (rit.average_heartrate) {
        // Fallback: 60/20/20 verdeling op gemiddelde HF
        const pct = (rit.average_heartrate / omslagpunt) * 100;
        const t = rit.moving_time || 3600;
        const grenzen = [75, 85, 95, 100];
        let dz = 4;
        for (let i = 0; i < grenzen.length; i++) {
          if (pct < grenzen[i]) { dz = i; break; }
        }
        zones[dz] += Math.round(t * 0.60);
        zones[Math.max(0, dz - 1)] += Math.round(t * 0.20);
        zones[Math.min(4, dz + 1)] += Math.round(t * 0.20);
      }
    });

    vo2maxSessies = fietsritten90.filter(rit => {
      const stream = streamMap[rit.id];
      if (stream?.heartrate?.data) {
        const secsBovenOmslagpunt = stream.heartrate.data.filter(hr => hr && hr > omslagpunt).length;
        return secsBovenOmslagpunt > 180;
      }
      return rit.max_heartrate && rit.max_heartrate > omslagpunt && rit.moving_time > 600;
    }).length;

  } else {
    zones = [5, 50, 30, 10, 5];
    vo2maxSessies = 0;
  }

  const totaalZone = zones.reduce((s, v) => s + v, 0) || 1;
  const zonesPct = zones.map(z => Math.round((z / totaalZone) * 100));
  // Fix afrondingsfout
  const diff = 100 - zonesPct.reduce((s,v)=>s+v,0);
  if (diff !== 0) zonesPct[0] += diff;

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
  const duurZonePct = (zonesPct[0] || 0) + (zonesPct[1] || 0);
  const grijsZonePct = (zonesPct[2] || 0) + (zonesPct[3] || 0);
  const kwaliteitZonePct = (zonesPct[4] || 0) + (zonesPct[5] || 0);
  const duurvermogen = urenPerWeek >= 8 ? 'goed' : urenPerWeek >= 5 ? 'matig' : 'slecht';
  const intensiteitsverdeling = grijsZonePct > 20 ? 'slecht' : duurZonePct >= 78 && kwaliteitZonePct >= 15 ? 'goed' : 'matig';
  const herstelbalans = maxGapDagen > 14 ? 'slecht' : maxGapDagen > 7 ? 'matig' : 'goed';
  const zonescore = vo2maxSessies >= 3 ? 'goed' : vo2maxSessies > 0 ? 'matig' : 'slecht';

  // ===== PRESTATIESCORE =====
  let score = 50;
  if (urenPerWeek >= 6) score += 8;
  if (urenPerWeek >= 10) score += 8;
  if (vo2maxSessies >= 3) score += 12;
  if (vo2maxSessies === 0) score -= 15;
  if (duurZonePct >= 75) score += 10;
  if (duurZonePct >= 60) score += 5;
  if (grijsZonePct > 30) score -= 12;
  if (kwaliteitZonePct >= 15) score += 5;
  if (maxGapDagen > 14) score -= 8;
  if (fietsritten90.length >= 30) score += 5;
  score = Math.max(10, Math.min(95, Math.round(score)));

  // ===== RUWE RIT DATA voor herberekening zones in browser =====
  // FIX: ook t (moving_time) en maxW meesturen voor gewogen zone berekening
  const rittenRuw = fietsritten90.map(rit => ({
    w: rit.average_watts || null,
    dw: rit.device_watts || false,
    hr: rit.average_heartrate || null,
    maxHr: rit.max_heartrate || null,
    maxW: rit.max_watts || null,   // max vermogen voor VO2max detectie
    t: rit.moving_time || 3600,   // duur in seconden voor gewogen zone berekening
  }));

  return {
    naam: athlete?.firstname || 'Sporter',
    aantalActiviteiten: fietsritten90.length,
    urenPerWeek,
    prestatiescore: score,
    vo2maxSessies,
    zones: zonesPct,
    duurZonePct,
    grijsZonePct,
    kwaliteitZonePct,
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
    rittenRuw,
    heeftStreamData,
  };
}
