// /api/lid.js
// ---------------------------------------------------------------------------
// Lidmaatschap van de MKC-app: €19 per maand, automatische incasso via Mollie
// (besluit Michel 07-10-2026). Geen garantie, wel maandelijks opzegbaar.
// Zie APP-STAPPENPLAN.md.
//
// Zo werkt het bij Mollie:
//   1. Eerste betaling met sequenceType 'first' (iDEAL). Daarmee geeft de klant
//      een machtiging voor SEPA-incasso. VEREIST: SEPA-incasso staat aan in het
//      Mollie-dashboard, anders maakt Mollie geen machtiging aan.
//   2. Is die betaald, dan maakt de webhook een abonnement aan: elke maand €19,
//      eerste incasso een maand na vandaag.
//   3. Elke incasso komt weer via de webhook binnen. Betaald = toegang een maand
//      verlengen. Mislukt = status 'achterstand', toegang loopt nog 5 dagen door.
//
// Toegang tot de Core-app loopt via d.lidTot in het Core-dossier (api/core.js,
// zetLidmaatschap). Wie eerder eenmalig betaalde, houdt die toegang.
//
// Redis:
//   lid:<email>        JSON { status, customerId, subscriptionId, tot, sinds, naam }
//   lid:betaling:<id>  '1'  al verwerkt (Mollie kan een webhook vaker sturen)
//
// Routes (?actie=):
//   POST start     { t }   -> app-token; geeft de Mollie-betaallink terug
//   POST webhook   id=...  -> Mollie (form-encoded); verwerkt eerste en maandbetalingen
//   GET  status    ?t=     -> { lid } voor de app
//   POST opzeggen  { t }   -> stopt het abonnement, toegang loopt tot de betaalde datum
//
// Env: MOLLIE_API_KEY, PP_TOKEN_SECRET, UPSTASH_REDIS_REST_URL/TOKEN,
//      MAILCHIMP_API_KEY/MAILCHIMP_LIST_ID (tag mkc-lid), APP_URL (optioneel)
import crypto from 'crypto';
import { zetLidmaatschap } from './core.js';
import { maakMollieFactuur } from '../lib/mollie-factuur.js';

const MOLLIE_KEY  = process.env.MOLLIE_API_KEY || '';
const SECRET      = process.env.PP_TOKEN_SECRET || '';
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const MC_KEY      = process.env.MAILCHIMP_API_KEY || '';
const MC_LIST     = process.env.MAILCHIMP_LIST_ID || '';
const APP_URL     = process.env.APP_URL || 'https://rapport.michelkredercoaching.nl/app';
const WEBHOOK_URL = 'https://rapport.michelkredercoaching.nl/api/lid?actie=webhook';
const BEDRAG      = '19.00';
const OMSCHRIJVING = 'MKC-app lidmaatschap';
const SPELING_DAGEN = 5;     // na een mislukte incasso blijft de app nog zo lang open

// ---- Token (zelfde als api/app.js) --------------------------------------------
function handtekening(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 20);
}
function leesAppToken(token) {
  if (!SECRET || !token || typeof token !== 'string' || token.length > 400) return null;
  let tekst;
  try { tekst = Buffer.from(token, 'base64url').toString('utf8'); } catch { return null; }
  const delen = tekst.split('|');
  if (delen.length !== 4 || delen[0] !== 'app') return null;
  const [, email, expStr, sig] = delen;
  const goed = handtekening(`app|${email}|${expStr}`);
  const a = Buffer.from(String(sig)), b = Buffer.from(goed);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!/^\d+$/.test(expStr) || Date.now() > Number(expStr)) return null;
  return email;
}

// ---- Redis -------------------------------------------------------------------
async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });
    if (!r.ok) return { ok: false };
    return { ok: true, result: (await r.json()).result };
  } catch { return { ok: false }; }
}
async function haalLid(email) {
  const r = await redis(['GET', `lid:${email}`]);
  if (!r.ok || !r.result) return null;
  try { return JSON.parse(r.result); } catch { return null; }
}
async function bewaarLid(email, lid) {
  lid.gewijzigd = new Date().toISOString();
  return redis(['SET', `lid:${email}`, JSON.stringify(lid)]);
}

// ---- Mollie --------------------------------------------------------------------
async function mollie(pad, opties = {}) {
  const r = await fetch(`https://api.mollie.com/v2${pad}`, {
    ...opties,
    headers: { Authorization: `Bearer ${MOLLIE_KEY}`, 'Content-Type': 'application/json', ...(opties.headers || {}) },
    signal: AbortSignal.timeout(15000)
  });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Mollie', r.status, pad, JSON.stringify(j).slice(0, 300)); return { ok: false, status: r.status, j }; }
  return { ok: true, j };
}

// ---- Mailchimp-tag (fail-safe) -------------------------------------------------
async function mcTag(email, tag, aan = true) {
  if (!MC_KEY || !MC_LIST) return;
  try {
    const dc = MC_KEY.split('-')[1];
    const hash = crypto.createHash('md5').update(email).digest('hex');
    await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${MC_LIST}/members/${hash}/tags`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [{ name: tag, status: aan ? 'active' : 'inactive' }] }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) { console.error('Mailchimp-tag mislukt (genegeerd):', e); }
}

// ---- Datums ----------------------------------------------------------------------
const dag = (d) => new Date(d).toISOString().slice(0, 10);
function plusMaand(van) {
  const d = new Date(van);
  const doel = new Date(d); doel.setMonth(d.getMonth() + 1);
  if (doel.getDate() !== d.getDate()) doel.setDate(0);   // 31 jan -> 28/29 feb
  return doel;
}
function plusDagen(van, n) { const d = new Date(van); d.setDate(d.getDate() + n); return d; }

// ---- Helpers -------------------------------------------------------------------
async function leesBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const tekst = typeof req.body === 'string' ? req.body : '';
  try { return JSON.parse(tekst || '{}'); } catch { return Object.fromEntries(new URLSearchParams(tekst)); }
}
function lidBeeld(lid) {
  if (!lid) return { status: 'geen' };
  const open = lid.tot && Date.now() < Date.parse(lid.tot);
  return { status: lid.status, tot: lid.tot ? dag(lid.tot) : null, open: !!open, sinds: lid.sinds ? dag(lid.sinds) : null, bedrag: BEDRAG };
}

// ---- Routes ----------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const actie = String(req.query?.actie || '');
  try {
    if (actie === 'webhook') return await routeWebhook(req, res);
    if (actie === 'start') return await routeStart(req, res);
    if (actie === 'status') return await routeStatus(req, res);
    if (actie === 'opzeggen') return await routeOpzeggen(req, res);
    return res.status(400).json({ ok: false, fout: 'onbekende actie' });
  } catch (e) {
    console.error('lid fout:', e);
    return res.status(500).json({ ok: false, fout: 'serverfout' });
  }
}

async function routeStart(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!MOLLIE_KEY) return res.status(500).json({ ok: false, fout: 'Betalen lukt nu even niet.' });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Log eerst opnieuw in.' });

  let lid = await haalLid(email) || {};
  if (lid.status === 'actief' && lid.subscriptionId) return res.status(200).json({ ok: true, alLid: true });

  // Eén Mollie-klant per mailadres, hergebruiken bij opnieuw lid worden.
  if (!lid.customerId) {
    const k = await mollie('/customers', { method: 'POST', body: JSON.stringify({ name: String(body.naam || '').slice(0, 80) || email, email, metadata: { bron: 'mkc-app' } }) });
    if (!k.ok) return res.status(502).json({ ok: false, fout: 'Betalen lukt nu even niet. Probeer het zo nog eens.' });
    lid.customerId = k.j.id;
    lid.naam = String(body.naam || '').slice(0, 80);
    lid.status = lid.status || 'nieuw';
    await bewaarLid(email, lid);
  }

  const p = await mollie('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: { currency: 'EUR', value: BEDRAG },
      description: `${OMSCHRIJVING}, eerste maand`,
      customerId: lid.customerId,
      sequenceType: 'first',
      // Login mee terug: wie in de app op zijn beginscherm begon, komt na de bank
      // vaak in Safari uit, en die heeft eigen opslag (zie api/app.js).
      redirectUrl: `${APP_URL}?lid=terug&t=${encodeURIComponent(String(body.t))}`,
      webhookUrl: WEBHOOK_URL,
      metadata: { email, soort: 'lid-eerste' }
    })
  });
  if (!p.ok) return res.status(502).json({ ok: false, fout: 'Betalen lukt nu even niet. Probeer het zo nog eens.' });
  return res.status(200).json({ ok: true, url: p.j._links && p.j._links.checkout && p.j._links.checkout.href });
}

// Mollie stuurt alleen een id. We halen de betaling zelf op, dus een vervalste
// aanroep kan niets openzetten.
async function routeWebhook(req, res) {
  const body = await leesBody(req);
  const id = String(body.id || req.query?.id || '');
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return res.status(200).send('ok');
  const b = await mollie(`/payments/${id}`);
  if (!b.ok) return res.status(500).send('fout');     // Mollie probeert het later opnieuw
  const p = b.j;
  const email = String((p.metadata && p.metadata.email) || '').toLowerCase();

  // Abonnementsincasso's hebben geen metadata van ons; dan vinden we het lid
  // via de klant-id die we bij de start bewaarden.
  const lidEmail = email || await emailVoorKlant(p.customerId);
  if (!lidEmail) { console.error('Webhook zonder te herleiden lid:', id); return res.status(200).send('ok'); }
  const lid = await haalLid(lidEmail) || {};

  if (p.status === 'paid') {
    const nieuw = await redis(['SET', `lid:betaling:${id}`, '1', 'NX', 'EX', String(60 * 60 * 24 * 400)]);
    if (nieuw.ok && nieuw.result !== 'OK') return res.status(200).send('al verwerkt');
    const betaaldOp = p.paidAt || new Date().toISOString();

    if (p.sequenceType === 'first') {
      // Eerste maand binnen: abonnement aanmaken, eerste incasso over een maand.
      const start = plusMaand(betaaldOp);
      const s = await mollie(`/customers/${p.customerId}/subscriptions`, {
        method: 'POST',
        body: JSON.stringify({
          amount: { currency: 'EUR', value: BEDRAG }, interval: '1 month',
          startDate: dag(start), description: OMSCHRIJVING, webhookUrl: WEBHOOK_URL,
          metadata: { email: lidEmail }
        })
      });
      if (!s.ok) { await redis(['DEL', `lid:betaling:${id}`]); return res.status(500).send('abonnement mislukt'); }
      lid.customerId = p.customerId; lid.subscriptionId = s.j.id; lid.status = 'actief';
      lid.sinds = lid.sinds || betaaldOp;
      lid.tot = plusDagen(start, SPELING_DAGEN).toISOString();
      await redis(['SET', `lid:klant:${p.customerId}`, lidEmail]);
    } else {
      // Maandincasso binnen: een maand verlengen vanaf de huidige einddatum.
      const basis = lid.tot && Date.parse(lid.tot) > Date.now() ? plusDagen(lid.tot, -SPELING_DAGEN) : new Date(betaaldOp);
      lid.tot = plusDagen(plusMaand(basis), SPELING_DAGEN).toISOString();
      if (lid.status !== 'opgezegd') lid.status = 'actief';
    }
    await bewaarLid(lidEmail, lid);
    await zetLidmaatschap({ email: lidEmail, naam: lid.naam, tot: lid.tot });
    await mcTag(lidEmail, 'mkc-lid');
    // Factuur via Mollie Invoicing, zelfde route en schakelaar als de analyse
    // (MOLLIE_FACTUUR=aan). Fail-safe: de toegang staat al open, een factuurfout
    // mag niets blokkeren. Geen adres bekend: Mollie krijgt de placeholder uit
    // lib/mollie-factuur.js, prima voor een vereenvoudigde factuur onder €100.
    if ((process.env.MOLLIE_FACTUUR || '').toLowerCase() === 'aan') {
      try {
        const maand = new Date(betaaldOp).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
        const f = await maakMollieFactuur({ naam: lid.naam || lidEmail.split('@')[0], email: lidEmail, bedrag: (p.amount && p.amount.value) || BEDRAG, betaalId: id, omschrijving: `${OMSCHRIJVING}, ${maand}` });
        if (!f.ok) { console.error('Factuur lidmaatschap mislukt:', lidEmail, id, f.fout); await meldIntern(`FACTUUR MISLUKT - lidmaatschap - ${lidEmail}`, `Automatische factuur voor ${id} (${lidEmail}) mislukte: ${f.fout || 'onbekende fout'}. De toegang staat wel open. Maak de factuur even handmatig aan in Mollie.`); }
      } catch (e) { console.error('Factuur lidmaatschap fout:', e); }
    }
    return res.status(200).send('ok');
  }

  if (['failed', 'expired', 'canceled'].includes(p.status) && p.sequenceType === 'recurring') {
    // Incasso mislukt: lid blijft tot de einddatum (met speling) toegang houden.
    lid.status = 'achterstand';
    await bewaarLid(lidEmail, lid);
  }
  return res.status(200).send('ok');
}

// Interne melding naar Michel (alleen bij iets wat handwerk vraagt).
async function meldIntern(onderwerp, tekst) {
  const key = process.env.RESEND_API_KEY; if (!key) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Michel Kreder <michel@michelkredercoaching.nl>', to: 'michel.kredercoaching@gmail.com', subject: onderwerp, html: `<p style="font-family:Arial,sans-serif">${tekst}</p>` }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) { console.error('Interne mail mislukt:', e); }
}

async function emailVoorKlant(customerId) {
  if (!customerId) return null;
  const r = await redis(['GET', `lid:klant:${customerId}`]);
  return r.ok && r.result ? String(r.result) : null;
}

async function routeStatus(req, res) {
  const email = leesAppToken(String(req.query?.t || ''));
  if (!email) return res.status(401).json({ ok: false });
  return res.status(200).json({ ok: true, lid: lidBeeld(await haalLid(email)) });
}

async function routeOpzeggen(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Log eerst opnieuw in.' });
  const lid = await haalLid(email);
  if (!lid || !lid.subscriptionId) return res.status(400).json({ ok: false, fout: 'Je hebt geen lopend lidmaatschap.' });
  const r = await mollie(`/customers/${lid.customerId}/subscriptions/${lid.subscriptionId}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404 && r.status !== 422) return res.status(502).json({ ok: false, fout: 'Opzeggen lukte nu even niet. Probeer het zo nog eens.' });
  lid.status = 'opgezegd'; lid.opgezegdOp = new Date().toISOString(); lid.subscriptionId = null;
  // Toegang loopt tot de betaalde datum, zonder de speling van een mislukte incasso.
  if (lid.tot) lid.tot = plusDagen(lid.tot, -SPELING_DAGEN).toISOString();
  await bewaarLid(email, lid);
  await zetLidmaatschap({ email, naam: lid.naam, tot: lid.tot });
  await mcTag(email, 'mkc-lid', false);
  return res.status(200).json({ ok: true, lid: lidBeeld(lid) });
}

export { lidBeeld, haalLid };
