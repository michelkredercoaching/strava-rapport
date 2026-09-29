// /api/lead.js
// Eén endpoint voor de e-mailcapture én de hervat-route, zodat we binnen de
// Vercel Hobby-limiet van 12 serverless functions blijven.
//
// POST — capture direct na de Strava-koppeling, vóór de betaalmuur:
//   1. Bewaart de analyse (blob + preview) 30 dagen in Redis onder een
//      willekeurig hervat-id, zodat de knop in de verlaten-mails de bezoeker
//      terugbrengt bij zijn eigen resultaat (?hervat=<id> op de funnel).
//   2. Zet het adres in Mailchimp (Keuzehulp-audience) met de tag
//      'pp-niet-afgemaakt' (trigger van de journey "PP verlaten analyse")
//      en het hervat-id in mergeveld PPHERVAT.
//   Mislukt Redis of Mailchimp, dan blokkeert dat de funnel nooit: de
//   bezoeker gaat gewoon door naar zijn resultaat en wij loggen de fout.
//
// GET ?id=<hervat-id> — geeft de bewaarde analyse terug (pv, blob, email).
//   Het id is 24 tekens willekeurige hex en alleen bekend via de mail van de
//   eigenaar; de blob is bovendien versleuteld (seal), dus hier lekt geen
//   leesbare trainingsdata.
import crypto from 'node:crypto';
import { bepaalPijn, bepaalDecouplingSignaal, bepaalRennerstype } from '../lib/pijn-signalen.js';
import { unseal } from '../lib/gate.js';

const MC_KEY  = process.env.MAILCHIMP_API_KEY;      // ...-usXX
const MC_LIST = process.env.MAILCHIMP_LIST_ID;
const MC_DC   = MC_KEY ? MC_KEY.split('-')[1] : null;

// Zelfde Upstash-koppeling als lib/korting.js: marketplace maakt KV_-namen,
// een handmatige koppeling UPSTASH_-namen. We accepteren allebei.
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) { console.error('Redis fout (lead):', r.status); return { ok: false }; }
    const j = await r.json();
    return { ok: true, result: j.result };
  } catch (e) { console.error('Redis exception (lead):', e); return { ok: false }; }
}

// Welke trechters we tellen. Alleen deze namen mogen een eigen serie sleutels
// maken, zodat niemand met een losse POST de Redis-ruimte kan volgooien.
// 'wp' telt per instappunt, met velden in de vorm "schema_ads:checkout".
const TRECHTERS = ['pp', 'schema', 'wp'];

// ===== RECENTE KOPERS (social proof op de landingspagina) =====
// De analyse wordt op twee manieren verkocht en geen van beide systemen ziet de
// andere, dus we halen ze allebei op:
//   - het subdomein rekent rechtstreeks bij Mollie af (herkenbaar aan het veld
//     'nonce' in de metadata, want WooCommerce-betalingen hebben dat niet);
//   - de landingspagina's verkopen via WooCommerce-product 12131.
// Zie ook scripts/analyse-verkopen.mjs, dat dezelfde twee bronnen combineert.
const ANALYSE_PRODUCT = '12131';
const KOPERS_CACHE = 'pp:kopers:v2';   // v2: namen als 'Strava' eruit gefilterd

const KOPERS_ORIGINS = [
  'https://michelkredercoaching.nl',
  'https://www.michelkredercoaching.nl'
];

function zetKopersCors(req, res) {
  const origin = req.headers.origin || '';
  if (KOPERS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

// Woorden die wél op een naam lijken maar het niet zijn. 'Sporter' is de
// terugval in api/betaling.js als Strava geen naam teruggeeft, en er staat
// minstens één bestelling op naam van 'Strava'. "Strava deed gisteren de
// Strava-analyse" wil je niet op je landingspagina.
const GEEN_NAAM = ['strava', 'sporter', 'onbekend', 'test', 'klant', 'analyse', 'rapport', 'admin', 'info'];

// "jeroen van der berg" -> "Jeroen". Alleen de voornaam, hoofdletter erop, en
// iets wat niet op een naam lijkt laten we vallen.
function voornaam(volledig) {
  const eerste = String(volledig || '').trim().split(/\s+/)[0] || '';
  if (eerste.length < 2 || eerste.length > 20) return '';
  if (!/^[\p{L}][\p{L}'-]*$/u.test(eerste)) return '';
  if (GEEN_NAAM.includes(eerste.toLowerCase())) return '';
  return eerste.charAt(0).toUpperCase() + eerste.slice(1).toLowerCase();
}

async function haalMollieKopers(vanaf) {
  const key = process.env.MOLLIE_API_KEY;
  if (!key) return [];
  // Eén pagina is ruim genoeg: 250 betalingen dekken bij dit volume meer dan
  // een kwartaal, en we kijken maar 30 dagen terug. Geen paginering dus, dat
  // scheelt seconden in de functietimeout.
  const r = await fetch('https://api.mollie.com/v2/payments?limit=250', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error('Mollie ' + r.status);
  const j = await r.json();
  return (j._embedded?.payments || [])
    .filter(p => p.status === 'paid' && p.metadata && typeof p.metadata === 'object' && p.metadata.nonce)
    .filter(p => new Date(p.createdAt) >= vanaf)
    .map(p => ({ naam: voornaam(p.metadata.naam), datum: p.createdAt.slice(0, 10) }));
}

async function haalWooKopers(vanaf) {
  const basis = (process.env.WC_URL || '').replace(/\/$/, '');
  const ck = process.env.WC_CONSUMER_KEY;
  const cs = process.env.WC_CONSUMER_SECRET;
  if (!basis || !ck || !cs) return [];
  const auth = 'Basic ' + Buffer.from(ck + ':' + cs).toString('base64');
  const u = `${basis}/wp-json/wc/v3/orders?per_page=50&after=${vanaf.toISOString().slice(0, 19)}`
          + `&status=processing,completed&orderby=date&order=desc`;
  const r = await fetch(u, { headers: { Authorization: auth }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('WooCommerce ' + r.status);
  const j = await r.json();
  return (Array.isArray(j) ? j : [])
    .filter(o => (o.line_items || []).some(li => String(li.product_id) === ANALYSE_PRODUCT))
    .map(o => ({ naam: voornaam(o.billing?.first_name), datum: String(o.date_created || '').slice(0, 10) }));
}

async function haalRecenteKopers() {
  const c = await redis(['GET', KOPERS_CACHE]);
  if (c.ok && c.result) {
    try { return JSON.parse(c.result); } catch { /* kapotte cache: opnieuw ophalen */ }
  }

  const vanaf = new Date(Date.now() - 30 * 86400000);
  // Valt één bron weg, dan tonen we gewoon de andere in plaats van niets.
  const [mollie, woo] = await Promise.all([
    haalMollieKopers(vanaf).catch(e => { console.error('Mollie-kopers:', e.message); return []; }),
    haalWooKopers(vanaf).catch(e => { console.error('Woo-kopers:', e.message); return []; })
  ]);

  const uit = [...mollie, ...woo]
    .filter(k => k.naam && k.datum)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1))
    .slice(0, 25);

  // Alleen wegschrijven als er echt iets in zit, anders cachen we een storing
  // een uur lang vast.
  if (uit.length) await redis(['SET', KOPERS_CACHE, JSON.stringify(uit), 'EX', '3600']);
  return uit;
}

export default async function handler(req, res) {
  // ===== TRECHTERRAPPORT: dagcijfers per scherm uitlezen =====
  // Afgeschermd met TRECHTER_SLEUTEL (Vercel-omgevingsvariabele). Zonder die
  // sleutel in de omgeving staat de route helemaal dicht.
  if (req.method === 'GET' && req.query && req.query.trechter) {
    const sleutel = process.env.TRECHTER_SLEUTEL || '';
    if (!sleutel || String(req.query.trechter) !== sleutel) {
      return res.status(403).json({ error: 'Geen toegang' });
    }
    // Elke dag is één Redis-call, dus we houden het bereik klein genoeg om
    // ruim binnen de functietimeout te blijven.
    const dagen = Math.min(60, Math.max(1, Number(req.query.dagen) || 14));
    // Elke funnel heeft zijn eigen serie sleutels: 'pp' is de Strava-analyse op
    // dit subdomein, 'schema' is de Meta-landingspagina op de WordPress-site.
    const funnel = TRECHTERS.includes(String(req.query.funnel || '')) ? String(req.query.funnel) : 'pp';
    const uit = {};
    for (let i = 0; i < dagen; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const r = await redis(['HGETALL', `${funnel}:trechter:${d}`]);
      if (r.ok && Array.isArray(r.result) && r.result.length) {
        const rij = {};
        for (let j = 0; j < r.result.length; j += 2) rij[r.result[j]] = Number(r.result[j + 1]);
        uit[d] = rij;
      }
    }
    return res.status(200).json(uit);
  }

  // ===== RECENTE KOPERS: voor het social-proof-blokje op de landingspagina =====
  // Stond daar als vaste lijst van twintig namen met bevroren teksten ("2 dagen
  // geleden"). Die tekst klopte op de dag dat de lijst geschreven werd en daarna
  // nooit meer. Nu komt hij uit de echte bestellingen en rekent de pagina zelf
  // uit hoe lang geleden het was.
  //
  // PRIVACY: alleen de VOORNAAM en de DATUM, geen achternaam, geen plaats, geen
  // tijdstip. Met opzet dag-nauwkeurig; wie precies om 09:57 kocht hoeft niet
  // herleidbaar te zijn. Zie ook het privacybeleid.
  if (req.method === 'GET' && req.query && req.query.kopers) {
    zetKopersCors(req, res);
    try {
      const uit = await haalRecenteKopers();
      // Een uur cachen aan de rand: de lijst verandert hooguit een paar keer per
      // dag en zo hoeft niet elke bezoeker op Mollie en WooCommerce te wachten.
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json({ kopers: uit });
    } catch (e) {
      console.error('Recente kopers ophalen mislukt:', e);
      // Leeg teruggeven in plaats van een fout: de pagina valt dan terug op
      // haar eigen noodlijstje en de bezoeker merkt niets.
      return res.status(200).json({ kopers: [] });
    }
  }

  // ===== HERVAT: bewaarde analyse terughalen =====
  if (req.method === 'GET') {
    const id = String((req.query && req.query.id) || '');
    if (!/^[0-9a-f]{16,48}$/.test(id)) {
      return res.status(400).json({ error: 'Ongeldig id' });
    }
    const r = await redis(['GET', `pp:hervat:${id}`]);
    if (!r.ok || !r.result) {
      return res.status(404).json({ error: 'Niet gevonden of verlopen' });
    }
    let data;
    try { data = JSON.parse(r.result); } catch (e) {
      return res.status(404).json({ error: 'Niet gevonden of verlopen' });
    }
    return res.status(200).json({
      pv: data.pv || {},
      blob: data.blob || '',
      email: data.email || ''
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ===== TRECHTERMETING: één scherm van één bezoeker =====
  // De funnel stuurt dit met sendBeacon, zonder e-mailadres. Geen persoons-
  // gegevens, alleen een teller per dag per scherm. 90 dagen bewaartermijn.
  // De WordPress-kant stuurt met content-type text/plain, zodat de browser geen
  // CORS-preflight hoeft te doen. Dan is req.body een string in plaats van een
  // object, dus we pakken beide vormen op.
  let meting = req.body;
  if (typeof meting === 'string') {
    try { meting = JSON.parse(meting); } catch (e) { meting = null; }
  }
  if (meting && meting.stap) {
    const stap = String(meting.stap).slice(0, 48);
    const funnel = TRECHTERS.includes(String(meting.funnel || '')) ? String(meting.funnel) : 'pp';
    // De dubbele punt scheidt het instappunt van de stap in de wp-trechter.
    if (/^[a-z0-9_:]{1,48}$/.test(stap)) {
      const dag = new Date().toISOString().slice(0, 10);
      const sleutel = `${funnel}:trechter:${dag}`;
      await redis(['HINCRBY', sleutel, stap, '1']);
      await redis(['EXPIRE', sleutel, '7776000']);
    }
    return res.status(204).end();
  }

  const { email, pv, blob } = req.body || {};
  const adres = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres) || adres.length > 200) {
    return res.status(400).json({ error: 'Ongeldig e-mailadres' });
  }

  // Alleen bekende, onschuldige preview-velden overnemen (client-input).
  const preview = {};
  if (pv && typeof pv === 'object') {
    for (const k of [
      'naam', 'aantalActiviteiten', 'urenPerWeek', 'prestatiescore', 'vo2maxSessies', 'ftpBetrouwbaarheid', 'heeftVermogensmeter',
      // Zelfde diagnose als de koper-journey (zie lib/pijn-signalen.js), zodat
      // de verlaten-mails ook een droomuitkomst + decoupling-signaal kunnen
      // tonen voor wie al zo ver kwam dat de analyse daadwerkelijk draaide.
      'zones', 'ftp', 'omslagpunt', 'decoupling', 'decouplingHr',
    ]) {
      if (pv[k] !== undefined) preview[k] = pv[k];
    }
  }
  const verzegeld = (typeof blob === 'string' && blob.length < 500000) ? blob : '';

  // 1) Analyse bewaren onder een hervat-id (30 dagen). De blob is al
  //    versleuteld (seal), dus hier staat niets gevoeligs leesbaar in Redis.
  let hervatId = crypto.randomBytes(12).toString('hex');
  const opgeslagen = await redis([
    'SET', `pp:hervat:${hervatId}`,
    JSON.stringify({ pv: preview, blob: verzegeld, email: adres }),
    'EX', '2592000'
  ]);
  if (!opgeslagen.ok) hervatId = '';

  // 2) Naar Mailchimp. Tag eerst weghalen en dan opnieuw plaatsen: alleen een
  //    NIEUW geplaatste tag triggert de journey, zodat iemand die later nóg
  //    een analyse start de verlaten-mails opnieuw kan krijgen (re-entry aan).
  if (MC_KEY && MC_LIST && MC_DC) {
    const hash = crypto.createHash('md5').update(adres).digest('hex');
    const base = `https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST}`;
    const auth = 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64');
    // ===== ECHTE CIJFERS SERVER-SIDE, NOOIT VIA DE BROWSER =====
    // De preview die de browser meestuurt is met opzet kaal (geen FTP/zones,
    // zie strava-callback.js), dus PIJN/BIJPIJN/RENTYPE kwamen hier tot
    // 21-09-2026 feitelijk nooit binnen. De volledige analyse staat wél al
    // versleuteld in 'verzegeld' (dezelfde blob die /api/betaling na Mollie
    // ontsleutelt) — die maken we hier server-side even open, puur om de
    // categorie-signalen te berekenen. De ontsleutelde cijfers verlaten deze
    // functie nooit richting de browser, alleen de afgeleide merge-fields
    // gaan naar Mailchimp (Michel, 21-09-2026).
    let stats = null;
    if (verzegeld) {
      try { stats = unseal(verzegeld); } catch (e) { console.error('Blob ontsleutelen mislukte (blokkeert niet):', e.message); }
    }
    const bron = stats || preview;
    // FNAME en PPHERVAT alleen meesturen als we iets hebben, zodat we een
    // eerder bekende naam of werkende hervat-link nooit leegmaken.
    const merge = {};
    if (bron.naam) merge.FNAME = String(bron.naam).trim().replace(/\b\p{L}/gu, c => c.toUpperCase());
    if (hervatId) merge.PPHERVAT = hervatId;
    // MEETMETH zodat de verlaten-mails de juiste spoor-tekst tonen (omslagpunt
    // vs FTP). heeftVermogensmeter is het effectieve spoor.
    const meetmethode = bron.heeftVermogensmeter !== undefined ? (bron.heeftVermogensmeter ? 'vermogen' : 'hartslag') : undefined;
    if (meetmethode) merge.MEETMETH = meetmethode;
    if (bron.ftp != null) merge.FTP = String(bron.ftp);
    if (bron.omslagpunt != null && bron.omslagpunt !== '') merge.OMSLAG = String(bron.omslagpunt);
    // PIJN/BIJPIJN alleen zetten als de analyse ook echt draaide (zones
    // bekend), anders is dit een lead die nog vóór dat punt afhaakte.
    if (Array.isArray(bron.zones) && bron.zones.length) {
      const pijnInput = {
        zones: bron.zones.join('-'),
        vo2max: bron.vo2maxSessies,
        meetmethode,
        decoupling: bron.decoupling,
        decouplingHr: bron.decouplingHr,
      };
      const { pijn } = bepaalPijn(pijnInput);
      const { bijpijn, decouplTxt } = bepaalDecouplingSignaal(pijnInput);
      merge.PIJN = pijn;
      merge.BIJPIJN = bijpijn;
      merge.DECOUPLTXT = decouplTxt;
    }
    // RENTYPE — zelfde rennerstype-diagnose als het rapport en de koper-mail,
    // nu ook al bruikbaar in de verlaten-journey voor wie op vermogen zit.
    if (meetmethode === 'vermogen' && bron.ftp && bron.piek1min) {
      const wGewVoorType = (bron.weight >= 35 && bron.weight <= 200) ? bron.weight : null;
      // Vierde argument = de 12/20-min piek. Zonder die is de FTP zelf uit de
      // korte pieken afgeleid en zou het type circulair zijn, dus geeft
      // bepaalRennerstype dan null (zie lib/pijn-signalen.js, 23-09-2026).
      const langePiekVoorType = parseInt(bron.piek20min) || parseInt(bron.piek12min) || null;
      const rennerstype = bepaalRennerstype(bron.ftp, bron.piek1min, wGewVoorType, langePiekVoorType);
      if (rennerstype) merge.RENTYPE = rennerstype.type;
    }
    try {
      await fetch(`${base}/members/${hash}`, {
        method: 'PUT',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_address: adres,
          status_if_new: 'subscribed',
          merge_fields: merge
        }),
        signal: AbortSignal.timeout(10000)
      });
      await fetch(`${base}/members/${hash}/tags`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [{ name: 'pp-niet-afgemaakt', status: 'inactive' }] }),
        signal: AbortSignal.timeout(10000)
      });
      await fetch(`${base}/members/${hash}/tags`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [{ name: 'pp-niet-afgemaakt', status: 'active' }] }),
        signal: AbortSignal.timeout(10000)
      });
      console.log('Mailchimp lead OK:', adres, '| hervat:', hervatId ? 'ja' : 'nee');
    } catch (e) { console.error('Mailchimp lead faalde (blokkeert niet):', e); }
  } else {
    console.log('Mailchimp lead overslaan (config mist)');
  }

  return res.status(200).json({ ok: true });
}
