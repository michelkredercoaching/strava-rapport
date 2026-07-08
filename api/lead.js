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

export default async function handler(req, res) {
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

  const { email, pv, blob } = req.body || {};
  const adres = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres) || adres.length > 200) {
    return res.status(400).json({ error: 'Ongeldig e-mailadres' });
  }

  // Alleen bekende, onschuldige preview-velden overnemen (client-input).
  const preview = {};
  if (pv && typeof pv === 'object') {
    for (const k of ['naam', 'aantalActiviteiten', 'urenPerWeek', 'prestatiescore', 'vo2maxSessies', 'ftpBetrouwbaarheid', 'heeftVermogensmeter']) {
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
    // FNAME en PPHERVAT alleen meesturen als we iets hebben, zodat we een
    // eerder bekende naam of werkende hervat-link nooit leegmaken.
    const merge = {};
    if (preview.naam) merge.FNAME = String(preview.naam).trim().replace(/\b\p{L}/gu, c => c.toUpperCase());
    if (hervatId) merge.PPHERVAT = hervatId;
    // MEETMETH zodat de verlaten-mails de juiste spoor-tekst tonen (omslagpunt
    // vs FTP). heeftVermogensmeter is in de preview het effectieve spoor.
    if (preview.heeftVermogensmeter !== undefined) merge.MEETMETH = preview.heeftVermogensmeter ? 'vermogen' : 'hartslag';
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
