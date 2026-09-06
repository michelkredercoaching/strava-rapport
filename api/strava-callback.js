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

// ===== ACTIVITEITEN OPHALEN, MET PAGINERING =====
// (Rinze-case, 2 september 2026.) Hiervoor haalden we EEN pagina van 100
// activiteiten op, zonder ooit door te bladeren. Die 100 tellen ALLE sporten mee,
// dus ook loopjes, wandelingen en krachttraining. Wie veel logt kreeg daardoor
// maar een deel van het venster van 90 dagen te zien, en het rapport rekende
// vervolgens die brokstukken om over 13 weken: te weinig ritten, te weinig uren.
// Nu bladeren we door tot de laatste pagina.
//
// Strava geeft maximaal 200 per pagina, dus de meeste sporters zijn na een
// enkele call binnen. MAX_ACT_PAGINAS is puur een noodrem tegen eindeloos
// doorbladeren; 1000 activiteiten in 90 dagen komt in de praktijk niet voor.
//
// Belangrijk: gaat een LATERE pagina onderuit (rate limit, netwerk), dan geven
// we ok:false terug in plaats van de halve lijst. Een incompleet venster levert
// namelijk precies dezelfde stille misrekening op als de oude bug.
const ACT_PER_PAGE = 200;
const MAX_ACT_PAGINAS = 5;
async function haalActiviteiten(accessToken, extraQuery = '') {
  const alles = [];
  for (let pagina = 1; pagina <= MAX_ACT_PAGINAS; pagina++) {
    const r = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${ACT_PER_PAGE}&page=${pagina}${extraQuery}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    // Bij 429 of een fout stuurt Strava een OBJECT i.p.v. een array.
    if (!Array.isArray(data)) return { ok: false, status: r.status, fout: data, paginas: pagina };
    alles.push(...data);
    if (data.length < ACT_PER_PAGE) return { ok: true, activiteiten: alles, paginas: pagina, compleet: true };
  }
  console.warn(`Paginalimiet geraakt (${MAX_ACT_PAGINAS} x ${ACT_PER_PAGE}) — lijst mogelijk afgekapt`);
  return { ok: true, activiteiten: alles, paginas: MAX_ACT_PAGINAS, compleet: false };
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
    const venster = await haalActiviteiten(accessToken, `&after=${negentigDagenGeleden}`);

    // ===== RATE-LIMIT / FOUT-GUARD =====
    // Bij een rate limit (429) of fout geeft Strava een OBJECT i.p.v. een array.
    // Zonder deze check zou .filter() crashen en de bezoeker op het algemene
    // foutscherm belanden zónder uitleg. Nu sturen we 'm naar een herkenbare
    // 'het is even druk'-melding. Idem als pagina 2 of verder onderuit gaat: dan
    // is het venster incompleet en mogen we er geen rapport op bouwen.
    if (!venster.ok) {
      console.error('Strava activiteiten niet compleet (mogelijk rate limit):', venster.status, '· pagina', venster.paginas, venster.fout);
      return res.redirect('/?error=strava_druk');
    }
    const activiteiten = venster.activiteiten;
    console.log(`Activiteiten in 90 dagen: ${activiteiten.length} (${venster.paginas} pagina(s))`);

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
      // Kwam de 401/403 doordat een PARALLELLE run van dezelfde sporter net de
      // app-brede deauthorize deed, dan heeft die run z'n correcte HTML vlak
      // daarvoor al gecachet (cachen gebeurt vóór loskoppelen). Serveer die dan
      // alsnog i.p.v. de foutpagina — de sporter ziet gewoon z'n eigen rapport.
      if (tokenGeraakt && athlete?.id) {
        const gecachedParallel = cacheGet(athlete.id);
        if (gecachedParallel) {
          console.log('Parallelle run — token weg, maar cache-hit · athleet', athlete.id);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(gecachedParallel.html);
        }
      }
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

    // ===== GEEN MEETDATA? DAN OOK GEEN BETAALPAGINA =====
    // (Rinze-case, 2 september 2026): ritten gevonden, maar zonder bruikbaar
    // vermogen en zonder bruikbare hartslag. Het rapport zou dan draaien op de
    // vaste placeholder-zones uit berekenStats, dus op verzonnen cijfers. Dat
    // mogen we niet verkopen. Zelfde afhandeling als 'geen ritten': uitleggen,
    // loskoppelen, geen betaling.
    if (!stats.rapportBasis) {
      console.log('Geen bruikbare meetdata · athleet', athlete?.id, '· ritten', stats.aantalActiviteiten, '· rapport-flow afgebroken');
      await deauthorize(accessToken, athlete?.id);
      return res.redirect('/?error=geen_meetdata');
    }

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
    // BELANGRIJK: cachen VÓÓR het loskoppelen. Een parallelle dubbel-run krijgt
    // pas een 401/403 op z'n streams zodra deze deauthorize landt — en dan staat
    // de correcte HTML dus al in de cache, zodat die run 'm alsnog kan serveren
    // (zie de token-guard hierboven) i.p.v. de "even druk"-foutpagina.
    if (athlete?.id) cacheSet(athlete.id, html);

    // Eenmalig rapport: data is binnen en verzegeld in de blob, de live koppeling
    // hebben we niet meer nodig. Loskoppelen => slot vrij + compliance-plus
    // (data-minimalisatie, read-only).
    await deauthorize(accessToken, athlete?.id);

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
      // Achternaam apart houden: 'naam' is de aanhef in het rapport en de mails
      // ("Hoi Niels"), de achternaam is alleen voor de factuur. Strava geeft 'm
      // mee, en zonder dit veld zette de factuurcode de voornaam er twee keer op.
      achternaam: athlete?.lastname || '',
      rapportBasis: null,
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
      bonusFtp: null,
      bonusFtpBetrouwbaarheid: null,
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
      decoupling: null,        // ===== HARTSLAG-DECOUPLING =====
      decouplingMinuten: null,
      decouplingBetrouwbaarheid: null,
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

  // ===== HULPFUNCTIES STREAM-ANALYSE =====
  // besteRollingGemiddelde: hoogste voortschrijdende gemiddelde over een venster.
  // besteVenster: idem, maar geeft ook de POSITIE van dat venster terug, zodat we
  // de hartslag over exact hetzelfde stuk kunnen uitrekenen (nodig voor de
  // HR-plausibiliteitscheck in de FTP-detectie).
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
  function besteVenster(data, vensterSec) {
    if (!data || data.length < vensterSec) return null;
    let som = 0;
    for (let i = 0; i < vensterSec; i++) som += (data[i] || 0);
    let beste = som, besteStart = 0;
    for (let i = vensterSec; i < data.length; i++) {
      som += (data[i] || 0) - (data[i - vensterSec] || 0);
      if (som > beste) { beste = som; besteStart = i - vensterSec + 1; }
    }
    return { avg: beste / vensterSec, start: besteStart, eind: besteStart + vensterSec };
  }

  // ===== MAX HARTSLAG =====
  // Staat bewust BOVEN de FTP-detectie: de HR-plausibiliteitscheck daar heeft
  // maxHf nodig. Het blok hangt alleen af van alleRitten/fietsritten90.
  //
  // Een borstband/optische sensor schrijft af en toe een onmogelijke piek weg
  // (bv. 245 bpm). Vroeger pakten we simpelweg de 3 HOOGSTE rit-maxima — juist
  // dán selecteer je de glitch, met een veel te hoog omslagpunt tot gevolg. Nu
  // filteren we twee keer:
  //   1) een hard fysiologisch plafond (glitch-achtervang: alles daarboven is
  //      vrijwel zeker meetfout);
  //   2) een mediaan-check die uitschieters t.o.v. de sporter zélf weggooit — een
  //      sensor-spike staat ver boven de mediaan van je rit-maxima, een reële piek
  //      slechts iets. Van wat overblijft nemen we de top-3 en middelen die.
  // De twee constanten staan bewust los zodat je ze makkelijk kunt bijstellen.
  // MAX_HF_MARGE = 20 kan bij sterk gepolariseerde training (veel rustige ritten)
  // een reële piek net iets afknijpen; dat valt aan de LAGE kant uit (bewuste
  // keuze). Zie je maxHf structureel te laag, zet MAX_HF_MARGE dan op 25.
  const MAX_HF_PLAFOND = 200;   // bpm; alles hierboven telt als meetfout
  const MAX_HF_MARGE   = 20;    // bpm die een piek boven de mediaan mag uitsteken
  function plausibeleMaxHr(ritten) {
    const ruw = ritten
      .filter(a => a.max_heartrate && a.max_heartrate > 100 && a.max_heartrate <= MAX_HF_PLAFOND)
      .map(a => a.max_heartrate)
      .sort((a, b) => a - b);                 // oplopend, voor de mediaan
    if (ruw.length < 4) {                      // te weinig data om te filteren
      return ruw.slice().sort((a, b) => b - a).slice(0, 3);
    }
    const mediaan = ruw[Math.floor(ruw.length / 2)];
    return ruw
      .filter(v => v <= mediaan + MAX_HF_MARGE) // uitschieters t.o.v. de sporter eruit
      .sort((a, b) => b - a)                    // hoogste eerst
      .slice(0, 3);
  }

  const maxHrWaarden = plausibeleMaxHr(alleRitten);
  const maxHrFallback = plausibeleMaxHr(fietsritten90);

  const gebruikteHrWaarden = maxHrWaarden.length > 0 ? maxHrWaarden : maxHrFallback;
  const maxHfSummary = gebruikteHrWaarden.length > 0
    ? Math.round(gebruikteHrWaarden.reduce((s, v) => s + v, 0) / gebruikteHrWaarden.length)
    : null;

  // ===== KRUIS-CHECK MAX-HF MET DE HR-STREAM =====
  // Het mediaan-filter hierboven vangt sensor-glitches, maar knijpt bij een sterk
  // gepolariseerde rijder (veel rustige ritten, af en toe een harde) de ECHTE
  // piek weg: zijn harde rit-maxima staan ver boven de mediaan en vliegen er als
  // "uitschieter" uit. Dan komt maxHf te laag uit en wordt het omslagpunt
  // onterecht afgetopt (min(..., maxHf × 0,93)) — precies de Dries-case (max 143
  // terwijl hij 12/20 min rond 170 bpm reed, fysiek onmogelijk).
  // Een hard volgehouden inspanning bewijst dat je max minstens zo hoog ligt. We
  // nemen daarom de beste voortschrijdende 15-seconden-HR uit de streams (een
  // losse sensor-spike overleeft dat gemiddelde niet), houden hetzelfde
  // fysiologische plafond aan, en gebruiken de hoogste van summary en stream.
  let streamMaxHf = null;
  fietsritten90.forEach(rit => {
    const hrData = streamMap[rit.id]?.heartrate?.data;
    if (!hrData || hrData.length < 15) return;
    const beste15s = besteRollingGemiddelde(hrData, 15);
    if (beste15s && beste15s > 100 && beste15s <= MAX_HF_PLAFOND) {
      const afgerond = Math.round(beste15s);
      if (!streamMaxHf || afgerond > streamMaxHf) streamMaxHf = afgerond;
    }
  });
  const maxHf = Math.max(maxHfSummary || 0, streamMaxHf || 0) || null;
  console.log(`Max HF: ${maxHf} bpm (summary ${maxHfSummary ?? '-'}, stream-15s ${streamMaxHf ?? '-'})`);

  // ===================================================================
  // ===== FTP DETECTIE (met plausibiliteitsfilter) =====
  // ===================================================================
  // Vier verdedigingslagen tegen één ongekalibreerde/geschatte rit die de FTP
  // omhoog kaapt:
  //   1) BRON       – alleen echte meter (device_watts === true) telt mee.
  //   2) HARTSLAG   – een 12/20-min piekvermogen dat niet bij een drempel-HR
  //                   hoort is geen echte inspanning → genegeerd.
  //   3) DOMINANTIE – wint één rit ≥3 van de 4 vensters én is 'ie niet met HR
  //                   te verifiëren → uitgesloten en herrekend. Wél HR-
  //                   geverifieerd = echte topdag → behouden.
  //   4) VORM/W-kg  – te vlakke curve of onmogelijke W/kg → betrouwbaarheid laag.
  let ftp = null;
  let ftpBronnen = [];

  const ftpWindows = [
    { naam: '1min',  sec: 60,   factor: 0.72, gewicht: 1 },
    { naam: '5min',  sec: 300,  factor: 0.88, gewicht: 2 },
    { naam: '12min', sec: 720,  factor: 0.94, gewicht: 3 },
    { naam: '20min', sec: 1200, factor: 0.95, gewicht: 4 },
  ];

  const PIEK_FILTER = {
    hrCheckVensters: [720, 1200], // HR-plausibiliteit alleen op 12 en 20 min
    hrMinFractie: 0.85,           // piek-venster-HR ≥ 85% van max-HR = echte inspanning
    hrMinDekking: 0.80,           // minstens 80% van het venster moet HR-data hebben
    dominantieVensters: 3,        // wint één rit ≥ dit aantal vensters → verdacht
    minVormRatio: 1.30,           // piek1min / piek20min hieronder = te vlak (geen test)
    maxWattPerKg: 6.0,            // hierboven vrijwel zeker meetfout voor deze doelgroep
  };

  let heeftPowerStream = false;
  let aantalRittenMetStream = 0;
  let piekFilterNotities = [];

  // (1) BRON — alleen ritten met een echte meter. Geschat vermogen piekt op
  // afdalingen en is de #1 bron van rotdata → uitgesloten voor de pieken.
  let powerRitten = fietsritten90.filter(r =>
    r.device_watts === true && streamMap[r.id]?.watts?.data?.length >= 60
  );
  let bronIsEcht = true;
  // Vangnet: niemand met een echte meter, maar wél streams (iemand rijdt alleen
  // op geschat vermogen)? Dan gebruiken we die tóch, maar betrouwbaarheid wordt
  // nooit 'hoog'.
  if (powerRitten.length === 0) {
    powerRitten = fietsritten90.filter(r => streamMap[r.id]?.watts?.data?.length >= 60);
    if (powerRitten.length) {
      bronIsEcht = false;
      piekFilterNotities.push('geen echte meter — geschatte streams gebruikt');
    }
  }

  // Per venster de piek van ELKE rit verzamelen, met de HR over datzelfde stuk.
  // Zo oordelen we per rit i.p.v. blind de hoogste te pakken.
  const kandidaten = {};          // { [sec]: [{ id, peak, hrAvg, hrDekking }] }
  ftpWindows.forEach(w => { kandidaten[w.sec] = []; });

  powerRitten.forEach(rit => {
    const wattsData = streamMap[rit.id].watts.data;
    const hrData = streamMap[rit.id]?.heartrate?.data;
    heeftPowerStream = true;
    aantalRittenMetStream++;
    ftpWindows.forEach(w => {
      const v = besteVenster(wattsData, w.sec);
      if (!v || v.avg <= 50) return;
      let hrAvg = null, hrDekking = 0;
      if (hrData) {
        let som = 0, n = 0;
        for (let i = v.start; i < v.eind; i++) {
          const h = hrData[i];
          if (h != null && h > 40) { som += h; n++; }
        }
        if (n) { hrAvg = som / n; hrDekking = n / w.sec; }
      }
      kandidaten[w.sec].push({ id: rit.id, peak: v.avg, hrAvg, hrDekking });
    });
  });

  // (2) HARTSLAG-CHECK + piek kiezen, per venster.
  // Alleen op lange vensters (12/20 min). Bij 1/5 min loopt HR achter op het
  // vermogen, dus daar is een HR-drempel onbetrouwbaar. Een lange piek die op
  // herstel-HR draait is geen drempelinspanning → het vermogen klopt niet met de
  // inspanning → weg. Ritten zonder bruikbare HR laten we staan (kunnen we niet
  // beoordelen); die vangen we op dominantie/vorm/W-kg.
  // exclude = rit-id dat volledig genegeerd wordt (voor de dominantie-herrekening).
  // logIgnore = of we de 'genegeerd'-notities schrijven (alleen op de eerste pass).
  function kiesPieken(exclude = null, logIgnore = true) {
    const uit = {}, bron = {}, geverifieerd = {};
    ftpWindows.forEach(w => {
      let lijst = kandidaten[w.sec].filter(k => k.id !== exclude);
      const isHrVenster = PIEK_FILTER.hrCheckVensters.includes(w.sec) && maxHf;
      const drempel = maxHf ? maxHf * PIEK_FILTER.hrMinFractie : null;
      if (isHrVenster) {
        lijst = lijst.filter(k => {
          const bruikbaar = k.hrAvg != null && k.hrDekking >= PIEK_FILTER.hrMinDekking;
          if (!bruikbaar) return true;           // geen oordeel mogelijk → houden
          if (k.hrAvg < drempel) {
            if (logIgnore) piekFilterNotities.push(
              `rit ${k.id} ${w.naam}: ${Math.round(k.peak)}W bij ${Math.round(k.hrAvg)}bpm (< ${Math.round(drempel)}) → genegeerd`
            );
            return false;
          }
          return true;
        });
      }
      if (lijst.length) {
        lijst.sort((a, b) => b.peak - a.peak);   // hoogste van wat overblijft
        const gekozen = lijst[0];
        uit[w.sec] = gekozen.peak;
        bron[w.sec] = gekozen.id;
        // Is de GEKOZEN piek gedekt door een échte drempel-HR? Alleen op de lange
        // vensters (12/20 min) en alleen dan telt 'ie als bewijs van een échte
        // duurinspanning. Een piek die enkel bleef staan omdat er geen bruikbare
        // HR was (no-HR-rit), of die uit een blok ver onder je drempel komt, is
        // GEEN bewijs → geverifieerd blijft false. Voedt de betrouwbaarheid (4c).
        if (isHrVenster) {
          geverifieerd[w.sec] = gekozen.hrAvg != null
            && gekozen.hrDekking >= PIEK_FILTER.hrMinDekking
            && gekozen.hrAvg >= drempel;
        }
      }
    });
    return { uit, bron, geverifieerd };
  }

  let { uit: piek, bron: piekBron, geverifieerd: piekGeverifieerd } = kiesPieken();

  // (3) DOMINANTIE — welke rit levert de piek uit hoeveel vensters?
  function bepaalDominant(bron) {
    const lijst = Object.values(bron);
    if (!lijst.length) return null;
    const telling = {};
    lijst.forEach(id => { telling[id] = (telling[id] || 0) + 1; });
    const [topId, topAantal] = Object.entries(telling).sort((a, b) => b[1] - a[1])[0];
    return topAantal >= PIEK_FILTER.dominantieVensters
      ? { id: Number(topId), aantal: topAantal }
      : null;
  }

  let dominantieVerdacht = false;
  const dom = bepaalDominant(piekBron);
  if (dom) {
    // Kon deze rit op minstens één lang venster mét een geldige HR als échte
    // drempelinspanning worden bevestigd? Zo ja → echte topdag, behouden.
    const geverifieerd = PIEK_FILTER.hrCheckVensters.some(sec => {
      const k = kandidaten[sec].find(x => x.id === dom.id);
      return k && k.hrAvg != null && k.hrDekking >= PIEK_FILTER.hrMinDekking
               && maxHf && k.hrAvg >= maxHf * PIEK_FILTER.hrMinFractie;
    });
    if (geverifieerd) {
      piekFilterNotities.push(`rit ${dom.id} domineert ${dom.aantal}/${ftpWindows.length} maar is HR-geverifieerd → echte topdag, behouden`);
    } else {
      ({ uit: piek, bron: piekBron, geverifieerd: piekGeverifieerd } = kiesPieken(dom.id, false));
      dominantieVerdacht = true;
      piekFilterNotities.push(`rit ${dom.id} domineert ${dom.aantal}/${ftpWindows.length} en niet met HR te verifiëren → uitgesloten, herrekend`);
    }
  }

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
          console.log(`FTP ${w.naam}: piek ${Math.round(piek[w.sec])}W × ${w.factor} × ${schatFactor} = ${schatting}W (gewicht ${w.gewicht}, rit ${piekBron[w.sec]})`);
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

  // (4) BETROUWBAARHEID — bron, dominantie, curvevorm en W/kg samen.
  // Alleen een uit échte stream-data berekende, plausibele FTP is 'hoog'.
  let ftpBetrouwbaarheid = null;
  if (ftp) {
    ftpBetrouwbaarheid = heeftPowerStream ? 'hoog' : 'laag';
    const verlaag = () => { ftpBetrouwbaarheid = ftpBetrouwbaarheid === 'hoog' ? 'gemiddeld' : 'laag'; };

    if (!bronIsEcht) ftpBetrouwbaarheid = 'laag';   // geen echte meter
    if (dominantieVerdacht) verlaag();               // verdachte rit eruit gehaald

    // (4a) VORM — een echte power curve daalt duidelijk van 1 → 20 min.
    if (piek[60] && piek[1200]) {
      const vorm = piek[60] / piek[1200];
      if (vorm < PIEK_FILTER.minVormRatio) {
        ftpBetrouwbaarheid = 'laag';
        piekFilterNotities.push(`curve te vlak (1min/20min = ${vorm.toFixed(2)} < ${PIEK_FILTER.minVormRatio}) → geen echte test`);
      }
    }

    // (4b) W/kg-plafond — onmogelijke waarde = data klopt niet, wat de rest ook zegt.
    if (weight) {
      const wkg = ftp / weight;
      if (wkg > PIEK_FILTER.maxWattPerKg) {
        ftpBetrouwbaarheid = 'laag';
        piekFilterNotities.push(`${wkg.toFixed(1)} W/kg boven plafond ${PIEK_FILTER.maxWattPerKg} → onwaarschijnlijk`);
      }
    }

    // (4c) LANGE INSPANNING — FTP is een DUURmetric. 'Hoog' mag alleen als er
    // bewijs is van een échte drempelinspanning van 12 of 20 min: de gekozen
    // piek op dat venster moet gedekt zijn door een HR ≥ 85% van je max. Is die
    // dekking er niet (geen hartslag op die rit, óf je reed dat blok ruim onder
    // je drempel, óf er is überhaupt geen lang venster), dan leunt de FTP in
    // feite op je korte pieken. Dat is een voorzichtige ONDERgrens, geen gemeten
    // plafond — precies de Ard-case (232W "hoog" terwijl z'n zwaarste 20 min op
    // 151bpm bij een drempel van 177 lag). Zo'n getal krijgt nooit 'hoog'.
    const langGeverifieerd = !!(piekGeverifieerd[720] || piekGeverifieerd[1200]);
    if (ftpBetrouwbaarheid === 'hoog' && !langGeverifieerd) {
      ftpBetrouwbaarheid = 'gemiddeld';
      piekFilterNotities.push('geen HR-geverifieerde 12/20-min inspanning → FTP is een ondergrens, betrouwbaarheid verlaagd naar gemiddeld');
    }
  }
  if (piekFilterNotities.length) console.log('Piekfilter:', piekFilterNotities.join(' · '));

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

  // ===== SPOOR-KEUZE: vermogen of hartslag =====
  // Eén losse vermogensrit mag het rapport niet kapen. Alleen ECHTE vermogensdata
  // telt mee (device_watts of een per-seconde power-stream), niet Strava's
  // geschatte watts. Zit er in minder dan 60% van je ritten echt vermogen, dan
  // draait het hele rapport op je omslagpunt (representatieve hartslagzones); een
  // wel-gedetecteerde FTP tonen we dan als bonusgetal.
  const rittenMetEchtePower = fietsritten90.filter(a =>
    a.device_watts === true || (streamMap[a.id]?.watts?.data)
  ).length;
  const powerDekking = fietsritten90.length ? rittenMetEchtePower / fietsritten90.length : 0;

  // Heeft het hartslag-spoor überhaupt data om op te draaien? Zonder ook maar één
  // rit met average_heartrate én zonder HR-stream voor het omslagpunt levert de
  // zone-analyse [0,0,0,0,0] op → de diff-correctie (zie zonesPct) dumpt de volle
  // 100% in "Herstel" en we verkopen een verzonnen rapport (Marcel-case, juli
  // 2026: 33% powerdekking → HR-spoor, maar géén HR-data → 100% herstel, 0
  // kwaliteitssessies, omslagpunt enkel een schatting).
  const hrSpoorHeeftBasis = gemHr != null || omslagpuntBron === 'stream';

  // Een gevonden FTP is niet genoeg: normaal eist het vermogen-spoor 60% dekking
  // zodat één losse power-rit het rapport niet kaapt. MAAR een FTP die uit échte
  // per-seconde stream-data komt (heeftPowerStream) is betrouwbaar; die mag met
  // minder dekking al op vermogen — anders belandt een sporter met gemengde data
  // (buiten mét meter, binnen zonder) onterecht op het hartslag-spoor.
  //
  // HOMETRAINER-RIJDER: wie buiten zonder meter rijdt maar regelmatig binnen mét
  // vermogen traint, haalt die 40% dekking niet, terwijl z'n FTP wél op meerdere
  // échte power-sessies rust. Daarom mag het vermogen-spoor ook bij lagere dekking
  // (≥ 20%) zolang er GENOEG echte power-ritten zijn (≥ MIN_POWER_RITTEN). De
  // dominantie-filter hierboven gooit een enkele uitschieter er al uit, dus met
  // meerdere power-ritten kan één losse rit het rapport niet kapen.
  //
  // EN (Marcel-fix): heeft de sporter een échte stream-FTP terwijl het HR-spoor
  // géén basis heeft, dan is een powerrapport met lagere dekking altijd beter dan
  // een leeg (verzonnen) hartslagrapport → dan tóch vermogen, ongeacht dekking.
  const MIN_POWER_RITTEN = 3;   // minimum aantal échte power-ritten voor lage-dekking-vermogen
  const gebruikVermogen = !!(ftp && (
    powerDekking >= 0.60 ||
    (heeftPowerStream && powerDekking >= 0.40) ||
    (heeftPowerStream && powerDekking >= 0.20 && aantalRittenMetStream >= MIN_POWER_RITTEN) ||
    (heeftPowerStream && !hrSpoorHeeftBasis)
  ));
  console.log(`Spoor: ${gebruikVermogen ? 'VERMOGEN' : 'HARTSLAG'} · dekking ${Math.round(powerDekking * 100)}% (${rittenMetEchtePower}/${fietsritten90.length}) · ftp ${ftp || '-'}W · stream ${heeftPowerStream ? 'ja' : 'nee'} · hr-basis ${hrSpoorHeeftBasis ? 'ja' : 'nee'}`);

  // ===================================================================
  // ===== HARTSLAG-DECOUPLING (Pw:HR-drift) =====
  // ===================================================================
  // Alleen zinvol op het vermogen-spoor: decoupling vergelijkt vermogen tegen
  // hartslag binnen dezelfde rit, dus zonder vermogensmeter is er niets om
  // tegen te decouplen. We pakken de LANGSTE rit met minstens 2 uur bruikbare
  // watts- én HR-stream, en alleen als de rit overwegend steady is (Variability
  // Index onder de grens hieronder) — op een interval- of wedstrijdrit zegt
  // drift niets over de aerobe basis, dat verklaart alleen de pieken.
  // Methode (Coggan aerobic decoupling): eerste 10 minuten (warming-up-drift)
  // negeren, de rest in twee gelijke helften splitsen, per helft het
  // vermogen:hartslag-quotiënt nemen, en het verschil tussen die twee
  // quotiënten uitdrukken als percentage van de eerste helft.
  const DECOUPLING_MIN_SEC = 120 * 60;   // minimaal 2 uur streamdata
  const DECOUPLING_MAX_VI = 1.15;        // boven dit punt is de rit te grillig (intervallen/wedstrijd)
  const DECOUPLING_WARMUP_SEC = 600;     // eerste 10 min negeren

  function normalizedPower(wattsData) {
    if (!wattsData || wattsData.length < 30) return null;
    let som = 0;
    for (let i = 0; i < 30; i++) som += (wattsData[i] || 0);
    const rollend = [som / 30];
    for (let i = 30; i < wattsData.length; i++) {
      som += (wattsData[i] || 0) - (wattsData[i - 30] || 0);
      rollend.push(som / 30);
    }
    const gemVierdeMacht = rollend.reduce((s, v) => s + Math.pow(v, 4), 0) / rollend.length;
    return Math.pow(gemVierdeMacht, 0.25);
  }

  function bepaalDecoupling(wattsData, hrData) {
    if (!wattsData || !hrData) return null;
    const lengte = Math.min(wattsData.length, hrData.length);
    if (lengte < DECOUPLING_MIN_SEC) return null;

    const gemVermogen = wattsData.slice(0, lengte).reduce((s, w) => s + (w || 0), 0) / lengte;
    if (gemVermogen <= 0) return null;
    const np = normalizedPower(wattsData.slice(0, lengte));
    if (!np) return null;
    const vi = np / gemVermogen;
    if (vi > DECOUPLING_MAX_VI) return null;   // te grillig, geen steady duurrit

    const start = DECOUPLING_WARMUP_SEC < lengte * 0.4 ? DECOUPLING_WARMUP_SEC : 0;
    const rest = lengte - start;
    if (rest < 3600) return null;              // na de warming-up nog minstens 1 uur nodig
    const midden = start + Math.floor(rest / 2);

    const gemVanaf = (data, van, tot) => {
      let som = 0, n = 0;
      for (let i = van; i < tot; i++) { const v = data[i]; if (v != null && v > 0) { som += v; n++; } }
      return n > 0 ? som / n : null;
    };
    const p1 = gemVanaf(wattsData, start, midden), p2 = gemVanaf(wattsData, midden, lengte);
    const h1 = gemVanaf(hrData, start, midden), h2 = gemVanaf(hrData, midden, lengte);
    if (!p1 || !p2 || !h1 || !h2) return null;

    const ratio1 = p1 / h1, ratio2 = p2 / h2;
    const pct = ((ratio1 - ratio2) / ratio1) * 100;
    return { pct: Math.round(pct * 10) / 10, vi: Math.round(vi * 100) / 100, minuten: Math.round(lengte / 60) };
  }

  let decoupling = null, decouplingRitId = null;
  if (gebruikVermogen) {
    const kandidatenDecoupling = fietsritten90
      .filter(r => (streamMap[r.id]?.watts?.data?.length || 0) >= DECOUPLING_MIN_SEC && (streamMap[r.id]?.heartrate?.data?.length || 0) >= DECOUPLING_MIN_SEC)
      .sort((a, b) => streamMap[b.id].watts.data.length - streamMap[a.id].watts.data.length);   // langste eerst
    for (const rit of kandidatenDecoupling) {
      const res = bepaalDecoupling(streamMap[rit.id].watts.data, streamMap[rit.id].heartrate.data);
      if (res) { decoupling = res; decouplingRitId = rit.id; break; }
    }
    if (decoupling) console.log(`Decoupling: ${decoupling.pct}% (VI ${decoupling.vi}, ${decoupling.minuten} min, rit ${decouplingRitId})`);
    else console.log('Decoupling: geen kwalificerende duurrit (≥2u, steady) gevonden');
  }

  // ===== HARDE STOP: IS ER UBERHAUPT MEETDATA? =====
  // (Rinze-case, 2 september 2026.) Zonder vermogen-spoor en zonder omslagpunt
  // valt de zone-analyse hieronder terug op een VASTE, verzonnen verdeling
  // ([5,50,30,10,5]) met vo2maxSessies = 0. Dat rapport ziet er compleet uit,
  // maar er zit geen enkele meting in: labels als 'TE HOOG' en de kritieke
  // bevinding '0 sessies boven je omslagpunt' slaan dan nergens op.
  // 'hrSpoorHeeftBasis' bestond al (Marcel-fix), maar stuurde alleen de
  // spoorkeuze aan en blokkeerde de verkoop niet. Nu wel: is rapportBasis null,
  // dan breekt de handler de flow af voor de betaalpagina.
  const hartslagBruikbaar = !!(omslagpunt && hrSpoorHeeftBasis);
  const rapportBasis = gebruikVermogen ? 'vermogen' : (hartslagBruikbaar ? 'hartslag' : null);
  if (!rapportBasis) console.log('Geen bruikbare meetdata: geen vermogen-spoor en geen hartslag-basis');

  // ===== ZONE ANALYSE =====
  let zones = [0, 0, 0, 0, 0, 0];
  let vo2maxSessies = 0;
  let heeftStreamData = false;

  if (gebruikVermogen) {
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
    if (gebruikVermogen && rit.average_watts) {
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
  const _isPowerZones = gebruikVermogen;
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
  // De 1/5/12/20-min pieken zijn hierboven al berekend (en gefilterd) voor de
  // FTP-detectie (piek[sec]). We geven ze nu mee in W, zodat de frontend ze deelt
  // door het gewicht → W/kg-power-curve, en de interne verkoopmail de FTP kan
  // herrekenen. Null als er geen (bruikbare) stream-data was.
  const piek1min  = piek[60]   ? Math.round(piek[60])   : null;
  const piek5min  = piek[300]  ? Math.round(piek[300])  : null;
  const piek12min = piek[720]  ? Math.round(piek[720])  : null;
  const piek20min = piek[1200] ? Math.round(piek[1200]) : null;
  // ===== HR-PIEKEN ===== beste 12- en 20-min hartslag (bpm) uit je streams,
  // dezelfde piekHr die het omslagpunt voedt — voor inzicht in de interne mail.
  const piek12minHr = piekHr[720]  ? Math.round(piekHr[720])  : null;
  const piek20minHr = piekHr[1200] ? Math.round(piekHr[1200]) : null;

  return {
    naam: athlete?.firstname || 'Sporter',
    // Achternaam apart houden: 'naam' is de aanhef in het rapport en de mails
    // ("Hoi Niels"), de achternaam is alleen voor de factuur. Strava geeft 'm
    // mee, en zonder dit veld zette de factuurcode de voornaam er twee keer op.
    achternaam: athlete?.lastname || '',
    rapportBasis,          // 'vermogen' | 'hartslag' | null (null = niets te analyseren)
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
    heeftVermogensmeter: gebruikVermogen,   // effectief spoor (na 60%-drempel), stuurt teaser/paywall/rapport
    heeftEchteVermogensmeter,
    vermogenIsGeschat,
    ftp: gebruikVermogen ? ftp : null,       // op het hartslag-spoor geen FTP op de kaart
    ftpBetrouwbaarheid: gebruikVermogen ? ftpBetrouwbaarheid : null,
    bonusFtp: (!gebruikVermogen && ftp) ? ftp : null,                       // wel gedetecteerd? toon als bonus
    bonusFtpBetrouwbaarheid: (!gebruikVermogen && ftp) ? ftpBetrouwbaarheid : null,
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
    piek12minHr,     // ===== HR ===== beste 12-min hartslag in bpm (of null)
    piek20minHr,     // ===== HR ===== beste 20-min hartslag in bpm (of null)
    decoupling: decoupling ? decoupling.pct : null,               // ===== HARTSLAG-DECOUPLING ===== Pw:HR-drift in % (of null)
    decouplingMinuten: decoupling ? decoupling.minuten : null,
    decouplingBetrouwbaarheid: decoupling ? 'hoog' : null,        // alleen gezet als er een kwalificerende rit was
  };
}
