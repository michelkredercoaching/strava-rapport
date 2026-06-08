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
    // Haal stream data op voor ALLE ritten (tot een veilige limiet i.v.m. Strava
    // rate limits: 100 requests / 15 min). 50 dekt vrijwel iedereen; bij meer
    // ritten pakken we de 50 meest recente. Elke gemiste rit = mogelijk een
    // gemiste piek-inspanning, dus we willen er zo veel mogelijk meenemen.
    const MAX_STREAMS = 50;
    const rittenVoorStreams = fietsritten90.slice(0, MAX_STREAMS);

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
      zones: [0, 0, 0, 0, 0, 0],
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
  // Primair: echte vermogensmeter (device_watts === true)
  // Fallback: Strava geschat vermogen (average_watts aanwezig, ook zonder device_watts)
  const rittenMetEchtVermogen = alleRitten.filter(a => a.average_watts && a.device_watts === true);
  const rittenMetSchatting = alleRitten.filter(a => a.average_watts && a.average_watts > 50);
  const heeftEchteVermogensmeter = rittenMetEchtVermogen.length >= 3;
  // Gebruik geschat vermogen als fallback, maar markeer het
  const heeftVermogensmeter = rittenMetEchtVermogen.length >= 1 || rittenMetSchatting.length >= 5;
  const vermogenIsGeschat = !heeftEchteVermogensmeter && rittenMetSchatting.length >= 5;

  // ===== FTP DETECTIE =====
  // Afgesproken aanpak: mix van 1/5/12/20-min efforts uit de STREAM data,
  // waarbij de lange inspanningen zwaarder wegen.
  // We zoeken het beste aaneengesloten blok per duur binnen al je ritten
  // (de echte power-curve), niet het gemiddelde van hele ritten — dat is
  // bij duurritten altijd te laag en gaf de verkeerde uitkomst.
  let ftp = null;
  let ftpBronnen = [];

  // Hulpfunctie: beste rolling gemiddelde over een venster (in seconden)
  // Strava streams zijn 1Hz (1 punt per seconde).
  function besteRollingGemiddelde(data, vensterSec) {
    if (!data || data.length < vensterSec) return null;
    let som = 0;
    for (let i = 0; i < vensterSec; i++) som += (data[i] || 0);
    let beste = som;
    for (let i = vensterSec; i < data.length; i++) {
      som += (data[i] || 0) - (data[i - vensterSec] || 0);
      if (som > beste) beste = som;
    }
    return beste / vensterSec;
  }

  // De 4 vensters — lange efforts wegen zwaarder (gewicht loopt op met duur).
  // De kortere vensters tillen de schatting op wanneer het lange blok submaximaal
  // was; de zware weging op 12/20-min houdt het geaard. Samen = robuuste blend
  // die stabiel blijft of iemand zijn 20-min nu wel of niet voluit reed.
  const ftpWindows = [
    { naam: '1min',  sec: 60,   factor: 0.72, gewicht: 1 },
    { naam: '5min',  sec: 300,  factor: 0.88, gewicht: 2 },
    { naam: '12min', sec: 720,  factor: 0.94, gewicht: 3 },
    { naam: '20min', sec: 1200, factor: 0.95, gewicht: 4 },
  ];

  // Beste effort per venster over ALLE ritten met stream-vermogen
  const piek = {}; // sec -> beste watt
  let heeftPowerStream = false;
  let aantalRittenMetStream = 0;

  fietsritten90.forEach(rit => {
    const wattsData = streamMap[rit.id]?.watts?.data;
    if (!wattsData || wattsData.length < 60) return;
    heeftPowerStream = true;
    aantalRittenMetStream++;
    ftpWindows.forEach(w => {
      const beste = besteRollingGemiddelde(wattsData, w.sec);
      if (beste && beste > 50 && (!piek[w.sec] || beste > piek[w.sec])) {
        piek[w.sec] = beste;
      }
    });
  });

  // Geschat vermogen (device_watts:false) is wat spikerig maar onderschat eerder
  // dan dat het overschat — geen down-correctie meer.
  const schatFactor = 1.0;

  if (heeftPowerStream) {
    let gewogenSom = 0, gewogenTotaal = 0;
    ftpWindows.forEach(w => {
      if (piek[w.sec]) {
        const schatting = Math.round(piek[w.sec] * w.factor * schatFactor);
        if (schatting >= 80 && schatting <= 600) {
          gewogenSom += schatting * w.gewicht;
          gewogenTotaal += w.gewicht;
          ftpBronnen.push({ naam: w.naam, piek: Math.round(piek[w.sec]), schatting, gewicht: w.gewicht });
          console.log(`FTP ${w.naam}: piek ${Math.round(piek[w.sec])}W × ${w.factor} × ${schatFactor} = ${schatting}W (gewicht ${w.gewicht})`);
        }
      }
    });
    if (gewogenTotaal > 0) {
      ftp = Math.round(gewogenSom / gewogenTotaal);
      console.log(`FTP (stream, gewogen 1/5/12/20): ${ftp}W uit ${ftpBronnen.length} vensters`);
    }
  }

  // FALLBACK: geen stream data → beste harde 12-60min rit als drempel-proxy
  if (!ftp) {
    const rittenVoorFtp = alleRitten.filter(a =>
      a.average_watts && a.average_watts > 50 && a.moving_time > 600
    );
    if (rittenVoorFtp.length > 0) {
      const korteHarde = rittenVoorFtp
        .filter(a => a.moving_time >= 720 && a.moving_time <= 3600)
        .sort((a, b) => b.average_watts - a.average_watts);
      if (korteHarde.length > 0) {
        ftp = Math.round(korteHarde[0].average_watts * 0.95 * schatFactor);
        console.log(`FTP fallback (12-60min rit): ${ftp}W`);
      } else {
        const gesorteerd = [...rittenVoorFtp].sort((a, b) => b.average_watts - a.average_watts);
        ftp = Math.round(gesorteerd[0].average_watts * 1.0 * schatFactor);
        console.log(`FTP fallback (hoogste gem): ${ftp}W`);
      }
    }
  }

  // ===== MAX HARTSLAG =====
  const maxHrWaarden = alleRitten
    .filter(a => a.max_heartrate && a.max_heartrate > 100)
    .map(a => a.max_heartrate)
    .sort((a, b) => b - a)
    .slice(0, 3);

  const maxHrFallback = fietsritten90
    .filter(a => a.max_heartrate && a.max_heartrate > 100)
    .map(a => a.max_heartrate)
    .sort((a, b) => b - a)
    .slice(0, 3);

  const gebruikteHrWaarden = maxHrWaarden.length > 0 ? maxHrWaarden : maxHrFallback;
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

  // ===== ZONE ANALYSE =====
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
      } else if (rit.average_watts && rit.average_watts > 50) {
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

    vo2maxSessies = fietsritten90.filter(rit => {
      const stream = streamMap[rit.id];
      if (stream?.watts?.data) {
        const secsBovenFtp = stream.watts.data.filter(w => w && (w / ftp) > 1.05).length;
        return secsBovenFtp > 180;
      }
      if (rit.max_watts) return (rit.max_watts / ftp) > 1.05 && rit.moving_time > 600;
      return rit.average_watts && (rit.average_watts / ftp) > 0.96;
    }).length;

  } else if (omslagpunt) {
    zones = [0, 0, 0, 0, 0, 0];
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
    zones = [5, 50, 30, 10, 5, 0];
    vo2maxSessies = 0;
  }

  const totaalZone = zones.reduce((s, v) => s + v, 0) || 1;
  const zonesPct = zones.map(z => Math.round((z / totaalZone) * 100));
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

  // ===== RUWE RIT DATA =====
  const rittenRuw = fietsritten90.map(rit => ({
    w: rit.average_watts || null,
    dw: rit.device_watts || false,
    hr: rit.average_heartrate || null,
    maxHr: rit.max_heartrate || null,
    maxW: rit.max_watts || null,
    t: rit.moving_time || 3600,
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
    heeftEchteVermogensmeter,
    vermogenIsGeschat,
    ftp,
    ftpBronnen,
    ftpUitStream: heeftPowerStream,
    aantalRittenMetStream,
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
