// /api/strava-callback.js
// Gedeelde versleuteling + nonce (zie /lib/gate.js).
import { seal, nieuweNonce } from '../lib/gate.js';

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

// ===== LOSKOPPELEN (deauthorize) =====
// Strava's deauthorize trekt ALLE tokens van deze atleet voor onze app in. Loopt
// dezelfde atleet kort daarna nóg eens door de funnel, dan is het token al
// app-breed dood en antwoordt Strava met 401 — dat is "al losgekoppeld", geen
// echte fout. We loggen 401 daarom op log-niveau (telt niet als error in Vercel)
// en sturen het token mee als access_token-parameter (Strava's gedocumenteerde
// vorm, betrouwbaarder dan de Bearer-header). Mag het rapport NOOIT blokkeren.
async function deauthorize(accessToken, athleteId) {
  try {
    const r = await fetch(
      `https://www.strava.com/oauth/deauthorize?access_token=${accessToken}`,
      { method: 'POST' }
    );
    if (r.ok) console.log('Strava losgekoppeld · athleet', athleteId);
    else if (r.status === 401) console.log('Strava al losgekoppeld (401) · athleet', athleteId);
    else console.warn('Strava deauthorize onverwacht:', r.status, '· athleet', athleteId);
  } catch (e) {
    console.error('Deauthorize mislukt (rapport gaat door):', e);
  }
}

// ===== DEDUPE / DUBBELE-RUN GUARD =====
// Dezelfde sporter vuurt de callback soms 2-3x kort achter elkaar af (refresh,
// dubbele redirect). Elke run doet ~50 stream-calls; 2 runs zitten al boven
// Strava's 100/15min-limiet → de latere run krijgt 429 op alle streams en zou
// terugvallen op een foutieve FTP. Daarom cachen we de gegenereerde HTML kort
// per atleet in het geheugen: een snelle herhaling krijgt dezelfde (correcte)
// analyse terug zónder Strava opnieuw te bevragen.
// Best-effort: geldt binnen een warme instance, niet over cold starts. Voor een
// harde garantie zou je een KV-store (Vercel KV / Upstash) gebruiken.
const _blobCache = globalThis.__ppBlobCache || (globalThis.__ppBlobCache = new Map());
const CACHE_TTL_MS = 90 * 1000;
function cacheGet(id) {
  const hit = _blobCache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) { _blobCache.delete(id); return null; }
  return hit;
}
function cacheSet(id, html) {
  _blobCache.set(id, { html, t: Date.now() });
  // Lichte opruiming zodat de Map niet eindeloos groeit.
  if (_blobCache.size > 200) {
    const nu = Date.now();
    for (const [k, v] of _blobCache) if (nu - v.t > CACHE_TTL_MS) _blobCache.delete(k);
  }
}

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?error=strava_denied');
  }

  // ===== SCOPE-CHECK =====
  // Strava laat de sporter op het toestemmingsscherm het vinkje 'activiteiten
  // bekijken die je als privé hebt gemarkeerd' uitzetten. Zonder
  // activity:read_all krijgen we bij sporters met privé-ritten een LEGE lijst
  // → leeg rapport (Ed-case, juli 2026). De daadwerkelijk verleende scope komt
  // als parameter mee op deze redirect; wijkt die af, dan meteen uitleggen
  // i.p.v. een lege analyse maken.
  const verleendeScope = String(req.query.scope || '');
  if (verleendeScope && !verleendeScope.includes('activity:read_all')) {
    console.log('Scope zonder activity:read_all verleend:', verleendeScope);
    return res.redirect('/?error=scope_prive');
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

    // Snelle herhaling? Serveer de eerder gemaakte analyse en sla de zware
    // Strava-flow over (voorkomt rate-limit + dubbele deauth). Het nieuwe token
    // koppelen we nog wel netjes los.
    const gecached = athlete?.id ? cacheGet(athlete.id) : null;
    if (gecached) {
      console.log('Dubbele run — cache hit · athleet', athlete.id);
      await deauthorize(accessToken, athlete?.id);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(gecached.html);
    }

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

    // We onthouden of we een 429 zagen: dan is een lege streamMap géén "deze rit
    // heeft geen power" maar "we werden geknepen" — en dat behandelen we anders.
    let rateLimitGeraakt = false;
    // FIX: 401/403 op een stream betekent dat het token TIJDENS de run is
    // ingetrokken — meestal doordat dezelfde sporter dubbel-tapt en een
    // parallelle callback al de app-brede deauthorize heeft uitgevoerd. Dat
    // mogen we NIET als "geen power" interpreteren (→ foutieve lage FTP), maar
    // als "even opnieuw proberen", net als bij een rate limit.
    let tokenGeraakt = false;
    const streamResults = await mapMetLimiet(rittenVoorStreams, STREAM_CONCURRENCY, (rit) =>
      fetch(`https://www.strava.com/api/v3/activities/${rit.id}/streams?keys=watts,heartrate&key_by_type=true`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      .then(async r => {
        if (r.status === 429) { rateLimitGeraakt = true; return { id: rit.id, stream: null }; }
        if (r.status === 401 || r.status === 403) { tokenGeraakt = true; return { id: rit.id, stream: null }; } // FIX
        const stream = await r.json();
        return { id: rit.id, stream };
      })
      .catch(() => ({ id: rit.id, stream: null }))
    );

    const streamMap = {};
    streamResults.forEach(r => { if (r && r.stream && !r.stream.errors) streamMap[r.id] = r.stream; });

    // ===== VEILIGHEIDSNET TEGEN FOUTIEVE FTP =====
    // Heeft de sporter power-ritten, maar kregen we GEEN enkele stream binnen
    // door rate-limiting (429) OF een ingetrokken token (401/403), dan zou de
    // FTP-detector terugvallen op rit-gemiddelden/NP en fors te laag uitkomen
    // (bv. 244W i.p.v. ~290W). Dat rapport mogen we NIET verkopen. Liever een
    // nette "even te druk, probeer zo opnieuw".
    const rittenMetPower = fietsritten90.filter(a => a.average_watts && a.average_watts > 0);
    const streamsGelukt = Object.keys(streamMap).length;
    if (rittenMetPower.length >= 3 && streamsGelukt === 0 && (rateLimitGeraakt || tokenGeraakt)) { // FIX
      const oorzaak = rateLimitGeraakt ? 'rate limit (429)' : 'token ingetrokken (401/403, parallelle run)';
      console.error(`Geen stream-data — ${oorzaak} — athleet ${athlete?.id} — rapport afgebroken i.p.v. foutieve FTP`);
      return res.redirect('/?error=strava_druk');
    }

    const stats = berekenStats(activiteiten, alleActiviteiten, athlete, streamMap);

    // ===== GEEN RITTEN? DAN GEEN BETAALPAGINA =====
    // (Ed-case, juli 2026): 0 fietsritten in 90 dagen → voorheen liep de
    // sporter gewoon door naar de paywall en kocht een leeg rapport. Nu
    // leggen we uit wat er waarschijnlijk aan de hand is (verkeerd account,
    // of alle ritten op 'Alleen jij' zonder het privé-vinkje).
    if (!stats.aantalActiviteiten) {
      console.log('Geen fietsritten in 90 dagen · athleet', athlete?.id, '· rapport-flow afgebroken');
      await deauthorize(accessToken, athlete?.id);
      return res.redirect('/?error=geen_ritten');
    }

    // Eenmalig rapport: data is binnen en wordt zo verzegeld in de blob, de live
    // koppeling hebben we niet meer nodig. Meteen loskoppelen => slot vrij +
    // compliance-plus (data-minimalisatie, read-only).
    await deauthorize(accessToken, athlete?.id);

    // ===== GATE: versleutel de analyse, zet 'm in browseropslag, geef alleen
    // een onschuldige preview mee in de URL. Geen FTP/zones in de browser. =====
    // BINDING (punt 6): unieke nonce in de blob. /api/betaling zet 'm in de
    // Mollie-metadata, /api/rapport controleert 'm — zo hoort elke betaling bij
    // precies één analyse.
    stats.nonce = nieuweNonce();
    const blob = seal(stats);
    const preview = {
      naam: stats.naam,
      aantalActiviteiten: stats.aantalActiviteiten,
      urenPerWeek: stats.urenPerWeek,
      vo2maxSessies: stats.vo2maxSessies,
      gemIntensiteit: stats.gemIntensiteit,
      herstelScore: stats.herstelScore,
      herstelLabel: stats.herstelLabel,
      heeftVermogensmeter: stats.heeftVermogensmeter,
      ftpBetrouwbaarheid: stats.ftpBetrouwbaarheid,        // ← zodat de teaser (s3c) de juiste betrouwbaarheid toont
      omslagpuntBetrouwbaarheid: stats.omslagpuntBetrouwbaarheid  // ← HR-spoor: betrouwbaarheid van het omslagpunt (geen bpm-waarde, dus veilig vóór betaling)
    };
    const pvParam = encodeURIComponent(JSON.stringify(preview));
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Even geduld…</title></head>` +
      `<body style="background:#0d0d0d;color:#fafafa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
      `<p style="opacity:.5;font-size:14px">Analyse laden…</p>` +
      `<script>try{localStorage.setItem('pp_blob',${JSON.stringify(blob)});}catch(e){}` +
      `location.replace(${JSON.stringify('/?ready=1&pv=' + pvParam)});</script>` +
      `</body></html>`;

    // In de dedupe-cache zodat een snelle herhaling dezelfde analyse terugkrijgt.
    if (athlete?.id) cacheSet(athlete.id, html);

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

  // ===== W/KG: GEWICHT UIT STRAVA =====
  // Strava geeft het profielgewicht (kg) mee in het athlete-object, mits de
  // sporter het heeft ingevuld. Ontbreekt of onzinnig → null, dan vraagt de
  // frontend het als fallback op het rapport. Gedeeld door beide return-paden.
  const _gewichtKg = athlete?.weight;
  const weight = (_gewichtKg && _gewichtKg >= 35 && _gewichtKg <= 200)
    ? Math.round(_gewichtKg * 10) / 10
    : null;

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
      ftpBetrouwbaarheid: null,
      maxHf: null,
      omslagpunt: null,
      omslagpuntBetrouwbaarheid: null,
      maxGapDagen: 90,
      gemAfstandPerWeek: 0,
      langsteRit: 0,
      herstelScore: null,
      herstelLabel: null,
      weight,                 // ===== W/KG =====
      piek1min: null,
      piek5min: null,
      piek12min: null,
      piek20min: null,
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

  // ===== FALLBACK (geen stream-data) =====
  // Zonder per-seconde data is een echte drempel niet te bepalen. Beste
  // benadering: normalized power (weighted_average_watts) van een stevige rit
  // van 20-90 min — dat ligt dicht bij FTP. Pas als die ontbreekt vallen we terug
  // op het rit-gemiddelde, dat fors ONDERschat (een hele rit telt afdalen en
  // uitbollen mee). Hoe dan ook: dit is een schatting → betrouwbaarheid 'laag'.
  if (!ftp) {
    const rittenVoorFtp = alleRitten.filter(a =>
      a.average_watts && a.average_watts > 50 && a.moving_time > 600
    );
    if (rittenVoorFtp.length > 0) {
      const metNp = rittenVoorFtp
        .filter(a => a.weighted_average_watts > 50 && a.moving_time >= 1200 && a.moving_time <= 5400)
        .sort((a, b) => b.weighted_average_watts - a.weighted_average_watts);
      if (metNp.length > 0) {
        ftp = Math.round(metNp[0].weighted_average_watts * 0.95 * schatFactor);
        console.log(`FTP fallback (NP 20-90min rit): ${ftp}W`);
      } else {
        const korteHarde = rittenVoorFtp
          .filter(a => a.moving_time >= 720 && a.moving_time <= 3600)
          .sort((a, b) => b.average_watts - a.average_watts);
        if (korteHarde.length > 0) {
          ftp = Math.round(korteHarde[0].average_watts * 0.95 * schatFactor);
          console.log(`FTP fallback (12-60min rit, gem watt): ${ftp}W`);
        } else {
          const gesorteerd = [...rittenVoorFtp].sort((a, b) => b.average_watts - a.average_watts);
          ftp = Math.round(gesorteerd[0].average_watts * 1.0 * schatFactor);
          console.log(`FTP fallback (hoogste gem): ${ftp}W`);
        }
      }
    }
  }

  // Betrouwbaarheid hangt af van de BRON, niet van het aantal ritten: alleen een
  // uit stream-data berekende FTP is 'hoog'; een fallback-schatting is 'laag'.
  const ftpBetrouwbaarheid = !ftp ? null : (heeftPowerStream ? 'hoog' : 'laag');

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

  // ===== OMSLAGPUNT (drempelhartslag / LTHR) =====
  // Voorheen een platte 90% × max-HR. Nu data-gedreven uit je hartslag-streams,
  // net als de FTP uit vermogen — maar met twee vensters i.p.v. vier: de beste
  // 12- en 20-minuten voortschrijdende hartslag. 30-60 min voluit doet bijna
  // niemand, dus daar rekenen we niet op; het 12-min venster vangt de renner die
  // wél een stevig blok reed maar geen volle 20 min. Een langer venster ligt
  // dichter bij je drempel (kleinere correctie), een korter venster ligt er iets
  // boven (grotere correctie). We tellen een venster alleen mee als het uit een
  // échte inspanning komt (piek ≥ 85% van je max), middelen gewogen (20 min telt
  // zwaarder), cappen op 93% van je max, en vallen anders terug op 90% × max.
  const hrWindows = [
    { naam: '12min', sec: 720,  factor: 0.96, gewicht: 1 },
    { naam: '20min', sec: 1200, factor: 0.98, gewicht: 2 },
  ];
  const piekHr = {};
  fietsritten90.forEach(rit => {
    const hrData = streamMap[rit.id]?.heartrate?.data;
    if (!hrData || hrData.length < 720) return;             // minstens 12 min HR-stream
    hrWindows.forEach(w => {
      const beste = besteRollingGemiddelde(hrData, w.sec);
      if (beste && beste > 100 && (!piekHr[w.sec] || beste > piekHr[w.sec])) piekHr[w.sec] = beste;
    });
  });

  let omslagpunt = null;
  let omslagpuntBron = null;                                // 'stream' (gemeten) of 'schatting'
  let gewogenSomHr = 0, gewogenTotaalHr = 0, aantalHrVensters = 0;
  hrWindows.forEach(w => {
    const piekVal = piekHr[w.sec];
    if (piekVal && maxHf && piekVal >= maxHf * 0.85) {      // alleen een échte inspanning telt mee
      gewogenSomHr += piekVal * w.factor * w.gewicht;
      gewogenTotaalHr += w.gewicht;
      aantalHrVensters++;
    }
  });
  if (gewogenTotaalHr > 0 && maxHf) {
    omslagpunt = Math.min(Math.round(gewogenSomHr / gewogenTotaalHr), Math.round(maxHf * 0.93));
    omslagpuntBron = 'stream';
    console.log(`Omslagpunt (stream, 12/20-min HR): ${omslagpunt} bpm uit ${aantalHrVensters} venster(s)`);
  } else if (maxHf) {
    omslagpunt = Math.round(maxHf * 0.90);
    omslagpuntBron = 'schatting';
    console.log(`Omslagpunt (schatting 90% × max ${maxHf}): ${omslagpunt} bpm`);
  }
  const omslagpuntBetrouwbaarheid = !omslagpunt ? null : (omslagpuntBron === 'stream' ? 'hoog' : 'laag');

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
          if (pct < 75) zones[0]++;        // Herstel
          else if (pct < 85) zones[1]++;   // D1
          else if (pct < 90) zones[2]++;   // D2
          else if (pct < 100) zones[3]++;  // D3
          else zones[4]++;                 // Weerstand
        });
      } else if (rit.average_heartrate) {
        const pct = (rit.average_heartrate / omslagpunt) * 100;
        const t = rit.moving_time || 3600;
        const grenzen = [75, 85, 90, 100];   // Herstel / D1 / D2 / D3 / Weerstand
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
  // Zone-groepen verschillen per systeem. Vermogen (6 zones): grijs = Tempo+
  // Sweetspot, kwaliteit = FTP+VO2max. Hartslag (5 zones): grijs = alleen Tempo,
  // kwaliteit = Drempel+VO2max. Zonder deze split telt de Drempel-zone van een
  // hartslag-renner als 'grijs' mee en diagnosticeert /api/analyse 'm verkeerd.
  const _isPowerZones = heeftVermogensmeter && ftp;
  const duurZonePct = (zonesPct[0] || 0) + (zonesPct[1] || 0);
  const grijsZonePct = _isPowerZones ? (zonesPct[2] || 0) + (zonesPct[3] || 0) : (zonesPct[2] || 0);
  const kwaliteitZonePct = _isPowerZones ? (zonesPct[4] || 0) + (zonesPct[5] || 0) : (zonesPct[3] || 0) + (zonesPct[4] || 0);
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

  // ===== W/KG: PIEKVERMOGENS (power curve) =====
  // De 1/5/12/20-min pieken zijn hierboven al berekend voor de FTP-detectie
  // (piek[sec]). We geven ze nu mee in W, zodat de frontend ze deelt door het
  // gewicht → W/kg-power-curve, en de interne verkoopmail de FTP kan herrekenen.
  // Null als er geen stream-data was.
  const piek1min  = piek[60]   ? Math.round(piek[60])   : null;
  const piek5min  = piek[300]  ? Math.round(piek[300])  : null;
  const piek12min = piek[720]  ? Math.round(piek[720])  : null;
  const piek20min = piek[1200] ? Math.round(piek[1200]) : null;

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
    ftpBetrouwbaarheid,
    ftpBronnen,
    ftpUitStream: heeftPowerStream,
    aantalRittenMetStream,
    maxHf,
    omslagpunt,
    omslagpuntBetrouwbaarheid,
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
    weight,          // ===== W/KG ===== gewicht in kg (of null)
    piek1min,        // ===== W/KG ===== piekvermogen 1 min in W (of null)
    piek5min,        // ===== W/KG ===== piekvermogen 5 min in W (of null)
    piek12min,       // ===== W/KG ===== piekvermogen 12 min in W (of null)
    piek20min,       // ===== W/KG ===== piekvermogen 20 min in W (of null)
  };
}
