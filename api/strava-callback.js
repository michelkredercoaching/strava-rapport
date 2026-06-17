import crypto from 'node:crypto';

// ===== Versleuteling (server-side gate) =====
// De volledige analyse (incl. FTP en zones) gaat versleuteld naar de browser,
// zodat niemand 'm kan lezen vóór een bevestigde betaling. Sleutel = GATE_SECRET.
function _key(){ return crypto.createHash('sha256').update(String(process.env.GATE_SECRET||'')).digest(); }
function seal(obj){ const iv=crypto.randomBytes(12); const ci=crypto.createCipheriv('aes-256-gcm',_key(),iv); const e=Buffer.concat([ci.update(JSON.stringify(obj),'utf8'),ci.final()]); const t=ci.getAuthTag(); return Buffer.concat([iv,t,e]).toString('base64url'); }

// ===== CONCURRENCY-LIMIET =====
// Voert 'fn' uit over 'items' met maximaal 'limiet' tegelijk. Strava's rate
// limit (100 req / 15 min) geldt PER APPLICATIE, niet per gebruiker — 50 calls
// in één klap (oude Promise.all) kon bij meerdere gelijktijdige sporters de
// limiet opblazen. Met een kleine pool blijft de burst beheersbaar.
async function mapMetLimiet(items, limiet, fn) {
  const resultaten = new Array(items.length);
  let volgende = 0;
  async function werker() {
    while (true) {
      const i = volgende++;
      if (i >= items.length) return;
      resultaten[i] = await fn(items[i], i);
    }
  }
  const aantal = Math.min(Math.max(1, limiet), items.length || 1);
  await Promise.all(Array.from({ length: aantal }, werker));
  return resultaten;
}

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

    // ===== RATE-LIMIT / FOUT-GUARD =====
    // Bij een rate limit (429) of fout geeft Strava een OBJECT i.p.v. een array.
    // Zonder deze check zou .filter() crashen en de bezoeker op het algemene
    // foutscherm belanden zónder uitleg. Nu sturen we 'm naar een herkenbare
    // 'het is even druk'-melding.
    if (!Array.isArray(activiteiten)) {
      console.error('Strava activiteiten geen array (mogelijk rate limit):', activiteitenRes.status, activiteiten);
      return res.redirect('/?error=strava_druk');
    }

    const alleActiviteitenRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const alleActiviteitenRaw = await alleActiviteitenRes.json();
    // De 'alle activiteiten'-lijst is secundair (alleen voor FTP-fallback en max
    // HR). Mislukt 'ie, val dan terug op de 90-dagen-lijst i.p.v. te crashen.
    const alleActiviteiten = Array.isArray(alleActiviteitenRaw) ? alleActiviteitenRaw : activiteiten;

    const fietsritten90 = activiteiten.filter(a => a.type === 'Ride' || a.type === 'VirtualRide');

    // Stream data ophalen kost 1 API-call per rit. We cappen op MAX_STREAMS en
    // halen ze in kleine batches op (zie mapMetLimiet) i.v.m. de rate limit.
    // Niet de nieuwste 50 pakken — dan mis je een piek-inspanning in een oudere
    // rit. We scoren op gemiddeld vermogen + een deel van het piekvermogen,
    // zodat punchy interval-ritten niet door de mand vallen.
    const MAX_STREAMS = 50;
    const STREAM_CONCURRENCY = 6; // max gelijktijdige stream-calls
    const hardheid = a => (a.average_watts || 0) + (a.max_watts || 0) * 0.15;
    const rittenMetVermogen = fietsritten90
      .filter(a => a.average_watts && a.average_watts > 0)
      .sort((a, b) => hardheid(b) - hardheid(a));
    const rittenZonderVermogen = fietsritten90.filter(a => !a.average_watts);
    const rittenVoorStreams = [...rittenMetVermogen, ...rittenZonderVermogen].slice(0, MAX_STREAMS);

    const streamResults = await mapMetLimiet(rittenVoorStreams, STREAM_CONCURRENCY, (rit) =>
      fetch(`https://www.strava.com/api/v3/activities/${rit.id}/streams?keys=watts,heartrate&key_by_type=true`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      .then(r => r.json())
      .then(stream => ({ id: rit.id, stream }))
      .catch(() => ({ id: rit.id, stream: null }))
    );

    const streamMap = {};
    streamResults.forEach(r => { if (r && r.stream && !r.stream.errors) streamMap[r.id] = r.stream; });

    const stats = berekenStats(activiteiten, alleActiviteiten, athlete, streamMap);

    // ===== LOSKOPPELEN (deauthorize) =====
    // Eenmalig rapport: data is binnen en wordt zo verzegeld in de blob, de live
    // koppeling hebben we niet meer nodig. Meteen loskoppelen => slot vrij +
    // compliance-plus (data-minimalisatie, read-only). Een mislukte loskoppeling
    // mag het rapport NOOIT blokkeren, dus in een eigen try/catch dat alleen logt.
    try {
      const deauthRes = await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      console.log('Strava deauthorize:', deauthRes.status, '· athleet', athlete?.id);
    } catch (deauthErr) {
      console.error('Deauthorize mislukt (rapport gaat door):', deauthErr);
    }

    // ===== GATE: versleutel de analyse, zet 'm in browseropslag, geef alleen
    // een onschuldige preview mee in de URL. Geen FTP/zones in de browser. =====
    const blob = seal(stats);
    const preview = {
      naam: stats.naam,
      aantalActiviteiten: stats.aantalActiviteiten,
      urenPerWeek: stats.urenPerWeek,
      vo2maxSessies: stats.vo2maxSessies,
      gemIntensiteit: stats.gemIntensiteit,
      herstelScore: stats.herstelScore,
      herstelLabel: stats.herstelLabel,
      heeftVermogensmeter: stats.heeftVermogensmeter
    };
    const pvParam = encodeURIComponent(JSON.stringify(preview));
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Even geduld…</title></head>` +
      `<body style="background:#0d0d0d;color:#fafafa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
      `<p style="opacity:.5;font-size:14px">Analyse laden…</p>` +
      `<script>try{localStorage.setItem('pp_blob',${JSON.stringify(blob)});}catch(e){}` +
      `location.replace(${JSON.stringify('/?ready=1&pv=' + pvParam)});</script>` +
      `</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

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
      herstelScore: null,
      herstelLabel: null,
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
  const rittenMetEchtVermogen = alleRitten.filter(a => a.average_watts && a.device_watts === true);
  const rittenMetSchatting = alleRitten.filter(a => a.average_watts && a.average_watts > 50);
  const heeftEchteVermogensmeter = rittenMetEchtVermogen.length >= 3;
  const heeftVermogensmeter = rittenMetEchtVermogen.length >= 1 || rittenMetSchatting.length >= 5;
  const vermogenIsGeschat = !heeftEchteVermogensmeter && rittenMetSchatting.length >= 5;

  // ===== FTP DETECTIE =====
  let ftp = null;
  let ftpBronnen = [];

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

  const ftpWindows = [
    { naam: '1min',  sec: 60,   factor: 0.72, gewicht: 1 },
    { naam: '5min',  sec: 300,  factor: 0.88, gewicht: 2 },
    { naam: '12min', sec: 720,  factor: 0.94, gewicht: 3 },
    { naam: '20min', sec: 1200, factor: 0.95, gewicht: 4 },
  ];

  const piek = {};
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
      const wattsData = streamMap[rit.id]?.watts?.data;
      if (!wattsData || wattsData.length < 180) return false;
      const beste3min = besteRollingGemiddelde(wattsData, 180);
      if (!beste3min || (beste3min / ftp) < 1.08) return false;
      const secsBoven = wattsData.filter(w => w && (w / ftp) > 1.05).length;
      return secsBoven >= 240;
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
      const hrData = streamMap[rit.id]?.heartrate?.data;
      if (!hrData || hrData.length < 180) return false;
      const beste3minHr = besteRollingGemiddelde(hrData, 180);
      if (!beste3minHr || beste3minHr < omslagpunt) return false;
      const secsBoven = hrData.filter(hr => hr && hr > omslagpunt).length;
      return secsBoven >= 240;
    }).length;

  } else {
    zones = [5, 50, 30, 10, 5, 0];
    vo2maxSessies = 0;
  }

  const totaalZone = zones.reduce((s, v) => s + v, 0) || 1;
  const zonesPct = zones.map(z => Math.round((z / totaalZone) * 100));
  const diff = 100 - zonesPct.reduce((s,v)=>s+v,0);
  if (diff !== 0) zonesPct[0] += diff;

  // ===== ZWARE RITTEN + HERSTELBALANS-SCORE 1-10 =====
  const zwaarRitten = fietsritten90.filter(rit => {
    if (heeftVermogensmeter && ftp && rit.average_watts) {
      if ((rit.average_watts / ftp) >= 0.76) return true;
      const wd = streamMap[rit.id]?.watts?.data;
      if (wd) {
        const b3 = besteRollingGemiddelde(wd, 180);
        if (b3 && (b3 / ftp) >= 1.00) return true;
      }
      return false;
    }
    if (omslagpunt && rit.average_heartrate) return rit.average_heartrate >= omslagpunt * 0.90;
    return false;
  }).length;
  const rustigeRitten = Math.max(0, fietsritten90.length - zwaarRitten);
  const hardAandeel = fietsritten90.length > 0 ? (zwaarRitten / fietsritten90.length) * 100 : 0;

  let herstelScore = 10;
  if (hardAandeel > 45) herstelScore -= 5;
  else if (hardAandeel > 35) herstelScore -= 3;
  else if (hardAandeel > 28) herstelScore -= 1;
  if (maxGapDagen > 21) herstelScore -= 3;
  else if (maxGapDagen > 14) herstelScore -= 2;
  else if (maxGapDagen > 10) herstelScore -= 1;
  herstelScore = Math.max(1, Math.min(10, herstelScore));

  const herstelLabel = herstelScore >= 8 ? 'sterk hersteld'
    : herstelScore >= 6 ? 'in balans'
    : herstelScore >= 4 ? 'let op'
    : 'overbelastingsrisico';

  const herstelRatioGetal = zwaarRitten > 0
    ? '1:' + Math.round(rustigeRitten / zwaarRitten)
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
    herstelScore,
    herstelLabel,
    zwaarRitten,
    maxGapDagen,
    gemAfstandPerWeek,
    langsteRit,
    rittenRuw,
    heeftStreamData,
  };
}
