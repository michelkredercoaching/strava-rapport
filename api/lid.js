// /api/lid.js
// ---------------------------------------------------------------------------
// Lidmaatschap van de MKC-app: €19 per maand of €149 per jaar, automatische
// incasso via Mollie (besluit Michel 07-10 en 08-10-2026). Geen garantie, wel
// opzegbaar: het abonnement stopt, de betaalde periode loopt gewoon door.
// Zie APP-STAPPENPLAN.md.
//
// Zonder SEPA-incasso (08-10-2026, besluit Michel): zolang Mollie de incasso
// niet heeft goedgekeurd, betaalt een lid gewoon eenmalig met iDEAL voor een
// maand of een jaar (sequenceType 'oneoff'). Geen abonnement; vlak voor de
// einddatum krijgt het lid een mail met een knop om te verlengen (actie=herinner,
// dagelijkse cron). Is de incasso klaar, dan gaat alles automatisch zoals hieronder.
//
// Zo werkt het bij Mollie (met incasso):
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
import { planNaam, laadPlan } from '../lib/schema-app.js';

const MOLLIE_KEY  = process.env.MOLLIE_API_KEY || '';
const SECRET      = process.env.PP_TOKEN_SECRET || '';
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const MC_KEY      = process.env.MAILCHIMP_API_KEY || '';
const MC_LIST     = process.env.MAILCHIMP_LIST_ID || '';
const APP_URL     = process.env.APP_URL || 'https://rapport.michelkredercoaching.nl/app';
const WEBHOOK_URL = 'https://rapport.michelkredercoaching.nl/api/lid?actie=webhook';
// Twee plannen. Het plan gaat mee in de metadata van de eerste betaling en
// wordt bewaard in lid.plan, zodat elke volgende incasso de juiste periode verlengt.
const PLANNEN = {
  maand: { bedrag: '19.00', interval: '1 month', maanden: 1, label: 'per maand' },
  jaar:  { bedrag: '149.00', interval: '12 months', maanden: 12, label: 'per jaar' }
};
const planVan = (x) => (x === 'jaar' ? 'jaar' : 'maand');
const BEDRAG      = PLANNEN.maand.bedrag;
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
function plusMaanden(van, n) { let d = new Date(van); for (let i = 0; i < n; i++) d = plusMaand(d); return d; }
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
  const plan = planVan(lid.plan);
  return { status: lid.status, tot: lid.tot ? dag(lid.tot) : null, open: !!open, sinds: lid.sinds ? dag(lid.sinds) : null, plan, bedrag: PLANNEN[plan].bedrag, handmatig: !!lid.handmatig && !lid.subscriptionId, bron: lid.bron === 'coaching' && !lid.subscriptionId ? 'coaching' : lid.bron === 'schema' && !lid.subscriptionId && !lid.handmatig ? (lid.cadeauMaand ? 'cadeau' : 'schema') : 'betaald', coaching: lid.coaching || null };
}

// Kan Mollie al maandelijks incasseren? Zolang SEPA-incasso niet is goedgekeurd
// staat directdebit niet in de recurring-methodes; dan houden we de lid-knop
// verborgen, zodat niemand betaalt zonder dat er een abonnement kan komen.
// Gaat vanzelf open zodra Mollie goedkeurt (10 min cache).
// Lancering op Instagram (besluit Michel 08-10-2026): vóór dit moment is lid
// worden voor niemand open, ook niet als Mollie al goedkeurde. De app, /core/,
// de bedankpagina, homepage en checkout schakelen hierdoor allemaal tegelijk om.
export const LANCERING = Date.parse('2026-10-16T12:00:00+02:00');
const voorLancering = () => Date.now() < LANCERING;
// Michel kan vóór de lancering wel zelf lid worden (live test met echte betaling).
const BEHEER_LID = ['michel.kredercoaching@gmail.com', 'michel.kreder@gmail.com', 'info@michelkredercoaching.nl'];
let incassoCache = { tot: 0, open: false };
async function incassoKlaar() {
  if (!MOLLIE_KEY) return false;
  if (Date.now() < incassoCache.tot) return incassoCache.open;
  const m = await mollie('/methods?sequenceType=recurring');
  const open = m.ok && ((m.j._embedded && m.j._embedded.methods) || []).some((x) => x.id === 'directdebit');
  incassoCache = { tot: Date.now() + (m.ok ? 10 : 1) * 60 * 1000, open };
  return open;
}
// Lid worden kan na de lancering, ook zonder incasso (dan met iDEAL per periode).
async function lidOpen() { return !voorLancering() && !!MOLLIE_KEY; }

// ---- Routes ----------------------------------------------------------------------
export default async function handler(req, res) {
  const actie = String(req.query?.actie || '');
  if (actie !== 'open') res.setHeader('Cache-Control', 'no-store');
  try {
    if (actie === 'webhook') return await routeWebhook(req, res);
    if (actie === 'start') return await routeStart(req, res);
    if (actie === 'status') return await routeStatus(req, res);
    if (actie === 'opzeggen') return await routeOpzeggen(req, res);
    if (actie === 'herinner') return await routeHerinner(req, res);
    if (actie === 'schema') return await routeSchema(req, res);
    if (actie === 'cadeaumail') return await routeCadeauMail(req, res);
    if (actie === 'open') {
      // Publiek: kunnen mensen al lid worden? De WordPress-pagina's (/core/,
      // bedankpagina, homepage, checkout) vragen dit, zodat het oude aanbod
      // van €49/€29 vanzelf verdwijnt zodra de incasso is goedgekeurd.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ ok: true, open: await lidOpen(), bedrag: BEDRAG, jaarBedrag: PLANNEN.jaar.bedrag });
    }
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
  if (!(BEHEER_LID.includes(email) ? !!MOLLIE_KEY : await lidOpen())) return res.status(503).json({ ok: false, fout: 'Lid worden kan binnenkort. Houd Instagram in de gaten.' });
  const automatisch = await incassoKlaar();

  // Eén Mollie-klant per mailadres, hergebruiken bij opnieuw lid worden.
  if (!lid.customerId) {
    const k = await mollie('/customers', { method: 'POST', body: JSON.stringify({ name: String(body.naam || '').slice(0, 80) || email, email, metadata: { bron: 'mkc-app' } }) });
    if (!k.ok) return res.status(502).json({ ok: false, fout: 'Betalen lukt nu even niet. Probeer het zo nog eens.' });
    lid.customerId = k.j.id;
    lid.naam = String(body.naam || '').slice(0, 80);
    lid.status = lid.status || 'nieuw';
    await bewaarLid(email, lid);
  }

  const plan = planVan(body.plan);
  const p = await mollie('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: { currency: 'EUR', value: PLANNEN[plan].bedrag },
      description: automatisch
        ? (plan === 'jaar' ? `${OMSCHRIJVING}, eerste jaar` : `${OMSCHRIJVING}, eerste maand`)
        : (plan === 'jaar' ? `${OMSCHRIJVING}, 1 jaar` : `${OMSCHRIJVING}, 1 maand`),
      customerId: lid.customerId,
      sequenceType: automatisch ? 'first' : 'oneoff',
      // Login mee terug: wie in de app op zijn beginscherm begon, komt na de bank
      // vaak in Safari uit, en die heeft eigen opslag (zie api/app.js).
      redirectUrl: `${APP_URL}?lid=terug&t=${encodeURIComponent(String(body.t))}`,
      webhookUrl: WEBHOOK_URL,
      metadata: { email, soort: automatisch ? 'lid-eerste' : 'lid-periode', plan }
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
      // Eerste periode binnen: abonnement aanmaken, eerste incasso na een maand of een jaar.
      const plan = planVan(p.metadata && p.metadata.plan);
      lid.plan = plan;
      // Nog app via een schema? Dan begint de betaalde periode pas daarna.
      const vanaf = lid.bron === 'schema' && lid.tot && Date.parse(lid.tot) > Date.now() ? new Date(lid.tot) : new Date(betaaldOp);
      lid.bron = 'betaald';
      const start = plusMaanden(vanaf, PLANNEN[plan].maanden);
      const s = await mollie(`/customers/${p.customerId}/subscriptions`, {
        method: 'POST',
        body: JSON.stringify({
          amount: { currency: 'EUR', value: PLANNEN[plan].bedrag }, interval: PLANNEN[plan].interval,
          startDate: dag(start), description: plan === 'jaar' ? `${OMSCHRIJVING} (jaar)` : OMSCHRIJVING, webhookUrl: WEBHOOK_URL,
          metadata: { email: lidEmail, plan }
        })
      });
      // Lukt het abonnement niet (bv. geen incasso-machtiging), dan heeft de
      // klant wel betaald: de eerste maand gaat gewoon open en Michel krijgt
      // een mail om het abonnement handmatig te regelen.
      if (!s.ok) await meldIntern(`ABONNEMENT MISLUKT - ${lidEmail}`, `${lidEmail} betaalde de eerste ${plan} (${id}), maar Mollie maakte geen abonnement aan: ${JSON.stringify(s.j).slice(0, 300)}. De eerste ${plan} staat open. Regel het abonnement in Mollie of neem contact op.`);
      lid.customerId = p.customerId; lid.subscriptionId = s.ok ? s.j.id : null; lid.status = 'actief';
      lid.sinds = lid.sinds || betaaldOp;
      lid.tot = plusDagen(start, SPELING_DAGEN).toISOString();
      await redis(['SET', `lid:klant:${p.customerId}`, lidEmail]);
    } else if (p.metadata && p.metadata.soort === 'lid-periode') {
      if (lid.bron === 'schema') lid.bron = 'betaald';
      // Eenmalige iDEAL-betaling (zonder incasso): een maand of jaar erbij,
      // vanaf de huidige einddatum als die nog loopt. Geen abonnement.
      const plan = planVan(p.metadata.plan);
      lid.plan = plan; lid.handmatig = true; lid.customerId = p.customerId || lid.customerId;
      const basis = lid.tot && Date.parse(lid.tot) > Date.now() ? new Date(lid.tot) : new Date(betaaldOp);
      lid.tot = plusMaanden(basis, PLANNEN[plan].maanden).toISOString();
      lid.status = 'actief'; lid.sinds = lid.sinds || betaaldOp; lid.herinnerd = null;
      await redis(['SADD', 'lid:handmatig', lidEmail]);
    } else {
      // Incasso binnen: een maand of een jaar verlengen vanaf de huidige einddatum.
      const basis = lid.tot && Date.parse(lid.tot) > Date.now() ? plusDagen(lid.tot, -SPELING_DAGEN) : new Date(betaaldOp);
      lid.tot = plusDagen(plusMaanden(basis, PLANNEN[planVan(lid.plan)].maanden), SPELING_DAGEN).toISOString();
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
        const periode = planVan(lid.plan) === 'jaar' ? `jaar vanaf ${new Date(betaaldOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}` : maand;
        const f = await maakMollieFactuur({ naam: lid.naam || lidEmail.split('@')[0], email: lidEmail, bedrag: (p.amount && p.amount.value) || PLANNEN[planVan(lid.plan)].bedrag, betaalId: id, omschrijving: `${OMSCHRIJVING}, ${periode}` });
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
  if (lid && (lid.handmatig || lid.bron === 'schema' || lid.bron === 'coaching') && !lid.subscriptionId) return res.status(400).json({ ok: false, fout: 'Je lidmaatschap verlengt niet automatisch; het stopt vanzelf op de einddatum.' });
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

// Leden zonder incasso: 5 dagen voor de einddatum een mail met een knop om te
// verlengen (de app opent dan het lidblok). Eén keer per periode.
async function routeHerinner(req, res) {
  const cron = process.env.CRON_SECRET || '';
  if (!cron || String(req.headers?.authorization || '') !== `Bearer ${cron}`) return res.status(401).json({ ok: false });
  const lijst = await redis(['SMEMBERS', 'lid:handmatig']);
  let gemaild = await schemaEindeMails();
  for (const email of (lijst.ok && lijst.result) || []) {
    const lid = await haalLid(email);
    if (!lid || !lid.handmatig || lid.subscriptionId || !lid.tot) { await redis(['SREM', 'lid:handmatig', email]); continue; }
    const dagenOver = (Date.parse(lid.tot) - Date.now()) / 86400000;
    if (dagenOver > 5 || dagenOver < -14 || lid.herinnerd === lid.tot) continue;
    const plan = planVan(lid.plan), voornaam = String(lid.naam || '').split(' ')[0];
    const datum = new Date(lid.tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px">
      <p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
      <p>${dagenOver > 0 ? `Je lidmaatschap van de MKC-app loopt op <b>${datum}</b> af.` : 'Je lidmaatschap van de MKC-app is afgelopen.'} Wil je doorgaan met je Core-app, je coach en het kledingadvies? Verlengen doe je met een paar tikken.</p>
      <p style="margin:22px 0 26px"><a href="${APP_URL}#lid" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">Verleng mijn lidmaatschap</a></p>
      <p style="color:#555;font-size:14px">${plan === 'jaar' ? 'Een jaar kost €149.' : 'Een maand kost €19, een jaar €149 (35% voordeliger).'} Alles wat je deed blijft staan.</p>
      <p>Sportieve groet,<br>Michel</p></div>`;
    const key = process.env.RESEND_API_KEY;
    if (!key) continue;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Michel Kreder <michel@michelkredercoaching.nl>', to: email, subject: dagenOver > 0 ? `Je MKC-app loopt op ${datum} af` : 'Je MKC-app is afgelopen', html }),
        signal: AbortSignal.timeout(8000)
      });
      if (r.ok) { lid.herinnerd = lid.tot; await bewaarLid(email, lid); gemaild++; }
    } catch (e) { console.error('Herinnering mislukt:', email, e); }
  }
  return res.status(200).json({ ok: true, gemaild });
}

// ---- Schema gekocht: de app hoort erbij (09-10-2026) -----------------------
// Komt binnen vanuit WordPress (wordpress-snippets/schema-app-webhook.php) bij
// een betaalde bestelling met een schema of het winterprogramma, vanaf de
// lancering. De koper krijgt de MKC-app (Core, coach, slimme banden, kleding
// en het schema-kopje) voor de looptijd plus 14 dagen. Betalende leden houden
// hun eigen lidmaatschap; is dat korter, dan schuift de einddatum op.
const SCHEMA_EXTRA_DAGEN = 14;
async function haalSchema(email) {
  const r = await redis(['GET', `schema:${email}`]);
  if (!r.ok || !r.result) return null;
  try { return JSON.parse(r.result); } catch { return null; }
}
async function routeSchema(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://michelkredercoaching.nl');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  const geheim = process.env.WOO_WEBHOOK_SECRET || '';
  if (!geheim || body.secret !== geheim) return res.status(401).json({ ok: false });
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, fout: 'mailadres?' });
  // Coaching-klanten (besluit Michel 09-10-2026): de app hoort bij hun coaching.
  // Toegang voor een periode; een sync met de TrainingPeaks-groepen verlengt
  // hem zolang iemand in coaching zit. Geen schema-kopje (eigen plan in TP).
  if (body.coaching === 'flex' || body.coaching === 'premium') {
    const naamC = String(body.naam || '').slice(0, 80);
    const totC = new Date(Math.max(Date.now(), LANCERING) + (Number(body.dagen) || 90) * 86400000).toISOString();
    const lidC = (await haalLid(email)) || {};
    const loptAboC = lidC.subscriptionId && lidC.status === 'actief';
    lidC.coaching = body.coaching;
    if (!loptAboC) {
      if (!lidC.tot || Date.parse(lidC.tot) < Date.parse(totC)) lidC.tot = totC;
      lidC.status = 'actief'; lidC.bron = 'coaching'; lidC.sinds = lidC.sinds || new Date().toISOString();
      lidC.naam = lidC.naam || naamC; lidC.plan = lidC.plan || 'maand';
    }
    await bewaarLid(email, lidC);
    await zetLidmaatschap({ email, naam: naamC, tot: lidC.tot, stil: true });
    await mcTag(email, 'mkc-lid');
    await redis(['SADD', 'lid:coaching', email]);
    if (body.cadeau === true) await redis(['SADD', 'lid:cadeau', email]);
    return res.status(200).json({ ok: true, coaching: body.coaching, tot: lidC.tot });
  }
  const order = String(body.order || '').slice(0, 20);
  if (order) {
    const nieuw = await redis(['SET', `schema:order:${order}`, '1', 'NX', 'EX', 60 * 60 * 24 * 400]);
    if (nieuw.ok && nieuw.result === null) return res.status(200).json({ ok: true, al: true });
  }
  const soort = body.soort === 'winter' ? 'winter' : body.soort === 'vervolg' ? 'vervolg' : 'schema';
  const weken = Number(body.weken) || 12;
  const naam = String(body.naam || '').slice(0, 80);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(body.start || '')) ? body.start : new Date().toISOString().slice(0, 10);
  // Vervolgschema's hebben (nog) geen eigen plan in de app; dan alleen toegang.
  const plan = soort === 'vervolg' ? null : planNaam({ soort, niveau: body.niveau, weken, meet: body.meet });
  const niveauNaam = (String(body.niveau || '').match(/basis|opbouw|piek/i) || [''])[0].replace(/^./, (c) => c.toUpperCase());
  const titel = soort === 'winter' ? `Indoor Winterprogramma ${niveauNaam}` : `${niveauNaam || 'Trainingsschema'} ${weken} weken`;
  const huidig = { plan: plan && laadPlan(plan) ? plan : null, soort, weken, niveauNaam, titel, start, verschuif: 0, order, sinds: new Date().toISOString() };
  // Recente Strava-analyse (max. 8 weken voor de start)? Dan is de test in
  // week 1 vrijwillig (de app zegt het erbij) en krijgt Michel een mail om de
  // FTP of het omslagpunt in TrainingPeaks te zetten.
  const cadeau = body.cadeau === true;
  const maandGratis = cadeau && body.maand === true;
  if (cadeau) huidig.cadeau = true;
  if (maandGratis) { huidig.plan = null; huidig.maandGratis = true; }
  if (huidig.plan && !cadeau) {
    const an = await recenteAnalyse(email, start, /-hr$/.test(huidig.plan) ? 'hartslag' : 'vermogen');
    if (an) {
      huidig.testOverslaan = an;
      await meldIntern(`ANALYSE BEKEND - ${email}`, `${naam || email} kocht ${titel} (order ${order}, start ${start}) en deed op ${an.datum} een Strava-analyse: ${an.meet === 'hartslag' ? 'omslagpunt ' + an.waarde + ' bpm' : 'FTP ' + an.waarde + ' W'}.\n\nZet in TrainingPeaks ${an.meet === 'hartslag' ? 'het omslagpunt op ' + an.waarde + ' bpm' : 'de FTP op ' + an.waarde + ' W'}. De ${soort === 'winter' ? 'ramptest' : 'veldtest'} mag blijven staan: de app zegt erbij dat hij vrijwillig is (extra bevestiging, anders een rustig rondje en donderdag de eerste interval).`);
    }
  }
  const oud = await haalSchema(email);
  const dossier = { huidig, eerder: oud ? [oud.huidig, ...(oud.eerder || [])].filter(Boolean).slice(0, 10) : [] };
  await redis(['SET', `schema:${email}`, JSON.stringify(dossier)]);

  // Toegang tot de app: van de startdatum (of vandaag) tot na de looptijd.
  const basis = cadeau ? (Date.parse(start + 'T00:00:00Z') || Date.now()) : Math.max(Date.now(), Date.parse(start + 'T00:00:00Z') || 0);
  const tot = maandGratis
    ? new Date(Math.max(Date.now(), LANCERING) + 30 * 86400000).toISOString()
    : new Date(basis + (weken * 7 + SCHEMA_EXTRA_DAGEN) * 86400000).toISOString();
  const lid = (await haalLid(email)) || {};
  const loptAbo = lid.subscriptionId && lid.status === 'actief';
  if (!loptAbo && (!lid.tot || Date.parse(lid.tot) < Date.parse(tot))) {
    if (!lid.handmatig) lid.bron = 'schema';
    if (maandGratis) lid.cadeauMaand = true;
    lid.status = 'actief'; lid.tot = tot; lid.sinds = lid.sinds || new Date().toISOString();
    lid.naam = lid.naam || naam; lid.plan = lid.plan || 'maand';
    await bewaarLid(email, lid);
    await zetLidmaatschap({ email, naam, tot: lid.tot, stil: true });
    await mcTag(email, 'mkc-lid');
    if (lid.bron === 'schema') await redis(['SADD', 'lid:schema', email]);
  }
  if (cadeau) await redis(['SADD', 'lid:cadeau', email]);
  else await schemaWelkom(email, naam, huidig);
  return res.status(200).json({ ok: true, plan: huidig.plan, tot: lid.tot });
}
// Strava-analyse van deze koper, als die recent genoeg is (RAPDAT dd-mm-jjjj,
// max. 56 dagen voor de start) en de juiste waarde heeft voor de meetmethode.
async function recenteAnalyse(email, start, meet) {
  if (!MC_KEY || !MC_LIST) return null;
  try {
    const dc = MC_KEY.split('-')[1];
    const hash = crypto.createHash('md5').update(email).digest('hex');
    const r = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${MC_LIST}/members/${hash}?fields=merge_fields,tags`, {
      headers: { Authorization: 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64') }, signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    const m = await r.json();
    if (!(m.tags || []).some((t) => t.name === 'power-profile-koper')) return null;
    const mf = m.merge_fields || {};
    const d = String(mf.RAPDAT || '').match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (!d) return null;
    const datum = `${d[3]}-${d[2]}-${d[1]}`;
    const oud = (Date.parse(start + 'T12:00:00Z') - Date.parse(datum + 'T12:00:00Z')) / 86400000;
    if (!(oud >= -1 && oud <= 56)) return null;
    const waarde = meet === 'hartslag' ? String(mf.KOOPOMS || mf.OMSLAG || '').replace(/[^0-9]/g, '') : String(mf.KOOPFTP || mf.FTP || '').replace(/[^0-9]/g, '');
    if (!waarde || Number(waarde) < 60) return null;
    return { datum, meet, waarde: Number(waarde) };
  } catch (e) { console.error('Analyse opzoeken mislukt (genegeerd):', e); return null; }
}

async function schemaWelkom(email, naam, s) {
  const key = process.env.RESEND_API_KEY; if (!key) return;
  const voornaam = String(naam || '').split(' ')[0];
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px">
    <p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
    <p>Bij je ${s.soort === 'winter' ? 'winterprogramma' : 'schema'} hoort de MKC-app, voor de hele looptijd. Je traint gewoon in TrainingPeaks; in de app zie je elke dag wat er op je schema staat, met mijn uitleg erbij.</p>
    <p>Daarnaast heb je je eigen coach voor al je vragen, de Core-app, je bandenspanning en kledingadvies voor elke rit.</p>
    <p style="margin:22px 0 26px"><a href="${APP_URL}" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">Open de MKC-app</a></p>
    <p style="color:#555;font-size:14px">Log in met dit mailadres, je krijgt dan een code. Tip: zet de app op je beginscherm, dan heb je hem altijd bij de hand.</p>
    <p>Sportieve groet,<br>Michel</p></div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Michel Kreder <michel@michelkredercoaching.nl>', to: email, subject: 'Je schema staat ook in de MKC-app', html }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) { console.error('Schema-welkom mislukt:', email, e); }
}

// Einde van een schema: 7 dagen voor de app-einddatum één mail met twee
// keuzes, verder met een vervolgschema of lid blijven. Wie intussen betaald
// lid werd (abonnement of iDEAL) valt eruit.
async function schemaEindeMails() {
  const key = process.env.RESEND_API_KEY;
  const lijst = await redis(['SMEMBERS', 'lid:schema']);
  let n = 0;
  for (const email of (lijst.ok && lijst.result) || []) {
    const lid = await haalLid(email);
    if (!lid || lid.bron !== 'schema' || lid.subscriptionId || lid.handmatig || !lid.tot) { await redis(['SREM', 'lid:schema', email]); continue; }
    const dagenOver = (Date.parse(lid.tot) - Date.now()) / 86400000;
    if (dagenOver > 7 || dagenOver < -3 || lid.schemaEindeGemaild === lid.tot || !key) continue;
    const voornaam = String(lid.naam || '').split(' ')[0];
    const datum = new Date(lid.tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px">
      <p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
      <p>${lid.cadeauMaand ? `Je gratis maand in de MKC-app loopt op <b>${datum}</b> af. Ik hoop dat je er veel aan had.` : `Je schema zit erop, knap gedaan. De MKC-app die erbij hoorde loopt op <b>${datum}</b> af.`}</p>
      <p>Je kunt op twee manieren verder:</p>
      <p><b>Een vervolgschema.</b> Een nieuw blok dat aansluit op waar je nu staat. De app hoort er weer bij, voor de hele looptijd.</p>
      <p style="margin:14px 0 22px"><a href="https://michelkredercoaching.nl/trainingsschema-vervolg/" style="background:#ff6b1a;color:#0a0a0a;padding:13px 24px;border-radius:4px;text-decoration:none;font-weight:700">Kies je vervolgschema</a></p>
      <p><b>Lid blijven.</b> Je coach voor al je vragen, de Core-app, je bandenspanning en kledingadvies voor elke rit. €19 per maand of €149 per jaar.</p>
      <p style="margin:14px 0 22px"><a href="${APP_URL}#lid" style="color:#ff6b1a;font-weight:700">Blijf lid van de MKC-app</a></p>
      <p>Sportieve groet,<br>Michel</p></div>`;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Michel Kreder <michel@michelkredercoaching.nl>', to: email, subject: lid.cadeauMaand ? 'Je gratis maand loopt af. Hoe ga je verder?' : 'Je schema zit erop. Hoe ga je verder?', html }),
        signal: AbortSignal.timeout(8000)
      });
      if (r.ok) { lid.schemaEindeGemaild = lid.tot; await bewaarLid(email, lid); n++; }
    } catch (e) { console.error('Schema-einde mislukt:', email, e); }
  }
  return n;
}

// Cadeaumail aan bestaande schema-klanten, op het lanceermoment (cron
// vr 16-10 12:05 Amsterdam). Eén keer per klant; vóór de lancering doet hij niets.
async function routeCadeauMail(req, res) {
  const cron = process.env.CRON_SECRET || '';
  if (!cron || String(req.headers?.authorization || '') !== `Bearer ${cron}`) return res.status(401).json({ ok: false });
  if (voorLancering()) return res.status(200).json({ ok: true, nogNiet: true });
  const key = process.env.RESEND_API_KEY;
  const lijst = await redis(['SMEMBERS', 'lid:cadeau']);
  // Resend gratis = 100 per dag: standaard 35 per run, zodat inlogcodes altijd
  // doorgaan. Vrijdag 12:05 en daarna elke ochtend tot alles weg is (vercel.json).
  const max = Math.max(1, Number(process.env.CADEAU_MAX) || 35);
  const wacht = [];
  // Volgorde: coaching eerst, dan een lopend schema, als laatste de gratis maand.
  const kandidaten = [];
  for (const email of (lijst.ok && lijst.result) || []) { const l = await haalLid(email); if (l) kandidaten.push({ email, prio: l.bron === 'coaching' ? 0 : l.cadeauMaand ? 2 : 1 }); }
  kandidaten.sort((x, y) => x.prio - y.prio);
  for (const { email } of kandidaten) {
    if (wacht.length >= max) break;
    const lid = await haalLid(email);
    const sch = await haalSchema(email);
    if (!lid || lid.cadeauGemaild || !key) continue;
    if (!lid.tot || Date.parse(lid.tot) < Date.now()) { await redis(['SREM', 'lid:cadeau', email]); continue; }
    const voornaam = String(lid.naam || '').split(' ')[0];
    const datum = new Date(lid.tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
    const metPlan = sch && sch.huidig && sch.huidig.plan;
    const maand = !!lid.cadeauMaand;
    const coaching = lid.bron === 'coaching';
    const winter = sch && sch.huidig && sch.huidig.soort === 'winter';
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px">
      <p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
      <p>Vandaag lanceer ik iets waar ik lang aan gewerkt heb: de MKC-app. ${coaching ? 'En omdat jij bij mij in coaching zit, krijg je hem er gewoon bij, zolang je coaching loopt. Je plan blijft van mij, persoonlijk in TrainingPeaks; de app is alles eromheen.' : maand ? `Jij trainde met een schema van mij, en daarom krijg je hem een maand gratis, tot ${datum}.` : `En omdat jij nu met ${winter ? 'mijn winterprogramma' : 'een schema van mij'} traint, krijg je hem er gratis bij. Tot ${datum}, twee weken na je laatste week.`}</p>
      <p>Wat je erin vindt:</p>
      <p>${metPlan ? '&#10003; Elke dag je training met mijn uitleg erbij, en wat je eet en drinkt.<br>' : ''}${coaching ? '&#10003; Een coach in je broekzak voor de snelle vragen tussendoor, over voeding, herstel en materiaal. Vragen over je plan blijven gewoon bij mij.<br>' : '&#10003; Je eigen coach: stel al je vragen over je training, en je krijgt antwoord met mijn kennis uit negen jaar prof en coaching.<br>'}&#10003; De Core-app: korte sessies thuis tegen rugpijn en inzakken in het laatste uur.<br>&#10003; Bandenspanning en kledingadvies voor elke rit, afgestemd op het weer.</p>
      <p style="margin:22px 0 26px"><a href="${APP_URL}" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">Open de MKC-app</a></p>
      <p style="color:#555;font-size:14px">Log in met dit mailadres, je krijgt dan een code. Tip: zet de app op je beginscherm, dan heb je hem altijd bij de hand. Je traint gewoon verder in TrainingPeaks, daar verandert niets.</p>
      <p>Veel plezier ermee, en laat me gerust weten wat je ervan vindt.${coaching ? ' Juist jouw mening hoor ik graag.' : ''}</p>
      <p>Sportieve groet,<br>Michel</p></div>`;
    wacht.push({ email, lid, mail: { from: 'Michel Kreder <michel@michelkredercoaching.nl>', to: email, subject: coaching ? 'Een cadeautje bij je coaching: de MKC-app' : maand ? 'Een maand gratis: de MKC-app' : 'Een cadeautje bij je schema: de MKC-app', html } });
  }
  let gemaild = 0, fouten = 0;
  for (let i = 0; i < wacht.length; i += 100) {
    const pak = wacht.slice(i, i + 100);
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pak.map((x) => x.mail)), signal: AbortSignal.timeout(20000)
      });
      if (!r.ok) { fouten += pak.length; console.error('Cadeau-batch mislukt:', r.status, (await r.text()).slice(0, 300)); continue; }
      for (const x of pak) { x.lid.cadeauGemaild = new Date().toISOString(); await bewaarLid(x.email, x.lid); gemaild++; }
    } catch (e) { fouten += pak.length; console.error('Cadeau-batch mislukt:', e); }
    if (i + 100 < wacht.length) await new Promise((k) => setTimeout(k, 1100));
  }
  if (fouten) await meldIntern('CADEAUMAIL - niet alles verstuurd', `${gemaild} cadeaumails verstuurd, ${fouten} mislukt (Resend-limiet?). De rest gaat automatisch mee bij de volgende run.`);
  return res.status(200).json({ ok: true, gemaild, fouten });
}

export { lidOpen, lidBeeld, haalLid, incassoKlaar, haalSchema };
