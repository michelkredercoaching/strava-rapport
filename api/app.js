// /api/app.js
// ---------------------------------------------------------------------------
// De all-in-1 app (startpagina app.html op /app), 06-10-2026. Zie
// APP-STAPPENPLAN.md stap 2.
//
// Inloggen zonder wachtwoord: je vult je mailadres in en krijgt een inloglink.
// Die link bevat een ondertekend token "app|<email>|<vervalt>|<handtekening>"
// (base64url), 180 dagen geldig. De app bewaart hem op het toestel.
//
// Routes (?actie=):
//   POST login    { email }  -> stuurt een inloglink als het adres bekend is.
//                               Antwoordt altijd hetzelfde, zodat niemand kan
//                               uitproberen welke adressen klant zijn.
//   GET  overzicht ?t=       -> wat deze persoon heeft: Core, analyse, enz.
//   POST vancore  { ct }     -> ruilt een Core-link in voor een app-token,
//                               zodat je vanuit de Core-app direct binnen bent.
//   POST verifieer { email, code } -> inloggen met de 6 cijfers uit de mail.
//                               Nodig op de iPhone: een app op het beginscherm
//                               heeft eigen opslag en een link opent altijd in
//                               Safari, dus daar kom je alleen met de code in.
//   GET  manifest  ?t=       -> persoonlijk manifest met de login in start_url,
//                               zodat de app op je beginscherm ingelogd blijft.
//   bandenprofiel / weer / plaats / bandvraag -> slimme bandenspanning voor
//                               leden, zie onderaan dit bestand.
//
// Bronnen per onderdeel:
//   Core-app        Redis via api/core.js (coreVoorEmail)
//   Strava-analyse  Mailchimp Keuzehulp-lijst: tag power-profile-koper plus de
//                   merge-velden die lib/lever-rapport.js daar zet (FTP, RAPDAT,
//                   RENTYPE, MEETMETH, OMSLAG, ADVSCHEMA). Het rapport zelf is een
//                   pdf in de mail en wordt nergens bewaard.
//   Bandenspanning  tag bandenspanning-pdf (de tool is voor iedereen open)
//   Afvalprogramma  nog niet live: altijd "binnenkort"
//   Pacingplan      nog niet gebouwd: altijd "binnenkort"
//
// Env: PP_TOKEN_SECRET, UPSTASH_REDIS_REST_URL/TOKEN, RESEND_API_KEY,
//      MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID (= de Keuzehulp-lijst), APP_URL (optioneel)
import crypto from 'crypto';
import { coreVoorEmail, emailVoorCoreToken } from './core.js';
import { lidBeeld, haalLid, lidOpen, LANCERING, incassoKlaar, haalSchema, ledenOverzicht, lidZoek, geefToegang } from './lid.js';
import { schemaBeeld, schemaContext, PLANNEN as SCHEMA_PLANNEN } from '../lib/schema-app.js';
import { haalMeldingen, leesMelding } from '../lib/app-melding.js';
import { tel, overzicht as gebruikOverzicht, CLIENT_GEBEURTENISSEN, GAST_GEBEURTENISSEN } from '../lib/stat.js';
import { COACH_KENNIS, COACH_REGELS, COACH_TOON } from '../lib/coach-kennis.js';
import { meldMedisch } from '../lib/meld-medisch.js';
import { meld as meldActief, opruimen, wisPersoon } from '../lib/app-opruimen.js';
import { reviewMoment, reviewOpen, reviewKeuze, REVIEW_LINK } from '../lib/review.js';
import { kledingAdvies, kledingBijstel, kledingKort } from '../lib/kleding.js';
import { bandenAdvies, leesInvoer, nl, HOOKLESS_MAX } from '../lib/bandendruk.js';
import { stuurPush } from '../lib/webpush.js';
import { schemaPrijs, naLancering } from '../lib/schema-prijzen.js';

const SECRET      = process.env.PP_TOKEN_SECRET || '';
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const MC_KEY      = process.env.MAILCHIMP_API_KEY || '';
const MC_LIST     = process.env.MAILCHIMP_LIST_ID || '';
const APP_URL     = process.env.APP_URL || 'https://rapport.michelkredercoaching.nl/app';
const AFZENDER    = 'Michel Kreder <michel@michelkredercoaching.nl>';
const GELDIG_DAGEN = 180;
// Michels eigen adressen: die zien in de app een schakelaar "Alles open".
const BEHEER = ['michel.kredercoaching@gmail.com', 'michel.kreder@gmail.com', 'info@michelkredercoaching.nl'];

// ---- Token -----------------------------------------------------------------
function handtekening(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 20);
}
function maakAppToken(email) {
  if (!SECRET) return null;
  const exp = Date.now() + GELDIG_DAGEN * 24 * 3600 * 1000;
  const payload = `app|${email}|${exp}`;
  return Buffer.from(`${payload}|${handtekening(payload)}`).toString('base64url');
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

// ---- Redis (alleen voor de rem op inlogmails) ---------------------------------
async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });
    if (!r.ok) return { ok: false };
    const j = await r.json();
    return { ok: true, result: j.result };
  } catch { return { ok: false }; }
}

// ---- Mailchimp ----------------------------------------------------------------
async function mcLid(email) {
  if (!MC_KEY || !MC_LIST) return null;
  try {
    const dc = MC_KEY.split('-')[1];
    const hash = crypto.createHash('md5').update(email).digest('hex');
    const r = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${MC_LIST}/members/${hash}?fields=status,merge_fields,tags`, {
      headers: { Authorization: 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64') },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
const heeftTag = (lid, naam) => !!(lid && (lid.tags || []).some((t) => t.name === naam));

// ---- Mail ----------------------------------------------------------------------
async function stuurInlogmail(email, naam, link, code) {
  if (!RESEND_KEY) { console.error('Geen RESEND_API_KEY'); return false; }
  const voornaam = String(naam || '').trim().split(' ')[0];
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px">
    <p>${voornaam ? 'Hoi ' + esc(voornaam) : 'Hoi'},</p>
    <p>Je inlogcode voor de MKC-app:</p>
    <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:6px 0 18px;color:#0a0a0a">${esc(code)}</p>
    <p>Vul deze code in de app in. Hij werkt een kwartier.</p>
    <p>Of open de app direct met deze knop:</p>
    <p style="margin:20px 0 26px"><a href="${esc(link)}" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">Open mijn app</a></p>
    <p style="color:#555;font-size:14px">Staat de app al op je beginscherm? Gebruik dan de code, want de knop opent in je browser.</p>
    <p style="color:#777;font-size:13px">Heb je dit niet aangevraagd? Dan kun je deze mail negeren, er gebeurt verder niets.</p>
    <p>Sportieve groet,<br>Michel</p></div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AFZENDER, to: email, subject: `Je inlogcode voor de MKC-app: ${code}`, html }),
      signal: AbortSignal.timeout(10000)
    });
    return r.ok;
  } catch { return false; }
}

// ---- Helpers ---------------------------------------------------------------------
async function leesBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
const geldigMail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 160;

// ---- Routes -------------------------------------------------------------------
// Het schema-advies uit de analyse (ADVOUD/ADVNIEUW) is uitgerekend met de
// prijzen van dat moment. Na de lancering geldt de nieuwe prijs per lengte;
// het tegoed (oud min nieuw) blijft gelijk.
function adviesBedragen(mf) {
  const oud = Number(mf.ADVOUD) || 0, nieuw = Number(mf.ADVNIEUW) || 0;
  const weken = Number((String(mf.ADVSCHEMA || '').match(/(8|12|16)/) || [])[1]) || 0;
  const niveau = (String(mf.ADVSCHEMA || '').match(/Basis|Opbouw|Piek/i) || [''])[0];
  const nu = schemaPrijs(weken, niveau);
  if (!naLancering() || !nu || !oud) return { adviesPrijs: mf.ADVNIEUW || '', adviesOud: mf.ADVOUD || '' };
  const tegoed = Math.max(0, oud - nieuw);
  return { adviesPrijs: String(Math.max(0, nu - tegoed)), adviesOud: String(nu) };
}

// ---- Schema in de app -------------------------------------------------------
//   POST schema { t, verschuif: -1|1 } -> de klant loopt een dag achter/voor
//   GET  schema?t=..&plan=..&dag=..    -> voorbeeld voor beheer (Zelf kiezen)
async function routeSchema(req, res) {
  if (req.method === 'GET') {
    const email = leesAppToken(String(req.query?.t || ''));
    if (!email || !BEHEER.includes(email)) return res.status(403).json({ ok: false });
    const plan = SCHEMA_PLANNEN.includes(String(req.query.plan)) ? String(req.query.plan) : 'opbouw-12-w';
    const dag = Math.max(-6, Math.min(130, Number(req.query.dag) || 1));
    const start = new Date(Date.now() - (dag - 1) * 86400000).toISOString().slice(0, 10);
    const niveauNaam = plan.split('-')[0].replace(/^./, (c) => c.toUpperCase());
    return res.status(200).json({ ok: true, schema: schemaBeeld({ plan, start, verschuif: 0, niveauNaam, titel: /^winter/.test(plan) ? 'Indoor Winterprogramma ' + plan.split('-')[1].replace(/^./, (c) => c.toUpperCase()) : niveauNaam + ' ' + plan.split('-')[1] + ' weken' }) });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Log opnieuw in.' });
  const d = await haalSchema(email);
  if (!d || !d.huidig) return res.status(404).json({ ok: false, fout: 'Geen schema gevonden.' });
  const stap = Number(body.verschuif) > 0 ? 1 : -1;
  d.huidig.verschuif = Math.max(-14, Math.min(28, (Number(d.huidig.verschuif) || 0) + stap));
  await redis(['SET', `schema:${email}`, JSON.stringify(d)]);
  return res.status(200).json({ ok: true, schema: schemaBeeld(d.huidig) });
}

// ---- Meldingen in de app (09-10-2026) -----------------------------------------
//   POST melding { t, id }  -> weggetikt (id 'alle' = alles)
async function routeMelding(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Log opnieuw in.' });
  await leesMelding(email, String(body.id || ''));
  return res.status(200).json({ ok: true, meldingen: await haalMeldingen(email) });
}

// ---- Beheer: leden (09-10-2026) ----------------------------------------------
//   GET  leden?t=..            -> tellers + recente leden
//   GET  leden?t=..&zoek=mail  -> één lid
//   POST leden { t, email, soort, tot, plan, start, naam } -> toegang geven/intrekken
async function routeLeden(req, res) {
  const t = req.method === 'POST' ? (await leesBody(req)) : null;
  const email = leesAppToken(String(req.method === 'POST' ? t.t : req.query?.t) || '');
  if (!email || !BEHEER.includes(email)) return res.status(403).json({ ok: false });
  if (req.method === 'POST') {
    const r = await geefToegang({ email: t.email, naam: t.naam, soort: t.soort, tot: t.tot, plan: t.plan, start: t.start });
    return res.status(r.ok ? 200 : 400).json(r);
  }
  if (req.query?.zoek) return res.status(200).json({ ok: true, lid: await lidZoek(req.query.zoek) });
  const [overzicht, fb] = await Promise.all([ledenOverzicht(), redis(['LRANGE', 'app:feedback', 0, 19])]);
  const feedback = ((fb.ok && fb.result) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  return res.status(200).json({ ok: true, ...overzicht, feedback });
}

// ---- Feedback uit de app (09-10-2026) ----------------------------------------
// "Mis je iets of werkt iets niet?" -> lijstje in Michels beheer + een mail.
// Max 3 per persoon per dag.
async function routeFeedback(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Log opnieuw in.' });
  const tekst = String(body.tekst || '').trim().slice(0, 1500);
  if (tekst.length < 3) return res.status(400).json({ ok: false, fout: 'Typ even wat je mist of wat er niet werkt.' });
  const teller = await redis(['INCR', `app:feedback:teller:${email}:${new Date().toISOString().slice(0, 10)}`]);
  if (teller.ok && teller.result === 1) await redis(['EXPIRE', `app:feedback:teller:${email}:${new Date().toISOString().slice(0, 10)}`, 90000]);
  if (teller.ok && teller.result > 3) return res.status(429).json({ ok: false, fout: 'Dank je, ik heb je berichten binnen. Morgen kun je weer iets sturen.' });
  const item = { email, tekst, waar: String(body.waar || '').slice(0, 60), op: new Date().toISOString() };
  await redis(['LPUSH', 'app:feedback', JSON.stringify(item)]);
  await tel(email, 'feedback');
  await redis(['LTRIM', 'app:feedback', 0, 199]);
  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'MKC-app <michel@michelkredercoaching.nl>', to: 'michel.kredercoaching@gmail.com', reply_to: email, subject: `Feedback uit de app (${email})`, text: `${tekst}\n\nVan: ${email}${item.waar ? '\nWaar: ' + item.waar : ''}\n\nBeantwoorden kan gewoon met Antwoorden.` }),
        signal: AbortSignal.timeout(8000)
      });
    } catch (e) { console.error('Feedbackmail mislukt:', e); }
  }
  return res.status(200).json({ ok: true });
}

// ---- Gebruik per dag (09-10-2026) -----------------------------------------------
//   POST stat { t, e }   -> gebeurtenis uit de app zelf (banden, kleding, schema, analyse)
//   GET  gebruik?t=..    -> overzicht voor Michel (laatste 14 dagen)
async function routeStat(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  // Zonder account (gastmodus): alleen de bandentool, met een anoniem id.
  if (!email) {
    if (GAST_GEBEURTENISSEN.includes(body.e) && /^[a-z0-9]{8,24}$/.test(String(body.anon || ''))) await tel('anon:' + body.anon, body.e);
    return res.status(200).json({ ok: true });
  }
  if (CLIENT_GEBEURTENISSEN.includes(body.e) || GAST_GEBEURTENISSEN.includes(body.e)) await tel(email, body.e);
  return res.status(200).json({ ok: true });
}
async function routeGebruik(req, res) {
  const email = leesAppToken(String(req.query?.t || ''));
  if (!email || !BEHEER.includes(email)) return res.status(403).json({ ok: false });
  return res.status(200).json({ ok: true, ...(await gebruikOverzicht(Math.min(30, Number(req.query?.dagen) || 14))) });
}

// ---- Gratis windadvies (09-10-2026) -------------------------------------------
// Zonder account: het weer per uur voor een plek, alleen wind en temperatuur.
// Max 30 aanvragen per IP per uur.
async function vrijGrens(req) {
  const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'onbekend';
  const k = `app:vrij:${ip}:${new Date().toISOString().slice(0, 13)}`;
  const r = await redis(['INCR', k]);
  if (r.ok && r.result === 1) await redis(['EXPIRE', k, 3700]);
  return !(r.ok && r.result > 30);
}
async function routeWind(req, res) {
  if (!(await vrijGrens(req))) return res.status(429).json({ ok: false, fout: 'Even rustig aan, probeer het zo nog eens.' });
  try {
    const weer = await haalWeer(req.query?.lat, req.query?.lon);
    if (!weer) return res.status(400).json({ ok: false, fout: 'Geen geldige plek.' });
    return res.status(200).json({ ok: true, uren: weer.uren.map(({ uur, temp, wind, richting, regen }) => ({ uur, temp, wind, richting, regen })) });
  } catch (e) { return res.status(502).json({ ok: false, fout: 'Het weer laden lukte niet.' }); }
}
async function routePlaatsVrij(req, res) {
  if (!(await vrijGrens(req))) return res.status(429).json({ ok: false, fout: 'Even rustig aan, probeer het zo nog eens.' });
  const q = String(req.query?.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.status(400).json({ ok: false, fout: 'Typ een plaatsnaam.' });
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=nl&format=json`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const l = (j.results || []).map((x) => ({ naam: x.name, regio: x.admin1 || '', land: x.country_code || '', lat: x.latitude, lon: x.longitude }))
      .sort((a, b) => (['NL', 'BE'].includes(b.land) ? 1 : 0) - (['NL', 'BE'].includes(a.land) ? 1 : 0));
    return res.status(200).json({ ok: true, plaatsen: l.slice(0, 5) });
  } catch (e) { return res.status(502).json({ ok: false, fout: 'Zoeken lukte niet.' }); }
}

// ---- Review-moment (09-10-2026), zie lib/review.js ----
async function routeReview(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false });
  await reviewKeuze(email, body.keuze);
  if (body.keuze === 'geklikt') await tel(email, 'review');
  return res.status(200).json({ ok: true });
}

// ---- Appgegevens opruimen (09-10-2026), zie lib/app-opruimen.js ----------------
// Cron (wekelijks): wist wie een jaar niets deed. Beheer: GET ?proef=1 telt alleen,
// POST { email } wist iemand op verzoek (lidmaatschap en facturen blijven).
async function routeOpruimen(req, res) {
  const cron = process.env.CRON_SECRET || '';
  if (cron && String(req.headers?.authorization || '') === `Bearer ${cron}`) return res.status(200).json(await opruimen());
  const body = req.method === 'POST' ? await leesBody(req) : null;
  const ik = leesAppToken(String(body ? body.t : req.query?.t) || '');
  if (!ik || !BEHEER.includes(ik)) return res.status(403).json({ ok: false });
  if (body) return res.status(200).json(await wisPersoon(body.email));
  return res.status(200).json(await opruimen({ proef: true }));
}

// ---- Groepsrit-link (09-10-2026) ------------------------------------------------
// Iemand met een account plant een rit (dag, tijd, duur, startplaats) en deelt de
// link. Iedereen die hem opent ziet het weer en windadvies tijdens die rit, en
// rekent zijn eigen bandenspanning uit. Leden zien ook kleding en voeding.
// Geen deelnemerslijst of namen: alleen een teller hoeveel renners meekeken.
const GR_ID = /^[A-Za-z0-9]{8}$/;
const grCache = new Map();
function grAmsterdamNaarMs(datum, tijd) {
  // Lokale tijd in Amsterdam naar epoch (zomer/wintertijd via Intl).
  const guess = Date.parse(`${datum}T${tijd}:00Z`);
  const deel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const v = Object.fromEntries(deel.map((x) => [x.type, x.value]));
  const alsLokaal = Date.parse(`${v.year}-${v.month}-${v.day}T${v.hour === '24' ? '00' : v.hour}:${v.minute}:00Z`);
  return guess - (alsLokaal - guess);
}
async function grWeer(rit) {
  const c = grCache.get(rit.id);
  if (c && Date.now() - c.op < 30 * 60 * 1000) return c.uren;
  const start = new Date(rit.start), dagen = (rit.start - Date.now()) / 864e5;
  if (dagen > 15) return null;
  const uurStr = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).format(new Date(ms)).replace(' ', 'T') + ':00';
  const eind = rit.start + Math.ceil(rit.duur) * 3600 * 1000;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${rit.plaats.lat}&longitude=${rit.plaats.lon}&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m&timezone=Europe%2FAmsterdam&start_hour=${uurStr(start.getTime())}&end_hour=${uurStr(eind)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const j = await r.json(); const h = j.hourly || {};
  const uren = (h.time || []).map((t, i) => ({ uur: Number(t.slice(11, 13)), temp: Math.round(h.temperature_2m[i]), regen: Math.round((h.precipitation[i] || 0) * 10) / 10, wind: Math.round(h.wind_speed_10m[i] || 0), richting: Math.round(h.wind_direction_10m[i] ?? 0) }));
  grCache.set(rit.id, { op: Date.now(), uren });
  return uren;
}
async function routeGroepsrit(req, res) {
  if (req.method === 'POST') {
    const body = await leesBody(req);
    const email = pushEmail(res, body.t); if (!email) return;
    const datum = String(body.datum || ''), tijd = String(body.tijd || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !/^\d{2}:\d{2}$/.test(tijd)) return res.status(400).json({ ok: false, fout: 'Kies een dag en tijd.' });
    const start = grAmsterdamNaarMs(datum, tijd);
    if (!(start > Date.now() - 3600 * 1000 && start < Date.now() + 15 * 864e5)) return res.status(400).json({ ok: false, fout: 'Kies een moment in de komende twee weken.' });
    const pl = body.plaats || {};
    const lat = Number(pl.lat), lon = Number(pl.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ ok: false, fout: 'Kies een startplaats.' });
    const duur = Math.min(8, Math.max(1, Number(body.duur) || 2));
    const schoon = (x, n) => String(x || '').replace(/[<>]/g, '').trim().slice(0, n);
    const lim = await redis(['INCR', `groepsrit:maak:${email}:${new Date().toISOString().slice(0, 10)}`]);
    if (lim.ok && lim.result === 1) await redis(['EXPIRE', `groepsrit:maak:${email}:${new Date().toISOString().slice(0, 10)}`, 90000]);
    if (lim.ok && lim.result > 10) return res.status(429).json({ ok: false, fout: 'Je hebt vandaag al genoeg ritten gepland.' });
    const id = Array.from(crypto.randomBytes(8)).map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[b % 56]).join('');
    const rit = { id, naam: schoon(body.naam, 40) || 'Groepsrit', door: schoon(body.door, 30), start, duur, tempo: body.tempo === 'hard' ? 'hard' : 'rustig',
      plaats: { naam: schoon(pl.naam, 50), lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 }, maker: email, op: Date.now() };
    const ttl = Math.ceil((start - Date.now()) / 1000) + 3 * 86400;
    await redis(['SET', `groepsrit:${id}`, JSON.stringify(rit), 'EX', ttl]);
    await tel(email, 'groepsrit-maak');
    return res.status(200).json({ ok: true, id, url: `https://rapport.michelkredercoaching.nl/rit/${id}` });
  }
  const id = String(req.query?.id || '');
  if (!GR_ID.test(id)) return res.status(400).json({ ok: false, fout: 'Onbekende rit.' });
  if (!(await vrijGrens(req))) return res.status(429).json({ ok: false, fout: 'Even rustig aan, probeer het zo nog eens.' });
  const r = await redis(['GET', `groepsrit:${id}`]);
  if (!r.ok || !r.result) return res.status(404).json({ ok: false, fout: 'Deze rit bestaat niet meer.' });
  const rit = JSON.parse(r.result);
  const kijker = String(req.query?.k || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
  if (kijker) { await redis(['SADD', `groepsrit:${id}:kijk`, kijker]); await redis(['EXPIRE', `groepsrit:${id}:kijk`, Math.max(3600, Math.ceil((rit.start - Date.now()) / 1000) + 3 * 86400)]); }
  const n = await redis(['SCARD', `groepsrit:${id}:kijk`]);
  let uren = null;
  try { uren = await grWeer(rit); } catch (e) {}
  const ik = leesAppToken(String(req.query?.t || ''));
  return res.status(200).json({ ok: true, rit: { id: rit.id, naam: rit.naam, door: rit.door, start: rit.start, duur: rit.duur, tempo: rit.tempo, plaats: rit.plaats, eigen: !!ik && ik === rit.maker },
    uren, kijkers: n.ok ? Number(n.result) || 0 : 0 });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const actie = String(req.query?.actie || '');
  try {
    if (actie === 'login') return await routeLogin(req, res);
    if (actie === 'overzicht') return await routeOverzicht(req, res);
    if (actie === 'vancore') return await routeVanCore(req, res);
    if (actie === 'verifieer') return await routeVerifieer(req, res);
    if (actie === 'manifest') return routeManifest(req, res);
    if (actie === 'bandenprofiel') return await routeBandenProfiel(req, res);
    if (actie === 'weer') return await routeWeer(req, res);
    if (actie === 'plaats') return await routePlaats(req, res);
    if (actie === 'bandvraag') return await routeBandVraag(req, res);
    if (actie === 'coach') return await routeCoach(req, res);
    if (actie === 'opvolgen') return await routeOpvolgen(req, res);
    if (actie === 'bandenritten') return await routeBandenRitten(req, res);
    if (actie === 'antwoorden') return await routeAntwoorden(req, res);
    if (actie === 'push') return await routePush(req, res);
    if (actie === 'pushtest') return await routePushTest(req, res);
    if (actie === 'pushcron') return await routePushCron(req, res);
    if (actie === 'schema') return await routeSchema(req, res);
    if (actie === 'melding') return await routeMelding(req, res);
    if (actie === 'leden') return await routeLeden(req, res);
    if (actie === 'feedback') return await routeFeedback(req, res);
    if (actie === 'stat') return await routeStat(req, res);
    if (actie === 'gebruik') return await routeGebruik(req, res);
    if (actie === 'wind') return await routeWind(req, res);
    if (actie === 'plaatsvrij') return await routePlaatsVrij(req, res);
    if (actie === 'groepsrit') return await routeGroepsrit(req, res);
    if (actie === 'opruimen') return await routeOpruimen(req, res);
    if (actie === 'review') return await routeReview(req, res);
    return res.status(400).json({ ok: false, fout: 'onbekende actie' });
  } catch (e) {
    console.error('app fout:', e);
    return res.status(500).json({ ok: false, fout: 'serverfout' });
  }
}

async function routeLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  if (!geldigMail(email)) return res.status(400).json({ ok: false, fout: 'Vul een geldig e-mailadres in.' });
  const antwoord = { ok: true, bericht: 'Check je mail: binnen een minuut staat je inlogcode erin. Niets gekregen? Kijk even in je spam.' };

  // Rem: één inlogmail per adres per minuut.
  const rem = await redis(['SET', `app:login:${email}`, '1', 'NX', 'EX', '60']);
  if (rem.ok && rem.result !== 'OK') return res.status(200).json(antwoord);

  // Iedereen kan inloggen (07-10-2026): een onbekend adres krijgt ook een code
  // en wordt na het invoeren van die code een gratis account (zie verifieer).
  // Zo kan iemand die via Instagram binnenkomt meteen de gratis tools gebruiken.
  const [core, lid] = await Promise.all([coreVoorEmail(email), mcLid(email)]);
  {
    const naam = (core && core.naam) || (lid && lid.merge_fields && lid.merge_fields.FNAME) || '';
    // 6 cijfers, een kwartier geldig. Nieuwe aanvraag = nieuwe code, pogingen op 0.
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await redis(['SET', `app:code:${email}`, code, 'EX', '900']);
    await redis(['DEL', `app:pogingen:${email}`]);
    await stuurInlogmail(email, naam, `${APP_URL}?t=${maakAppToken(email)}`, code);
  }
  return res.status(200).json(antwoord);
}

async function routeOverzicht(req, res) {
  const email = leesAppToken(String(req.query?.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Je inloglink is verlopen. Vraag hieronder een nieuwe aan.' });
  meldActief(email);
  const [core, lid, lidmaatschap, kanLid, bandenProfiel, ritten, schemaDossier, meldingen, coachBerichten] = await Promise.all([coreVoorEmail(email), mcLid(email), haalLid(email), lidOpen(), haalBandenProfiel(email), haalRitten(email), haalSchema(email), haalMeldingen(email), haalCoachBerichten(email)]);
  const reviewNu = await reviewOpen(email);
  // Ingelogd via de knop in de mail (zonder code) en nog geen contact? Dan
  // ook hier het gratis account aanmaken.
  if (!lid || lid.status === 'archived') await nieuwAccount(email);
  await tel(email, 'open');
  const mf = (lid && lid.merge_fields) || {};
  // Strava-analyse: de KOOP*-velden zijn de echte (betaalde) uitslag; FTP/OMSLAG
  // kunnen door een later afgehaakte funnelpoging overschreven zijn (lib/lever-rapport.js).
  const analyse = heeftTag(lid, 'power-profile-koper') ? {
    datum: mf.RAPDAT || '', ftp: mf.KOOPFTP || mf.FTP || '', meet: mf.MEETMETH || '', type: mf.RENTYPE || '',
    omslag: mf.KOOPOMS || mf.OMSLAG || '', advies: mf.ADVSCHEMA || '', score: mf.SCORE || '',
    decoupling: mf.MEETMETH === 'hartslag' ? (mf.KOOPDCHR || '') : (mf.KOOPDEC || ''),
    ...adviesBedragen(mf), deadline: mf.DEADLINE || '',
    tegoedLink: mf.PPTOKEN ? `https://michelkredercoaching.nl/trainingsschemas/?pp=${encodeURIComponent(mf.PPTOKEN)}` : ''
  } : null;
  return res.status(200).json({ review: reviewNu ? REVIEW_LINK : null, 
    ok: true,
    email,
    beheer: BEHEER.includes(email),
    lid: lidBeeld(lidmaatschap),
    lidOpen: kanLid,
    // Vóór de Instagram-lancering staat alles behalve de bandenspanning op
    // "binnenkort beschikbaar" (wat iemand al heeft blijft zichtbaar).
    voorLancering: Date.now() < LANCERING,
    // Automatische incasso klaar (Mollie SEPA)? Anders betaalt een lid per periode met iDEAL.
    automatisch: await incassoKlaar(),
    naam: (core && core.naam) || mf.FNAME || '',
    core,
    analyse,
    banden: heeftTag(lid, 'bandenspanning-pdf'),
    // Slimme bandenspanning: leden (en Michel) krijgen hun bewaarde fietsen mee.
    bandenSlim: BEHEER.includes(email) || !!lidBeeld(lidmaatschap).open,
    bandenProfiel: (BEHEER.includes(email) || lidBeeld(lidmaatschap).open) ? (bandenProfiel || schoonProfiel({})) : null,
    bandenRitten: (BEHEER.includes(email) || lidBeeld(lidmaatschap).open) ? ritten : [],
    gratisOver: (BEHEER.includes(email) || lidBeeld(lidmaatschap).open) ? null : await gratisOver(email),
    gratisMax: GRATIS_PER_WEEK,
    aiGebruik: BEHEER.includes(email) ? await aiGebruik() : null,
    // Schema in de app: wat er vandaag op het schema staat (lib/schema-app.js).
    schema: schemaDossier && schemaDossier.huidig && schemaDossier.huidig.plan ? schemaBeeld(schemaDossier.huidig) : null,
    meldingen,
    coachGesteld: (coachBerichten || []).some((b) => b.van === 'ik' || b.van === 'klant'),
    afval: { status: 'binnenkort' },
    pacing: { status: 'binnenkort' }
  });
}

async function routeVanCore(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = await emailVoorCoreToken(String(body.ct || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Deze link werkt niet meer.' });
  return res.status(200).json({ ok: true, t: maakAppToken(email) });
}

async function routeVerifieer(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').replace(/D/g, '');
  if (!geldigMail(email) || code.length !== 6) return res.status(400).json({ ok: false, fout: 'Vul je mailadres en de 6 cijfers uit de mail in.' });
  // Maximaal 5 pogingen per code, anders kun je hem raden.
  const p = await redis(['INCR', `app:pogingen:${email}`]);
  if (p.ok && p.result === 1) await redis(['EXPIRE', `app:pogingen:${email}`, '900']);
  if (p.ok && p.result > 5) return res.status(429).json({ ok: false, fout: 'Te vaak geprobeerd. Vraag een nieuwe code aan.' });
  const r = await redis(['GET', `app:code:${email}`]);
  const goed = r.ok && r.result && String(r.result).length === 6
    && crypto.timingSafeEqual(Buffer.from(String(r.result)), Buffer.from(code));
  if (!goed) return res.status(401).json({ ok: false, fout: 'Deze code klopt niet of is verlopen.' });
  await redis(['DEL', `app:code:${email}`]);
  await redis(['DEL', `app:pogingen:${email}`]);
  // Nieuw adres? Dan nu (pas na de code, dus het adres is echt van hem) in de
  // Keuzehulp-lijst met tag mkc-app. Bestaande contacten blijven zoals ze zijn.
  await nieuwAccount(email);
  return res.status(200).json({ ok: true, t: maakAppToken(email) });
}

async function nieuwAccount(email) {
  if (!MC_KEY || !MC_LIST) return;
  try {
    const bestaand = await mcLid(email);
    if (bestaand && bestaand.status && bestaand.status !== 'archived') return;
    await tel(email, 'nieuw');
    const dc = MC_KEY.split('-')[1];
    const hash = crypto.createHash('md5').update(email).digest('hex');
    const auth = { Authorization: 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64'), 'Content-Type': 'application/json' };
    const basis = `https://${dc}.api.mailchimp.com/3.0/lists/${MC_LIST}/members/${hash}`;
    await fetch(basis, { method: 'PUT', headers: auth, body: JSON.stringify({ email_address: email, status_if_new: 'subscribed', status: 'subscribed' }), signal: AbortSignal.timeout(8000) });
    await fetch(basis + '/tags', { method: 'POST', headers: auth, body: JSON.stringify({ tags: [{ name: 'mkc-app', status: 'active' }] }), signal: AbortSignal.timeout(8000) });
  } catch (e) { console.error('nieuw account Mailchimp mislukt (genegeerd):', e); }
}

// Persoonlijk manifest: de login zit in start_url. Zet je de app op je
// beginscherm terwijl je ingelogd bent, dan opent hij voortaan ingelogd.
function routeManifest(req, res) {
  const t = String(req.query?.t || '');
  const geldig = !!leesAppToken(t);
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  return res.status(200).send(JSON.stringify({
    name: 'MKC, Michel Kreder Coaching', short_name: 'MKC', lang: 'nl',
    description: 'Je Core-app, Strava-analyse en tools van Michel Kreder Coaching op één plek.',
    start_url: geldig ? `/app?t=${encodeURIComponent(t)}` : '/app',
    scope: '/', id: '/app',
    display: 'standalone', orientation: 'portrait',
    background_color: '#0A0A0A', theme_color: '#0A0A0A',
    icons: [
      { src: '/icoon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icoon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icoon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }));
}

// ===========================================================================
// SLIMME BANDENSPANNING (lidmaatschap stap 3, 07-10-2026)
// Leden bewaren hun fietsen, de app haalt het weer van vandaag op en ze kunnen
// een vraag stellen. De gratis calculator rekent in de browser (app.html) met
// /lib/bandendruk.js; hier alleen opslag, weer en de vraag.
//   GET  bandenprofiel ?t=           -> { gewicht, plaats, fietsen }
//   POST bandenprofiel { t, profiel } -> bewaart (max 6 fietsen)
//   GET  weer ?t=&lat=&lon=          -> temperatuur, nat wegdek, regen straks
//   GET  plaats ?t=&q=               -> plaatsnaam opzoeken (Open-Meteo)
//   POST bandvraag { t, vraag, context } -> kort antwoord van de AI-coach
// Redis: app:banden:<email> (JSON), app:bandvraag:<email>:<datum> (teller)
// ===========================================================================
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || '';
const MAX_FIETSEN = 6;
const VRAGEN_PER_DAG = 20;

async function magSlim(email) {
  if (BEHEER.includes(email)) return true;
  return !!lidBeeld(await haalLid(email)).open;
}
async function slimEmail(req, res, t) {
  const email = leesAppToken(String(t || ''));
  if (!email) { res.status(401).json({ ok: false, fout: 'Log opnieuw in.' }); return null; }
  if (!(await magSlim(email))) { res.status(403).json({ ok: false, fout: 'Dit hoort bij het lidmaatschap van de MKC-app.' }); return null; }
  return email;
}

// ---- Gratis vragen (07-10-2026, besluit Michel) ----
// Niet-leden krijgen 3 gratis vragen per week, samen voor de MKC-coach en de
// bandenvraag. Zo proeven ze wat de coach kan; wie meer wil wordt lid.
// Medische vragen tellen niet mee. Redis: app:gratisvragen:<email>:<jaar-week>
const GRATIS_PER_WEEK = 3;
function weekSleutel() {
  const d = new Date(), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dag = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dag);
  const jan = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t - jan) / 86400000 + 1) / 7)}`;
}
async function gratisOver(email) {
  const r = await redis(['GET', `app:gratisvragen:${email}:${weekSleutel()}`]);
  return Math.max(0, GRATIS_PER_WEEK - Number((r.ok && r.result) || 0));
}
async function telGratis(email) {
  const k = `app:gratisvragen:${email}:${weekSleutel()}`;
  const n = await redis(['INCR', k]);
  if (n.ok && n.result === 1) await redis(['EXPIRE', k, String(8 * 86400)]);
  return Math.max(0, GRATIS_PER_WEEK - Number((n.ok && n.result) || GRATIS_PER_WEEK));
}
// Ingelogd? Leden en Michel mogen altijd, anderen zolang er gratis vragen over zijn.
async function vraagRecht(res, t) {
  const email = leesAppToken(String(t || ''));
  if (!email) { res.status(401).json({ ok: false, fout: 'Log opnieuw in.' }); return null; }
  if (await magSlim(email)) return { email, lid: true };
  if (await gratisOver(email) <= 0) {
    res.status(402).json({ ok: false, limiet: true, gratisOver: 0, fout: 'Je 3 gratis vragen van deze week zijn op. Maandag kun je weer, of word lid en vraag zoveel je wilt.' });
    return null;
  }
  return { email, lid: false };
}
// AI-verbruik per maand bijhouden, zodat Michel ziet wat het echt kost.
// Redis: app:ai:<jjjj-mm>:vragen / :in / :out
async function logVerbruik(j) {
  try {
    const u = (j && j.usage) || {}, m = new Date().toISOString().slice(0, 7);
    const inn = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    await Promise.all([
      redis(['INCR', `app:ai:${m}:vragen`]),
      redis(['INCRBY', `app:ai:${m}:in`, String(inn)]),
      redis(['INCRBY', `app:ai:${m}:out`, String(u.output_tokens || 0)])
    ]);
  } catch {}
}
async function aiGebruik() {
  const m = new Date().toISOString().slice(0, 7);
  const [v, i, o] = await Promise.all(['vragen', 'in', 'out'].map((x) => redis(['GET', `app:ai:${m}:${x}`])));
  const n = (r) => Number((r.ok && r.result) || 0);
  const tin = n(i), tout = n(o);
  // Schatting met Opus-prijzen (~$5 in, ~$25 uit per miljoen tokens), omgerekend naar euro.
  const euro = Math.round(((tin * 5 + tout * 25) / 1e6) * 0.92 * 100) / 100;
  return { maand: m, vragen: n(v), tokensIn: tin, tokensUit: tout, euro };
}

function schoonProfiel(p) {
  p = p && typeof p === 'object' ? p : {};
  const gewicht = Math.round(Number(String(p.gewicht ?? '').replace(',', '.')));
  const pl = p.plaats && typeof p.plaats === 'object' ? p.plaats : null;
  const plaats = pl && isFinite(pl.lat) && isFinite(pl.lon)
    ? { naam: String(pl.naam || '').slice(0, 60), lat: Math.round(Number(pl.lat) * 100) / 100, lon: Math.round(Number(pl.lon) * 100) / 100 }
    : null;
  const breedtes = { weg: [23, 25, 26, 28, 30, 32], gravel: [35, 38, 40, 42, 45, 47, 50] };
  const fietsen = (Array.isArray(p.fietsen) ? p.fietsen : []).slice(0, MAX_FIETSEN).map((f, i) => {
    const type = f.type === 'gravel' ? 'gravel' : 'weg';
    const breedte = breedtes[type].includes(Number(f.breedte)) ? Number(f.breedte) : (type === 'gravel' ? 40 : 28);
    return {
      id: String(f.id || 'f' + i).replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'f' + i,
      naam: String(f.naam || (type === 'gravel' ? 'Gravelbike' : 'Racefiets')).slice(0, 30),
      type, breedte, tubeless: !!f.tubeless, hookless: !!f.hookless
    };
  });
  // Kledingadvies: heb je het snel koud of snel warm? En het ochtendbericht.
  const kouType = ['koud', 'warm'].includes(p.kouType) ? p.kouType : 'normaal';
  return { gewicht: gewicht >= 40 && gewicht <= 150 ? gewicht : null, plaats, fietsen, kouType };
}
async function haalBandenProfiel(email) {
  const r = await redis(['GET', `app:banden:${email}`]);
  if (!r.ok || !r.result) return null;
  try { return JSON.parse(r.result); } catch { return null; }
}

async function routeBandenProfiel(req, res) {
  if (req.method === 'POST') {
    const body = await leesBody(req);
    const email = await slimEmail(req, res, body.t); if (!email) return;
    const profiel = schoonProfiel(body.profiel);
    const w = await redis(['SET', `app:banden:${email}`, JSON.stringify(profiel)]);
    if (!w.ok) return res.status(502).json({ ok: false, fout: 'Bewaren lukte niet. Probeer het zo nog eens.' });
    return res.status(200).json({ ok: true, profiel });
  }
  const email = await slimEmail(req, res, req.query?.t); if (!email) return;
  return res.status(200).json({ ok: true, profiel: (await haalBandenProfiel(email)) || schoonProfiel({}) });
}

// Weer via Open-Meteo (gratis, geen sleutel). Nat wegdek = regen in de
// afgelopen 3 uur of nu. Kort in het geheugen bewaard per afgeronde plek.
const weerCache = new Map();
// Weer ophalen bij Open-Meteo: nu, de afgelopen 3 uur (nat wegdek) en de
// komende 12 uur per uur (voor kledingadvies tijdens je rit). Gebruikt door de
// app en het ochtendbericht.
async function haalWeer(lat, lon) {
  lat = Math.round(Number(lat) * 100) / 100; lon = Math.round(Number(lon) * 100) / 100;
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const sleutel = `${lat},${lon},2`, c = weerCache.get(sleutel);
  if (c && Date.now() - c.op < 15 * 60 * 1000) return c.weer;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&hourly=precipitation,temperature_2m,wind_speed_10m,wind_direction_10m&past_hours=3&forecast_hours=13&timezone=Europe%2FAmsterdam&wind_speed_unit=kmh`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('weer ' + r.status);
  const j = await r.json();
  const nu = j.current || {}, uur = j.hourly || {};
  const tijden = uur.time || [], regen = uur.precipitation || [], temps = uur.temperature_2m || [], winden = uur.wind_speed_10m || [], richtingen = uur.wind_direction_10m || [];
  const nuIso = String(nu.time || '').slice(0, 13);
  const idx = Math.max(0, tijden.findIndex((t) => String(t).slice(0, 13) === nuIso));
  const somVoor = regen.slice(Math.max(0, idx - 3), idx + 1).reduce((a, b) => a + (b || 0), 0);
  const somNa = regen.slice(idx + 1, idx + 4).reduce((a, b) => a + (b || 0), 0);
  const laagsteStraks = Math.min(...temps.slice(idx, idx + 4).filter((x) => x != null), nu.temperature_2m ?? 99);
  const weer = {
    temp: Math.round(nu.temperature_2m ?? 0),
    laagste: Math.round(isFinite(laagsteStraks) ? laagsteStraks : nu.temperature_2m ?? 0),
    nat: (nu.precipitation || 0) > 0 || somVoor >= 0.2,
    regenStraks: somNa >= 0.5,
    wind: Math.round(nu.wind_speed_10m || 0),
    richting: Math.round(nu.wind_direction_10m ?? 0),
    code: nu.weather_code ?? null,
    // Per uur vanaf nu: { uur: '14', temp, regen (mm), wind (km/u) }
    uren: tijden.slice(idx, idx + 13).map((t, i) => ({ uur: String(t).slice(11, 13), temp: Math.round(temps[idx + i] ?? 0), regen: Math.round((regen[idx + i] || 0) * 10) / 10, wind: Math.round(winden[idx + i] || 0), richting: Math.round(richtingen[idx + i] ?? 0) }))
  };
  weerCache.set(sleutel, { op: Date.now(), weer });
  return weer;
}
// Het weer tijdens een rit: vertrek over "over" uur, "duur" uur lang.
function weerTijdensRit(weer, over = 0, duur = 2) {
  const uren = (weer && weer.uren) || [];
  const stuk = uren.slice(Math.max(0, Math.floor(over)), Math.max(1, Math.ceil(over + duur)) + 1);
  if (!stuk.length) return { temp: weer ? weer.laagste : null, start: weer ? weer.temp : null, wind: weer ? weer.wind : 0, regen: !!(weer && (weer.nat || weer.regenStraks)) };
  return {
    temp: Math.min(...stuk.map((u) => u.temp)),
    start: stuk[0].temp,
    wind: Math.max(...stuk.map((u) => u.wind)),
    regen: (over < 1 && weer.nat) || stuk.reduce((a, u) => a + u.regen, 0) >= 0.5
  };
}
async function routeWeer(req, res) {
  const email = await slimEmail(req, res, req.query?.t); if (!email) return;
  try {
    const weer = await haalWeer(req.query?.lat, req.query?.lon);
    if (!weer) return res.status(400).json({ ok: false, fout: 'Geen geldige plek.' });
    await tel(email, 'banden-slim');
    return res.status(200).json({ ok: true, weer });
  } catch (e) {
    console.error('weer fout:', e);
    return res.status(502).json({ ok: false, fout: 'Het weer ophalen lukt nu even niet.' });
  }
}

async function routePlaats(req, res) {
  const email = await slimEmail(req, res, req.query?.t); if (!email) return;
  const q = String(req.query?.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.status(400).json({ ok: false, fout: 'Typ een plaatsnaam.' });
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=nl&format=json`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    // Nederland en België eerst, daarna de buurlanden, de rest onderaan.
    const voorkeur = (c) => ({ NL: 0, BE: 1, DE: 2, LU: 2, FR: 3 })[c] ?? 9;
    const plaatsen = (j.results || []).sort((x, y) => voorkeur(x.country_code) - voorkeur(y.country_code)).map((x) => ({ naam: x.name, regio: [x.admin1, x.country_code].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
    return res.status(200).json({ ok: true, plaatsen });
  } catch { return res.status(502).json({ ok: false, fout: 'Zoeken lukt nu even niet.' }); }
}

async function routeBandVraag(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const recht = await vraagRecht(res, body.t); if (!recht) return;
  const email = recht.email;
  if (String(body.tekst || '').trim()) await tel(email, 'coach');
  await tel(email, 'bandvraag');
  const vraag = String(body.vraag || '').trim().slice(0, 500);
  if (vraag.length < 3) return res.status(400).json({ ok: false, fout: 'Typ je vraag.' });
  const datum = new Date().toISOString().slice(0, 10);
  const n = await redis(['INCR', `app:bandvraag:${email}:${datum}`]);
  if (n.ok && n.result === 1) await redis(['EXPIRE', `app:bandvraag:${email}:${datum}`, '90000']);
  if (n.ok && n.result > VRAGEN_PER_DAG) return res.status(429).json({ ok: false, fout: 'Je hebt vandaag al veel gevraagd. Morgen kan het weer.' });
  if (!CLAUDE_KEY) return res.status(503).json({ ok: false, fout: 'De vraagknop werkt nu even niet.' });

  // Context komt van de app: fiets, gewicht, weer en het berekende advies.
  // Alleen tekst, ingekort, en het model rekent niet zelf opnieuw.
  const ctx = String(body.context || '').slice(0, 900);
  const systeem = [
    'Je bent de bandenspanning-assistent in de MKC-app van Michel Kreder, wielercoach en oud-profrenner. Je antwoord gaat direct naar de renner.',
    'Het berekende advies in de context is leidend: noem die getallen, verzin geen andere basisdruk. Je mag wel bijsturen met deze vaste regels: nat wegdek 0,3 bar eraf; klinkers, kasseien of ruw asfalt 0,5 bar eraf; vers glad asfalt 0,3 bar erbij; los grind, zand of modder 0,3 bar eraf; bikepacking met tassen 0,4 bar erbij; voorband zachter dan achter; hookless velg nooit boven 5,0 bar; tubeless 0,2 tot 0,3 bar zachter dan met binnenband. Kou: lucht krimpt, pomp je binnen bij 20 graden en rijd je in de kou, dan zakt de druk ongeveer 0,1 bar per 5 graden.',
    COACH_TOON,
    'Nederlands, maximaal 90 woorden. Geef altijd concrete getallen voor en achter als de vraag om een spanning gaat.',
    'Schrijf platte tekst zonder opmaak: geen sterretjes, geen hekjes, geen vetgedrukt, geen opsomming met streepjes. Houd elke alinea kort, een of twee zinnen. Het weer, nat of droog en de ondergrond staan al in de context: ga daarvan uit en vraag er niet naar. Noem een aanpassing alleen als de vraag iets anders beschrijft dan de context (bijvoorbeeld kasseien of regen morgen).',
    'Gaat de vraag niet over banden, bandenspanning, materiaal of rijden in bepaald weer, zeg dan vriendelijk dat deze knop alleen over banden gaat.',
    'Beloof nooit dat Michel persoonlijk iets doet.'
  ].join(' ') + await voorbeeldenTekst('bandvraag');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-5-5', max_tokens: 2000, output_config: { effort: 'low' }, fallbacks: 'default',
        system: systeem,
        messages: [{ role: 'user', content: `Context:\n${ctx}\n\nVraag:\n${vraag}` }]
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) { console.error('bandvraag Claude', r.status, await r.text()); throw new Error('claude'); }
    const j = await r.json();
    await logVerbruik(j);
    const tekst = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    if (!tekst) throw new Error('leeg');
    await bewaarAntwoord({ email, bron: 'bandvraag', vraag, antwoord: tekst });
    return res.status(200).json({ ok: true, antwoord: tekst, gratisOver: recht.lid ? null : await telGratis(email) });
  } catch {
    return res.status(502).json({ ok: false, fout: 'Even geen antwoord. Probeer het zo nog eens.' });
  }
}

// ===========================================================================
// MKC-COACH (lidmaatschap stap 4, 07-10-2026): één AI-coach voor de hele app.
// Kent de Core-voortgang, de Strava-analyse en de fietsen van deze renner, en
// Michels methode uit lib/coach-kennis.js. Alleen voor leden (en Michel).
//   GET  coach ?t=            -> { berichten }  (laatste 30)
//   POST coach { t, tekst }   -> stelt een vraag, geeft { berichten }
// Redis: app:coach:<email> (JSON-lijst), teller app:coachvraag:<email>:<datum>
// ===========================================================================
const COACH_PER_DAG = 25;
const COACH_MEDISCH = 'Dit ga ik niet op afstand beantwoorden, daar is je lijf te belangrijk voor. Stop met wat pijn doet en laat het checken door je huisarts of fysiotherapeut, zeker als het uitstraalt, je tintelingen voelt, het erger wordt of als het om je hart, ademhaling of duizeligheid gaat. Is dat in orde, dan denk ik graag mee over hoe je weer opbouwt.';
const COACH_MEDISCH_WOORDEN = /(uit\s*stra+l|stra+l\w*\s+(het\s+)?(uit|door)|tintel|doof|gevoelloos|hernia|ischias|operatie|geopereerd|zwanger|scherpe pijn|stekende pijn|bloed|nachtelijke pijn|verlamd|krachtverlies|koorts|gebroken|breuk|pijn op (de|mijn) borst|borstpijn|hartklop|hartritme|duizel|flauw|benauwd|medicijn)/i;
const COACH_STORING = 'Ik kan je vraag nu even niet beantwoorden. Probeer het over een paar minuten nog eens.';

async function haalCoachBerichten(email) {
  const r = await redis(['GET', `app:coach:${email}`]);
  if (!r.ok || !r.result) return [];
  try { const l = JSON.parse(r.result); return Array.isArray(l) ? l : []; } catch { return []; }
}

async function coachContext(email) {
  const [core, lid, banden, schemaDossier, lidm] = await Promise.all([coreVoorEmail(email), mcLid(email), haalBandenProfiel(email), haalSchema(email), haalLid(email)]);
  const mf = (lid && lid.merge_fields) || {};
  const regels = [];
  if (lidm && lidm.coaching) regels.push(`BELANGRIJK: deze renner zit in persoonlijke coaching bij Michel (${lidm.coaching === 'premium' ? 'Premium' : 'Flexibel'}). Michel maakt zijn trainingsplan zelf, persoonlijk in TrainingPeaks. Pas dat plan nooit aan en schuif geen trainingen: bij vragen over zijn plan, zijn trainingen of zijn opbouw zeg je vriendelijk dat hij dat even met Michel kortsluit, via TrainingPeaks of de mail, omdat Michel zijn plan zo heeft opgebouwd. Algemene vragen over voeding, herstel, materiaal, kleding, banden en techniek beantwoord je gewoon. Raad hem nooit een Strava-analyse, een trainingsschema of een pacingplan aan: dat regelt Michel binnen zijn coaching.`);
  const sb = schemaDossier && schemaDossier.huidig && schemaDossier.huidig.plan ? schemaBeeld(schemaDossier.huidig) : null;
  if (sb) regels.push(schemaContext(sb));
  const naam = (core && core.naam) || mf.FNAME || '';
  if (naam) regels.push(`Naam: ${String(naam).split(' ')[0]}.`);
  if (core) {
    if (core.intakeNodig) regels.push('Core-app: gestart, intake nog niet gedaan.');
    else regels.push(`Core-app (beweegt mee, geen vast aantal weken): niveau ${core.week}, fase ${core.faseNaam || core.fase || '?'}, ${core.gedaan || 0} van ${core.frequentie || '?'} sessies van dit niveau gedaan, ${core.afgerond || 0} niveaus afgerond.${core.startScore ? ` Rompscore start ${core.startScore}` : ''}${core.rompscore ? `, laatste ${core.rompscore}` : ''}.`);
    if (core.kracht && core.kracht !== 'nee') regels.push(`Doet ook krachttraining in de sportschool, ${core.kracht} per week. Adviseer: geen core op een zware beendag, sportschool niet de dag voor de zwaarste intervaltraining.`);
    if (core.disbalans) regels.push('Disbalans uit de romptest: ' + Object.entries(core.disbalans).map(([k, x]) => `${k} ${x.pct}% zwakker ${x.kant.toLowerCase()}`).join(', ') + '. De Core-app laat die kant eerst gaan en langer werken.');
  } else regels.push('Core-app: niet gestart.');
  if ((lid && (lid.tags || []).some((t) => t.name === 'power-profile-koper'))) {
    regels.push(`Strava-analyse (${mf.RAPDAT || 'datum onbekend'}): ${mf.MEETMETH === 'hartslag' ? `omslagpunt ${mf.KOOPOMS || mf.OMSLAG || '?'} bpm` : `FTP ${mf.KOOPFTP || mf.FTP || '?'} W`}, renner-type ${mf.RENTYPE || '?'}, geadviseerd schema ${mf.ADVSCHEMA || '?'}.`);
  } else regels.push('Strava-analyse: niet gedaan.');
  if (banden && banden.fietsen && banden.fietsen.length) {
    regels.push(`Gewicht: ${banden.gewicht || '?'} kg. Fietsen: ${banden.fietsen.map((f) => `${f.naam} (${f.type === 'gravel' ? 'gravel' : 'racefiets'}, ${f.breedte} mm, ${f.tubeless ? 'tubeless' : 'binnenband'}${f.hookless ? ', hookless' : ''})`).join('; ')}.`);
  }
  return regels.join('\n');
}

async function routeCoach(req, res) {
  if (req.method !== 'POST') {
    const email = leesAppToken(String(req.query?.t || ''));
    if (!email) return res.status(401).json({ ok: false, fout: 'Log opnieuw in.' });
    const lid = await magSlim(email);
    return res.status(200).json({ ok: true, berichten: (await haalCoachBerichten(email)).slice(-30), gratisOver: lid ? null : await gratisOver(email) });
  }
  const body = await leesBody(req);
  const recht = await vraagRecht(res, body.t); if (!recht) return;
  const email = recht.email;
  if (Date.now() < LANCERING && !BEHEER.includes(email)) return res.status(403).json({ ok: false, binnenkort: true, fout: 'Je eigen coach is binnenkort beschikbaar.' });
  const tekst = String(body.tekst || '').trim().slice(0, 1000);
  if (tekst.length < 3) return res.status(400).json({ ok: false, fout: 'Typ je vraag.' });
  const datum = new Date().toISOString().slice(0, 10);
  const n = await redis(['INCR', `app:coachvraag:${email}:${datum}`]);
  if (n.ok && n.result === 1) await redis(['EXPIRE', `app:coachvraag:${email}:${datum}`, '90000']);
  if (n.ok && n.result > COACH_PER_DAG) return res.status(429).json({ ok: false, fout: 'Je hebt vandaag al veel gevraagd. Morgen kun je weer verder.' });

  const berichten = await haalCoachBerichten(email);
  const nu = new Date().toISOString();
  let antwoord = null, medisch = false;
  if (COACH_MEDISCH_WOORDEN.test(tekst)) { antwoord = COACH_MEDISCH; medisch = true; }
  else if (CLAUDE_KEY) {
    try {
      const context = await coachContext(email);
      // De laatste paar beurten mee, zodat een vervolgvraag begrepen wordt.
      const eerder = berichten.slice(-6).map((b) => ({ role: b.van === 'ik' ? 'user' : 'assistant', content: b.tekst }));
      while (eerder.length && eerder[0].role !== 'user') eerder.shift();
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-opus-5-5', max_tokens: 3000, output_config: { effort: 'low' }, fallbacks: 'default',
          system: `${COACH_KENNIS}\n\nOVER DEZE RENNER\n${context}\n\nREGELS\n${COACH_REGELS}${await voorbeeldenTekst('mkc-coach')}`,
          messages: [...eerder, { role: 'user', content: tekst }]
        }),
        signal: AbortSignal.timeout(40000)
      });
      if (!r.ok) console.error('coach Claude', r.status, await r.text());
      else {
        const j = await r.json();
        await logVerbruik(j);
        if (j.stop_reason === 'refusal') { antwoord = COACH_MEDISCH; medisch = true; }
        else {
          const t = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
          if (t.includes('[MEDISCH]')) { antwoord = COACH_MEDISCH; medisch = true; } else if (t) antwoord = t;
        }
      }
    } catch (e) { console.error('coach fout:', e); }
  }
  const nieuw = berichten.concat(
    { van: 'ik', tekst, op: nu },
    { van: 'coach', tekst: antwoord || COACH_STORING, op: new Date().toISOString(), medisch, storing: !antwoord }
  ).slice(-60);
  await redis(['SET', `app:coach:${email}`, JSON.stringify(nieuw)]);
  if (antwoord && !medisch) await bewaarAntwoord({ email, bron: 'mkc-coach', vraag: tekst, antwoord });
  if (medisch) {
    const [core, mc] = await Promise.all([coreVoorEmail(email), mcLid(email)]);
    await meldMedisch({ email, naam: (core && core.naam) || (mc && mc.merge_fields && mc.merge_fields.FNAME) || '', bron: 'mkc-coach', vraag: tekst,
      extra: core ? `Doet de Core-app: niveau ${core.week}.` : 'Doet de Core-app niet.' });
  }
  // Alleen een echt antwoord telt als gratis vraag; medisch en storingen niet.
  const over = recht.lid ? null : (antwoord && !medisch ? await telGratis(email) : await gratisOver(email));
  return res.status(200).json({ ok: true, berichten: nieuw.slice(-30), gratisOver: over });
}

// ===========================================================================
// OPVOLGEN (alleen Michel, 07-10-2026): de medische meldingen uit
// lib/meld-medisch.js als lijst in de app, met status per melding.
//   GET  opvolgen ?t=                 -> { meldingen }  (laatste 100)
//   POST opvolgen { t, id, status }   -> status: open | gemaild | afgehandeld
// Redis: opvolgen:medisch (lijst, nieuwste eerst), opvolgen:statussen (JSON)
// ===========================================================================
async function routeOpvolgen(req, res) {
  const body = req.method === 'POST' ? await leesBody(req) : {};
  const email = leesAppToken(String(req.method === 'POST' ? body.t : req.query?.t || ''));
  if (!email || !BEHEER.includes(email)) return res.status(403).json({ ok: false });
  const st = await redis(['GET', 'opvolgen:statussen']);
  let statussen = {};
  try { statussen = JSON.parse((st.ok && st.result) || '{}') || {}; } catch { statussen = {}; }
  if (req.method === 'POST') {
    const id = String(body.id || '').slice(0, 20), status = String(body.status || '');
    if (!id || !['open', 'gemaild', 'afgehandeld'].includes(status)) return res.status(400).json({ ok: false });
    statussen[id] = { status, op: new Date().toISOString() };
    await redis(['SET', 'opvolgen:statussen', JSON.stringify(statussen)]);
  }
  const l = await redis(['LRANGE', 'opvolgen:medisch', '0', '99']);
  const meldingen = ((l.ok && l.result) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } })
    .filter(Boolean)
    .map((m) => ({ ...m, status: (m.id && statussen[m.id] && statussen[m.id].status) || 'open' }));
  return res.status(200).json({ ok: true, meldingen });
}

// ===========================================================================
// BANDENGEHEUGEN (07-10-2026, idee Michel): leden bewaren met welke spanning
// ze reden, onder welk weer, en geven achteraf een oordeel (te zacht, precies
// goed, te hard). Bij vergelijkbaar weer op dezelfde fiets komt dat terug in
// de app: "vorige keer perfect" of "vorige keer te hard, probeer 0,2 lager".
//   GET  bandenritten ?t=                       -> { ritten }
//   POST bandenritten { t, rit }                -> nieuwe rit bewaren
//   POST bandenritten { t, id, oordeel }        -> zacht | goed | hard
// Redis: app:bandenritten:<email> (JSON-lijst, nieuwste eerst, max 40)
// ===========================================================================
async function haalRitten(email) {
  const r = await redis(['GET', `app:bandenritten:${email}`]);
  if (!r.ok || !r.result) return [];
  try { const l = JSON.parse(r.result); return Array.isArray(l) ? l : []; } catch { return []; }
}
async function routeBandenRitten(req, res) {
  if (req.method !== 'POST') {
    const email = await slimEmail(req, res, req.query?.t); if (!email) return;
    return res.status(200).json({ ok: true, ritten: await haalRitten(email) });
  }
  const body = await leesBody(req);
  { const e = leesAppToken(String(body.t || '')); if (e && body.rit) await tel(e, 'rit'); }
  const email = await slimEmail(req, res, body.t); if (!email) return;
  let ritten = await haalRitten(email);
  const num = (x, min, max) => { const n = Math.round(Number(x) * 10) / 10; return isFinite(n) && n >= min && n <= max ? n : null; };
  if (body.id && (body.oordeel || body.oordeelKleding)) {
    const rit = ritten.find((x) => x.id === String(body.id));
    if (!rit) return res.status(404).json({ ok: false, fout: 'Rit niet gevonden.' });
    if (body.oordeel) { if (!['zacht', 'goed', 'hard'].includes(body.oordeel)) return res.status(400).json({ ok: false }); rit.oordeel = body.oordeel; }
    if (body.oordeelKleding) { if (!['koud', 'goed', 'warm'].includes(body.oordeelKleding)) return res.status(400).json({ ok: false }); rit.oordeelKleding = body.oordeelKleding; }
    rit.oordeelOp = new Date().toISOString();
    if (rit.oordeel === 'goed' && (!rit.oordeelKleding || rit.oordeelKleding === 'goed')) await reviewMoment(email, 'rit');
  } else {
    const r = body.rit || {};
    const rit = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      op: new Date().toISOString(),
      fiets: String(r.fiets || '').replace(/[^a-z0-9]/gi, '').slice(0, 12),
      fietsNaam: String(r.fietsNaam || '').slice(0, 30),
      voor: num(r.voor, 1, 9), achter: num(r.achter, 1, 9),
      temp: num(r.temp, -20, 45), nat: !!r.nat,
      grond: String(r.grond || '').replace(/[^a-z]/g, '').slice(0, 12),
      oordeel: null,
      // Kleding bij deze rit (gevoelstemperatuur en de kledingband), voor het
      // oordeel achteraf: te koud, precies goed of te warm.
      kleding: r.kleding && typeof r.kleding === 'object' ? { gevoel: num(r.kleding.gevoel, -30, 45), band: String(r.kleding.band || '').slice(0, 30) } : null,
      oordeelKleding: null
    };
    if (!rit.fiets || rit.voor == null || rit.achter == null) return res.status(400).json({ ok: false, fout: 'Onvolledige rit.' });
    // Zelfde fiets op dezelfde dag: vervang de vorige, dan telt de laatste keuze.
    const dag = rit.op.slice(0, 10);
    ritten = ritten.filter((x) => !(x.fiets === rit.fiets && String(x.op).slice(0, 10) === dag && !x.oordeel));
    ritten.unshift(rit);
  }
  ritten = ritten.slice(0, 40);
  await redis(['SET', `app:bandenritten:${email}`, JSON.stringify(ritten)]);
  return res.status(200).json({ ok: true, ritten });
}

// ===========================================================================
// NAKIJKEN EN CORRIGEREN (07-10-2026): elk coach-antwoord wordt bewaard. Michel
// ziet ze in zijn beheerweergave en kan per antwoord zeggen hoe hij het zelf
// zou zeggen. Die correcties gaan als voorbeeld mee in de volgende vragen,
// zodat de coach steeds meer als Michel klinkt.
//   GET  antwoorden ?t=                   -> { antwoorden, correcties }   (alleen Michel)
//   POST antwoorden { t, id, correctie }  -> correctie opslaan (leeg = wissen)
// Redis: app:antwoorden (lijst, nieuwste eerst, max 200), app:correcties (JSON, max 40)
// ===========================================================================
const MAX_VOORBEELDEN = 8;
async function bewaarAntwoord({ email, bron, vraag, antwoord }) {
  try {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    await redis(['LPUSH', 'app:antwoorden', JSON.stringify({ id, email, bron, vraag: String(vraag).slice(0, 600), antwoord: String(antwoord).slice(0, 1500), op: new Date().toISOString() })]);
    await redis(['LTRIM', 'app:antwoorden', '0', '199']);
  } catch {}
}
async function haalCorrecties() {
  const r = await redis(['GET', 'app:correcties']);
  try { const l = JSON.parse((r.ok && r.result) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
// Tekstblok voor de systeemprompt: de laatste correcties als voorbeeld.
async function voorbeeldenTekst(bron) {
  const l = (await haalCorrecties()).filter((c) => !bron || c.bron === bron || bron === 'mkc-coach').slice(0, MAX_VOORBEELDEN);
  if (!l.length) return '';
  return '\n\nVOORBEELDEN: ZO ZOU MICHEL HET ZELF ZEGGEN (volg deze inhoud en toon als een vraag erop lijkt)\n' +
    l.map((c) => `Vraag: ${c.vraag}\nMichel: ${c.correctie}`).join('\n\n');
}
async function routeAntwoorden(req, res) {
  const body = req.method === 'POST' ? await leesBody(req) : {};
  const email = leesAppToken(String(req.method === 'POST' ? body.t : req.query?.t || ''));
  if (!email || !BEHEER.includes(email)) return res.status(403).json({ ok: false });
  let correcties = await haalCorrecties();
  const l = await redis(['LRANGE', 'app:antwoorden', '0', '49']);
  const antwoorden = ((l.ok && l.result) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  if (req.method === 'POST') {
    const id = String(body.id || '').slice(0, 20);
    const tekst = String(body.correctie || '').trim().slice(0, 1200);
    const a = antwoorden.find((x) => x.id === id);
    correcties = correcties.filter((c) => c.id !== id);
    if (tekst && a) correcties.unshift({ id, bron: a.bron, vraag: a.vraag, origineel: a.antwoord, correctie: tekst, op: new Date().toISOString() });
    correcties = correcties.slice(0, 40);
    await redis(['SET', 'app:correcties', JSON.stringify(correcties)]);
  }
  const perId = Object.fromEntries(correcties.map((c) => [c.id, c.correctie]));
  return res.status(200).json({ ok: true, antwoorden: antwoorden.map((a) => ({ ...a, correctie: perId[a.id] || '' })), aantalCorrecties: correcties.length });
}

// ===========================================================================
// OCHTENDBERICHT (07-10-2026): leden kiezen een tijd en dagen, en krijgen dan
// een pushbericht met het weer, hun bandenspanning en wat ze aantrekken.
//   GET  push ?t=                        -> { publicKey, instelling }
//   POST push { t, sub, tijd, dagen, uit } -> aanmelden / wijzigen / uitzetten
//   POST pushtest { t }                  -> nu een bericht naar jezelf
//   GET  pushcron (Vercel Cron, CRON_SECRET) -> verstuurt wat nu aan de beurt is
// Redis: app:push:<email> (JSON), app:push:alle (set met mailadressen)
// Env: VAPID_PUBLIC, VAPID_PRIVATE (zie lib/webpush.js), CRON_SECRET
// ===========================================================================
const CRON_SECRET = process.env.CRON_SECRET || '';
const TIJDEN = ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '11:00', '12:00'];

async function haalPush(email) {
  const r = await redis(['GET', `app:push:${email}`]);
  try { return r.ok && r.result ? JSON.parse(r.result) : null; } catch { return null; }
}
function pushBeeld(p) { return p && p.sub ? { aan: true, tijd: p.tijd, dagen: p.dagen, ochtend: p.ochtend !== false, core: p.core !== false } : { aan: false, tijd: '07:00', dagen: [1, 2, 3, 4, 5, 6, 0], ochtend: true, core: true }; }
// Pushberichten mag iedereen die is ingelogd (Core-herinnering); het ochtendbericht
// zelf gaat alleen naar leden (zie routePushCron).
function pushEmail(res, t) { const e = leesAppToken(String(t || '')); if (!e) res.status(401).json({ ok: false, fout: 'Log opnieuw in.' }); return e; }

async function routePush(req, res) {
  if (req.method !== 'POST') {
    const email = pushEmail(res, req.query?.t); if (!email) return;
    return res.status(200).json({ ok: true, publicKey: process.env.VAPID_PUBLIC || null, instelling: pushBeeld(await haalPush(email)) });
  }
  const body = await leesBody(req);
  const email = pushEmail(res, body.t); if (!email) return;
  if (body.uit) {
    await redis(['DEL', `app:push:${email}`]);
    await redis(['SREM', 'app:push:alle', email]);
    return res.status(200).json({ ok: true, instelling: pushBeeld(null) });
  }
  const oud = await haalPush(email) || {};
  const sub = body.sub && body.sub.endpoint && body.sub.keys ? { endpoint: String(body.sub.endpoint).slice(0, 800), keys: { p256dh: String(body.sub.keys.p256dh || '').slice(0, 200), auth: String(body.sub.keys.auth || '').slice(0, 100) } } : oud.sub;
  if (!sub) return res.status(400).json({ ok: false, fout: 'Geen toestemming voor meldingen ontvangen.' });
  const tijd = TIJDEN.includes(body.tijd) ? body.tijd : (oud.tijd || '07:00');
  const dagen = Array.isArray(body.dagen) ? [...new Set(body.dagen.map(Number).filter((d) => d >= 0 && d <= 6))] : (oud.dagen || [0, 1, 2, 3, 4, 5, 6]);
  const ochtend = typeof body.ochtend === 'boolean' ? body.ochtend : oud.ochtend !== false;
  const core = typeof body.core === 'boolean' ? body.core : oud.core !== false;
  const p = { sub, tijd, dagen, ochtend, core, laatste: oud.laatste || null, sinds: oud.sinds || new Date().toISOString() };
  await redis(['SET', `app:push:${email}`, JSON.stringify(p)]);
  await redis(['SADD', 'app:push:alle', email]);
  if (body.sub && !oud.sub) await tel(email, 'push-aan');
  return res.status(200).json({ ok: true, instelling: pushBeeld(p) });
}

// Het bericht zelf: weer op je plek, spanning voor je eerste fiets, kleding
// voor een rit van 2 uur die over een half uur begint.
async function ochtendBericht(email) {
  const [profiel, ritten] = await Promise.all([haalBandenProfiel(email), haalRitten(email)]);
  if (!profiel || !profiel.plaats) return { title: 'Goedemorgen', body: 'Zet je woonplaats en fiets in de app, dan krijg je hier elke ochtend je bandenspanning en kledingadvies.' };
  const weer = await haalWeer(profiel.plaats.lat, profiel.plaats.lon);
  if (!weer) return null;
  const rit = weerTijdensRit(weer, 0.5, 2);
  const kl = kledingAdvies({ temp: rit.temp, start: rit.start, wind: rit.wind, regen: rit.regen, kouType: profiel.kouType || 'normaal', bijstel: kledingBijstel(ritten), duurUur: 2 });
  let banden = '';
  const f = (profiel.fietsen || [])[0];
  if (f && profiel.gewicht) {
    const a = bandenAdvies(leesInvoer({ bandtype: f.type, gewicht: profiel.gewicht, breedte: f.breedte, tubeless: f.tubeless ? 'tubeless' : 'binnenband' }));
    if (a) {
      const eraf = weer.nat ? 0.3 : 0, min = f.type === 'gravel' ? 1.3 : 2.5, max = f.hookless ? HOOKLESS_MAX : 99;
      const k = (x) => nl(Math.min(max, Math.max(min, x - eraf)));
      banden = `Pomp ${k(a.voor)} voor en ${k(a.achter)} achter${(profiel.fietsen || []).length > 1 ? ` (${f.naam})` : ''}. `;
    }
  }
  const natTekst = weer.nat ? 'nat wegdek' : rit.regen ? 'regen op komst' : 'droog';
  return {
    title: `Vandaag ${weer.temp}° en ${natTekst} in ${profiel.plaats.naam}`,
    body: `${banden}Trek aan: ${kledingKort(kl)}.${kl && kl.tips[0] ? ' ' + kl.tips[0] : ''}`.slice(0, 230),
    url: '/app'
  };
}

async function routePushTest(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = await slimEmail(req, res, body.t); if (!email) return;
  const p = await haalPush(email);
  if (!p || !p.sub) return res.status(400).json({ ok: false, fout: 'Zet eerst het ochtendbericht aan.' });
  const bericht = await ochtendBericht(email);
  const r = await stuurPush(p.sub, bericht || { title: 'Test', body: 'Je ochtendbericht werkt.' });
  if (r.weg) { await redis(['DEL', `app:push:${email}`]); await redis(['SREM', 'app:push:alle', email]); }
  return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, fout: r.ok ? null : 'Versturen lukte niet' + (r.fout ? `: ${r.fout}` : ` (${r.status})`), bericht });
}

// Nederlandse tijd en dag, los van de servertijd (UTC).
function nlNu() {
  const d = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date());
  const v = Object.fromEntries(d.map((x) => [x.type, x.value]));
  const dag = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'].indexOf(String(v.weekday).slice(0, 2).toLowerCase());
  return { datum: `${v.year}-${v.month}-${v.day}`, minuten: Number(v.hour) * 60 + Number(v.minute), dag };
}
async function routePushCron(req, res) {
  const auth = String(req.headers?.authorization || '');
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ ok: false });
  const nu = nlNu();
  const lijst = await redis(['SMEMBERS', 'app:push:alle']);
  let verstuurd = 0, overgeslagen = 0, weg = 0;
  for (const email of (lijst.ok && lijst.result) || []) {
    const p = await haalPush(email);
    if (!p || !p.sub) { await redis(['SREM', 'app:push:alle', email]); continue; }
    const [h, m] = String(p.tijd || '07:00').split(':').map(Number);
    const doel = h * 60 + m;
    // Aan de beurt: juiste dag, tijd net voorbij (binnen een uur), vandaag nog niet gehad.
    if (p.ochtend === false || !p.dagen.includes(nu.dag) || nu.minuten < doel || nu.minuten - doel > 60 || p.laatste === nu.datum) { overgeslagen++; continue; }
    if (!(await magSlim(email))) { overgeslagen++; continue; }   // lidmaatschap verlopen
    const bericht = await ochtendBericht(email).catch(() => null);
    if (!bericht) { overgeslagen++; continue; }
    const r = await stuurPush(p.sub, bericht);
    if (r.weg) { await redis(['DEL', `app:push:${email}`]); await redis(['SREM', 'app:push:alle', email]); weg++; continue; }
    if (r.ok) { p.laatste = nu.datum; await redis(['SET', `app:push:${email}`, JSON.stringify(p)]); verstuurd++; }
  }
  return res.status(200).json({ ok: true, verstuurd, overgeslagen, weg });
}
