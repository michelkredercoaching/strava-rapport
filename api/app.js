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
import fs from 'node:fs';
import path from 'node:path';
import { coreVoorEmail, emailVoorCoreToken, coreTrechter, coreOverzicht } from './core.js';
import { lidBeeld, haalLid, lidOpen, LANCERING, incassoKlaar, haalSchema, ledenOverzicht, lidZoek, geefToegang } from './lid.js';
import { schemaBeeld, schemaContext, PLANNEN as SCHEMA_PLANNEN, laadPlan } from '../lib/schema-app.js';
import { haalMeldingen, leesMelding, appMelding, logPush } from '../lib/app-melding.js';
import { leesDoel, nieuwDoel, volgendeStap, doelContext } from '../lib/doelen.js';
import { maakKortingToken } from '../lib/korting.js';
import { BADGES, BELONINGEN, NIVEAUS, RANGLIJST_VANAF, RENNER, rennerOpen, badgeOverzicht, medailleTotaal, maandUitdaging } from '../lib/badges.js';
import { OEFENINGEN } from '../lib/core.js';
import { tel, overzicht as gebruikOverzicht, CLIENT_GEBEURTENISSEN, GAST_GEBEURTENISSEN } from '../lib/stat.js';
import { COACH_KENNIS, COACH_REGELS, COACH_TOON } from '../lib/coach-kennis.js';
import { meldMedisch } from '../lib/meld-medisch.js';
import { meld as meldActief, opruimen, wisPersoon } from '../lib/app-opruimen.js';
import { ruimReeksenOp } from '../lib/reeks.js';
import { tipVoor } from '../lib/tips.js';
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
// ---- Beheer (13-10-2026): doelen, schema bijstellen, Core-voortgang ----------
function beheerEmail(req, t) { const e = leesAppToken(String(t || '')); return e && BEHEER.includes(e) ? e : null; }

// Wie rijdt waar naartoe? Telling per soort doel en per tocht.
// ---- Palmares: badges (13-10-2026), zie lib/badges.js ----
// Levenslange tellers per persoon in app:teller:<email> (hash). De lijsten zelf
// (ritten, coach) worden afgekapt, de tellers niet.
const maandNu = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }).slice(0, 7);
// Levenslang én per maand (voor de maanduitdaging). Maandtellers blijven 400 dagen.
async function telOp(email, veld, n = 1) {
  if (!email) return;
  await redis(['HINCRBY', `app:teller:${email}`, veld, String(n)]);
  const k = `app:maand:${email}:${maandNu()}`; await redis(['HINCRBY', k, veld, String(n)]); await redis(['EXPIRE', k, String(400 * 86400)]);
}
const amsUur = (iso) => Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false })) % 24;
// Sessies van Michel als beloning (5 en 10 medailles), met oefeningen uit de Core-bibliotheek.
const BELONING_SESSIES = {
  m5: { titel: 'Michel-sessie: klaar voor een lange rit', uitleg: 'Mijn eigen routine voor de dag voor een lange rit of tocht. 6 oefeningen, 40 seconden werk en 20 seconden rust, 2 rondes. Ongeveer 12 minuten.',
    oefeningen: ['birddog', 'deadbug-gebogen', 'zijplank-knieen', 'bridge-mars', 'fietshouding', 'plank'] },
  m10: { titel: 'Herstelsessie van Michel', uitleg: 'Wat ik zelf doe na een lange of zware rit: rustig losmaken, je rug en heupen weer soepel. 6 oefeningen, elk 60 seconden, rustig ademen. Ongeveer 8 minuten.',
    oefeningen: ['kat-koe', 'draai-bovenrug', 'knie-borst', 'couch-stretch', 'bridge', 'kin-intrekken'] }
};
async function badgesBijwerken(email, { core, ritten = [], coachBerichten = [], doel, lidmaatschap, analyse }) {
  const t = await redis(['HGETALL', `app:teller:${email}`]);
  const teller = {};
  if (t.ok && Array.isArray(t.result)) for (let i = 0; i < t.result.length; i += 2) teller[t.result[i]] = Number(t.result[i + 1]) || 0;
  else if (t.ok && t.result && typeof t.result === 'object') for (const [k, v] of Object.entries(t.result)) teller[k] = Number(v) || 0;
  if (teller.gezaaid !== 2) {
    // Eenmalig: wat er al op de server staat (ritten met servertijd, coachvragen, doel, analyse).
    const zaai = { ritten: ritten.length, beoordeeld: ritten.filter((x) => x.oordeel || x.oordeelKleding).length, vroeg: ritten.filter((x) => amsUur(x.op) < 7).length,
      coach: coachBerichten.filter((b) => b.van === 'ik').length, finishes: doel && doel.doel === 'evenement' && doel.klaar ? 1 : 0, analyses: analyse ? 1 : 0 };
    const velden = [];
    for (const [k, v] of Object.entries(zaai)) { teller[k] = Math.max(teller[k] || 0, v); velden.push(k, String(teller[k])); }
    teller.gezaaid = 2; velden.push('gezaaid', '2');
    await redis(['HSET', `app:teller:${email}`, ...velden]);
  }
  // Reeks: elke dag de app open (Amsterdamse dagen). openMax = beste reeks ooit.
  const vandaag = Math.floor(Date.parse(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }) + 'T00:00:00Z') / 864e5);
  if (teller.openDag !== vandaag) {
    teller.openReeks = teller.openDag === vandaag - 1 ? (teller.openReeks || 0) + 1 : 1;
    teller.openMax = Math.max(teller.openMax || 0, teller.openReeks); teller.openDag = vandaag;
    await redis(['HSET', `app:teller:${email}`, 'openDag', String(vandaag), 'openReeks', String(teller.openReeks), 'openMax', String(teller.openMax)]);
    { const k = `app:maand:${email}:${maandNu()}`; await redis(['HINCRBY', k, 'appDagen', '1']); await redis(['EXPIRE', k, String(400 * 86400)]); }
  }
  const stand = {
    ...teller,
    coreSessies: (core && core.sessiesTotaal) || 0, coreNiveaus: (core && core.afgerond) || 0, reeks: (core && core.reeks) || 0,
    rompPlus: core && core.rompscore != null && core.startScore != null ? core.rompscore - core.startScore : 0,
    maten: (lidmaatschap && lidmaatschap.vriendAantal) || 0,
    lidMaanden: lidmaatschap && lidmaatschap.sinds && ((lidmaatschap.tot && Date.parse(lidmaatschap.tot) > Date.now()) || lidmaatschap.bron === 'coaching') ? Math.floor((Date.now() - Date.parse(lidmaatschap.sinds)) / (30.44 * 864e5)) : 0
  };
  const [rm, rb] = await Promise.all([redis(['GET', `app:medailles:${email}`]), redis(['GET', `app:badgebeloning:${email}`])]);
  let verdiend = {}; try { verdiend = (rm.ok && rm.result && JSON.parse(rm.result)) || {}; } catch (e) {}
  let bel = {}; try { bel = (rb.ok && rb.result && JSON.parse(rb.result)) || {}; } catch (e) {}
  const eerste = !(rm.ok && rm.result);
  const nu = new Date().toISOString(), nieuw = [];
  // Lid (ook coaching en schema): goud mogelijk. Gratis: brons en zilver.
  const lidVol = !!(lidmaatschap && ((lidmaatschap.tot && Date.parse(lidmaatschap.tot) > Date.now()) || lidmaatschap.bron === 'coaching'));
  for (const b of badgeOverzicht(stand, verdiend, { lid: lidVol })) {
    for (let i = 1; i <= b.niveau; i++) {
      verdiend[b.id] = verdiend[b.id] || {};
      if (!verdiend[b.id][i]) { verdiend[b.id][i] = nu; nieuw.push({ id: b.id, niveau: i }); }
    }
  }
  // Maanduitdaging
  const mk = maandNu(), uit = maandUitdaging(mk);
  const mt = await redis(['HGETALL', `app:maand:${email}:${mk}`]);
  const maandTel = {}; if (mt.ok && Array.isArray(mt.result)) for (let i = 0; i < mt.result.length; i += 2) maandTel[mt.result[i]] = Number(mt.result[i + 1]) || 0;
  maandTel.coreSessies = (core && core.sessiesMaand) || 0;
  const maandWaarde = maandTel[uit.meet] || 0, maandId = 'maand-' + mk;
  if (!verdiend[maandId] && maandWaarde >= uit.doel && (!uit.lid || lidVol)) { verdiend[maandId] = { 1: nu, maand: true }; nieuw.push({ id: maandId, niveau: 1, maand: true }); }
  const maandCollectie = Object.entries(verdiend).filter(([id, v]) => /^maand-/.test(id) && v && v[1]).map(([id, v]) => { const u = maandUitdaging(id.slice(6)); return { sleutel: u.sleutel, naam: u.naam, kort: u.kort, op: v[1] }; }).sort((a, b) => a.sleutel < b.sleutel ? 1 : -1);
  const eindMaand = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)), 0).getDate(), vandaagDag = Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }).slice(8, 10));
  const maand = { ...uit, waarde: Math.min(maandWaarde, uit.doel), behaald: !!verdiend[maandId], op: verdiend[maandId] ? verdiend[maandId][1] : null, dagenOver: eindMaand - vandaagDag, opSlot: !!uit.lid && !lidVol };
  const lijst = badgeOverzicht(stand, verdiend, { lid: lidVol }), goud = lijst.filter((b) => b.niveau === 3).length;
  const totaal = medailleTotaal(lijst) + maandCollectie.length;
  // Beloningen: één keer, bij het halen van het aantal medailles.
  const lid = !!(lidmaatschap && lidmaatschap.tot && Date.parse(lidmaatschap.tot) > Date.now());
  const coaching = !!(lidmaatschap && lidmaatschap.bron === 'coaching');
  const nieuweBel = [];
  for (const r of BELONINGEN) {
    if (totaal < r.n || goud < (r.goud || 0) || bel[r.id]) continue;
    const x = { op: nu };
    if (r.id === 'm5' && !lid && !coaching) { const k = `app:gratisvragen:${email}:${weekSleutel()}`; await redis(['INCRBY', k, '-2']); await redis(['EXPIRE', k, String(8 * 86400)]); x.vragen = 2; }
    if (r.id === 'm10') { if (!lid && !coaching) { await redis(['SET', `app:badgekorting:${email}`, '5']); x.lidKorting = 5; } }
    if (r.id === 'm25') { x.binnenkort = true; }
    if (r.id === 'm15') { if (coaching) x.coaching = true; else { const tk = maakKortingToken(0, 365); x.link = tk ? `https://rapport.michelkredercoaching.nl/?korting=${tk}` : null; } }
    bel[r.id] = x; nieuweBel.push(r.id);
  }
  if (nieuw.length || nieuweBel.length || eerste) {
    await redis(['SET', `app:medailles:${email}`, JSON.stringify(verdiend)]);
    if (nieuweBel.length) await redis(['SET', `app:badgebeloning:${email}`, JSON.stringify(bel)]);
    await redis(['SADD', 'app:badges:alle', email]);
  }
  const rp = await redis(['GET', `app:rangprofiel:${email}`]);
  if (rp.ok && rp.result) await redis(['ZADD', 'app:ranglijst', String(totaal * 100 + goud), email]);
  const beloningen = BELONINGEN.map((r) => ({ ...r, behaald: !!bel[r.id], ...(bel[r.id] || {}),
    ...(BELONING_SESSIES[r.id] && bel[r.id] ? { link: null, sessie: { ...BELONING_SESSIES[r.id], oefeningen: BELONING_SESSIES[r.id].oefeningen.map((id) => ({ naam: (OEFENINGEN[id] || {}).naam || id, cue: (OEFENINGEN[id] || {}).cue || '' })) } } : {}) }));
  // Bij de allereerste keer geen feestje voor alles wat er al lag.
  return { badges: lijst, medailles: totaal, goud, maand, maandCollectie, ranglijstOpen: totaal >= RANGLIJST_VANAF, appReeks: teller.openReeks || 1, beloningen, nieuweBadges: eerste ? [] : nieuw, nieuweBeloningen: eerste ? [] : nieuweBel };
}
// Beheer: hoe vaak elk niveau is gehaald, wie de meeste medailles heeft, en per
// persoon de onderbouwing (tellers, datums en beloningen), om alles na te kijken.
async function routeBadgeOverzicht(req, res) {
  if (!beheerEmail(req, req.query?.t)) return res.status(403).json({ ok: false });
  const wie = String(req.query?.email || '').trim().toLowerCase();
  if (wie) {
    const [b, t, bl] = await Promise.all([redis(['GET', `app:medailles:${wie}`]), redis(['HGETALL', `app:teller:${wie}`]), redis(['GET', `app:badgebeloning:${wie}`])]);
    let verdiend = {}; try { verdiend = JSON.parse(b.result) || {}; } catch (e) {}
    let beloning = {}; try { beloning = JSON.parse(bl.result) || {}; } catch (e) {}
    const teller = {}; if (t.ok && Array.isArray(t.result)) for (let i = 0; i < t.result.length; i += 2) teller[t.result[i]] = Number(t.result[i + 1]) || 0;
    return res.status(200).json({ ok: true, email: wie, verdiend, teller, beloning });
  }
  const r = await redis(['SMEMBERS', 'app:badges:alle']);
  const perBadge = {}, mensen = [];
  for (const email of (r.ok && r.result) || []) {
    if (BEHEER.includes(email)) continue;
    const b = await redis(['GET', `app:medailles:${email}`]);
    let v = {}; try { v = JSON.parse(b.result) || {}; } catch (e) {}
    let n = 0;
    for (const [id, niv] of Object.entries(v)) { if (!niv || typeof niv !== 'object') continue; perBadge[id] = perBadge[id] || [0, 0, 0]; for (const k of Object.keys(niv).filter((k) => /^[123]$/.test(k))) { perBadge[id][Number(k) - 1]++; n++; } }
    mensen.push({ email, aantal: n });
  }
  mensen.sort((a, b) => b.aantal - a.aantal);
  return res.status(200).json({ ok: true, badges: BADGES.map((b) => ({ id: b.id, naam: b.naam, groep: b.groep, aantal: perBadge[b.id] || [0, 0, 0] })), top: mensen.slice(0, 15), totaal: mensen.length });
}
// ---- Ranglijst (13-10-2026) ----
// Alleen met een zelfgemaakte renner (bijnaam + avatar), nooit je echte naam of mailadres.
// Score = medailles x 100 + aantal gouden badges (bij gelijke stand telt goud).
const RL_KLEUREN = ['#FF6B1A', '#E53935', '#1E88E5', '#43A047', '#8E24AA', '#FDD835', '#00ACC1', '#F5F3EF'];
const RL_ICONEN = ['fiets', 'berg', 'bliksem', 'wiel', 'vlag', 'ster', 'vlam', 'kroon'];
function rlNaam(x) { return String(x || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16); }
async function rlProfiel(email) { const r = await redis(['GET', `app:rangprofiel:${email}`]); try { return (r.ok && r.result && JSON.parse(r.result)) || null; } catch (e) { return null; } }
async function routeRangProfiel(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false });
  if (body.weg === true) { await redis(['DEL', `app:rangprofiel:${email}`]); await redis(['ZREM', 'app:ranglijst', email]); return res.status(200).json({ ok: true, weg: true }); }
  const rm = await redis(['GET', `app:medailles:${email}`]);
  let v = {}; try { v = JSON.parse(rm.result) || {}; } catch (e) {}
  const totaal = Object.values(v).reduce((t, n) => t + (n && typeof n === 'object' ? Object.keys(n).filter((k) => /^[123]$/.test(k)).length : 0), 0);
  const goud = Object.values(v).filter((n) => n && n[3]).length;
  if (totaal < RANGLIJST_VANAF) return res.status(400).json({ ok: false, fout: `De ranglijst gaat open bij ${RANGLIJST_VANAF} medailles.` });
  const naam = rlNaam(body.naam);
  if (naam.length < 2) return res.status(400).json({ ok: false, fout: 'Kies een bijnaam van minstens 2 tekens.' });
  if (/@|www|http|\.nl|\.com/i.test(String(body.naam))) return res.status(400).json({ ok: false, fout: 'Gebruik een bijnaam, geen mailadres of website.' });
  // Renner: elk onderdeel moet bestaan én vrijgespeeld zijn (medailles en goud).
  const deel = {};
  for (const soort of ['huid', 'trui', 'helm', 'bril', 'fiets', 'wielen']) {
    const item = RENNER[soort].find((x) => x.id === body[soort]) || RENNER[soort][0];
    if (!rennerOpen(item, totaal, goud)) return res.status(400).json({ ok: false, fout: `${item.naam} speel je vrij bij ${item.vanaf.m} medailles${item.vanaf.g ? ' waarvan ' + item.vanaf.g + ' goud' : ''}.` });
    deel[soort] = item.id;
  }
  const p = { naam, ...deel, op: new Date().toISOString() };
  await redis(['SET', `app:rangprofiel:${email}`, JSON.stringify(p)]);
  await redis(['ZADD', 'app:ranglijst', String(totaal * 100 + goud), email]);
  return res.status(200).json({ ok: true, profiel: p });
}
// Beheer: alle renners op de ranglijst (met mailadres), bijnaam weghalen, en testmedailles voor jezelf.
async function routeRangBeheer(req, res) {
  const ik = beheerEmail(req, req.query?.t || (req.body && req.body.t));
  const body = req.method === 'POST' ? await leesBody(req) : {};
  const beheerder = ik || beheerEmail(req, body.t);
  if (!beheerder) return res.status(403).json({ ok: false });
  if (body.weg) { const e = String(body.weg).toLowerCase(); await redis(['DEL', `app:rangprofiel:${e}`]); await redis(['ZREM', 'app:ranglijst', e]); }
  if (body.test === 'geef' || body.test === 'weg') {
    const rm = await redis(['GET', `app:medailles:${beheerder}`]);
    let v = {}; try { v = JSON.parse(rm.result) || {}; } catch (e) {}
    for (const id of ['clubkapitein', 'leergierig', 'gemeten']) { if (body.test === 'geef') v[id] = { ...(v[id] || {}), 1: (v[id] && v[id][1]) || new Date().toISOString(), test: true }; else if (v[id] && v[id].test) delete v[id]; }
    await redis(['SET', `app:medailles:${beheerder}`, JSON.stringify(v)]);
    if (body.test === 'weg') { await redis(['DEL', `app:rangprofiel:${beheerder}`]); await redis(['ZREM', 'app:ranglijst', beheerder]); }
  }
  const top = await redis(['ZREVRANGE', 'app:ranglijst', '0', '99', 'WITHSCORES']);
  const l = (top.ok && top.result) || [], rijen = [];
  for (let i = 0; i < l.length; i += 2) { const p = await rlProfiel(l[i]); rijen.push({ email: l[i], naam: p ? p.naam : '(geen profiel)', medailles: Math.floor((Number(l[i + 1]) || 0) / 100) }); }
  return res.status(200).json({ ok: true, rijen });
}
async function routeRanglijst(req, res) {
  const email = leesAppToken(String(req.query?.t || ''));
  if (!email) return res.status(401).json({ ok: false });
  const [top, n, mijn, mijnRang, mijnScore] = await Promise.all([redis(['ZREVRANGE', 'app:ranglijst', '0', '19', 'WITHSCORES']), redis(['ZCARD', 'app:ranglijst']), rlProfiel(email), redis(['ZREVRANK', 'app:ranglijst', email]), redis(['ZSCORE', 'app:ranglijst', email])]);
  const l = (top.ok && top.result) || [], rijen = [];
  for (let i = 0; i < l.length; i += 2) {
    const p = await rlProfiel(l[i]); if (!p) continue;
    const sc = Number(l[i + 1]) || 0;
    rijen.push({ plek: rijen.length + 1, naam: p.naam, kleur: p.kleur, icoon: p.icoon, huid: p.huid, trui: p.trui, helm: p.helm, bril: p.bril, fiets: p.fiets, wielen: p.wielen, medailles: Math.floor(sc / 100), goud: sc % 100, ik: l[i] === email });
  }
  const sc = Number(mijnScore.ok && mijnScore.result) || 0;
  return res.status(200).json({ ok: true, rijen, totaal: Number(n.ok && n.result) || 0, profiel: mijn,
    ik: mijnRang.ok && mijnRang.result != null ? { plek: Number(mijnRang.result) + 1, medailles: Math.floor(sc / 100), goud: sc % 100 } : null,
    kleuren: RL_KLEUREN, iconen: RL_ICONEN, renner: RENNER });
}
async function routeDoelenOverzicht(req, res) {
  if (!beheerEmail(req, req.query?.t)) return res.status(403).json({ ok: false });
  const r = await redis(['SMEMBERS', 'app:doel:alle']);
  const perSoort = {}, tochten = {};
  let totaal = 0;
  for (const email of (r.ok && r.result) || []) {
    if (BEHEER.includes(email)) continue;
    const d = await haalDoel(email); if (!d || !d.doel) continue;
    totaal++;
    perSoort[d.doel] = (perSoort[d.doel] || 0) + 1;
    if (d.doel === 'evenement' && d.naam) {
      const k = String(d.naam).trim();
      const t = tochten[k] || (tochten[k] = { naam: k, aantal: 0, datums: [] });
      t.aantal++; if (d.datum && !t.datums.includes(d.datum)) t.datums.push(d.datum);
    }
  }
  const lijst = Object.values(tochten).map((t) => ({ ...t, datums: t.datums.sort() })).sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam));
  return res.status(200).json({ ok: true, totaal, perSoort, tochten: lijst });
}

// Schema bijstellen: atleet kiezen, schema (vermogen of hartslag) en de week waar
// hij nu in zit. De weekdagen blijven op dezelfde dagen vallen: alleen de
// verschuiving verandert. Nog geen schema? Dan krijgt hij er een (geefToegang).
function schemaTitel(plan) {
  const winter = plan.startsWith('winter');
  const nv = winter ? plan.split('-')[1] : plan.split('-')[0];
  const niveauNaam = nv.replace(/^./, (c) => c.toUpperCase());
  const p = laadPlan(plan);
  return { niveauNaam, titel: winter ? 'Indoor Winterprogramma ' + niveauNaam : niveauNaam + ' ' + p.weken + ' weken', weken: p.weken };
}
function nlVandaag() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date()); }
function dagVerschil(van, tot) { return Math.round((Date.parse(tot + 'T12:00:00Z') - Date.parse(van + 'T12:00:00Z')) / 864e5); }
async function routeSchemaBeheer(req, res) {
  if (req.method !== 'POST') {
    if (!beheerEmail(req, req.query?.t)) return res.status(403).json({ ok: false });
    const [ls, act] = await Promise.all([redis(['SMEMBERS', 'lid:schema']), redis(['ZRANGE', 'app:actief', '0', '-1'])]);
    const metSchema = [];
    for (const email of (ls.ok && ls.result) || []) {
      const s = await haalSchema(email); const h = s && s.huidig; if (!h || !h.plan) continue;
      const b = schemaBeeld(h);
      metSchema.push({ email, titel: h.titel || '', plan: h.plan, start: h.start, verschuif: Number(h.verschuif) || 0, week: b ? b.week : null, weken: b ? b.weken : null, status: b ? b.status : null });
    }
    metSchema.sort((a, b) => a.email.localeCompare(b.email));
    const iedereen = [...new Set([...metSchema.map((x) => x.email), ...((act.ok && act.result) || [])])].filter((e) => !BEHEER.includes(e)).sort();
    const plannen = [...SCHEMA_PLANNEN, ...['winter-basis-w', 'winter-opbouw-w'].filter((p) => laadPlan(p))];
    return res.status(200).json({ ok: true, metSchema, iedereen, plannen });
  }
  const body = await leesBody(req);
  if (!beheerEmail(req, body.t)) return res.status(403).json({ ok: false });
  const email = String(body.email || '').trim().toLowerCase();
  const plan = String(body.plan || '');
  if (!geldigMail(email)) return res.status(400).json({ ok: false, fout: 'Kies een atleet.' });
  if (!laadPlan(plan)) return res.status(400).json({ ok: false, fout: 'Kies een schema.' });
  const { niveauNaam, titel, weken } = schemaTitel(plan);
  const week = Math.max(1, Math.min(weken, Number(body.week) || 1));
  const vandaag = nlVandaag();
  const oud = await haalSchema(email);
  const h = oud && oud.huidig && oud.huidig.plan ? oud.huidig : null;
  // Welke dag van de week is het vandaag in het schema? Zelfde weekdag houden.
  const dagInWeek = Number.isFinite(Number(body.dag)) && Number(body.dag) >= 1 && Number(body.dag) <= 7 ? Number(body.dag)
    : h ? ((((dagVerschil(h.start, vandaag) - (Number(h.verschuif) || 0)) % 7) + 7) % 7) + 1
    : ((new Date(vandaag + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1;   // nieuw schema: dag 1 = maandag
  const nieuwDagNr = (week - 1) * 7 + dagInWeek;
  if (!h) {
    // Nog geen schema: start zo kiezen dat vandaag op die dag valt.
    const start = new Date(Date.parse(vandaag + 'T12:00:00Z') - (nieuwDagNr - 1) * 864e5).toISOString().slice(0, 10);
    const r = await geefToegang({ email, naam: '', soort: 'schema', plan, start });
    return res.status(r.ok ? 200 : 400).json({ ...r, nieuw: true });
  }
  const verschuif = dagVerschil(h.start, vandaag) + 1 - nieuwDagNr;
  const huidig = { ...h, plan, weken, niveauNaam, titel, verschuif, bijgesteld: new Date().toISOString() };
  await redis(['SET', `schema:${email}`, JSON.stringify({ ...oud, huidig })]);
  const b = schemaBeeld(huidig);
  return res.status(200).json({ ok: true, schema: { email, titel, plan, week: b ? b.week : week, dagNr: b ? b.dagNr : nieuwDagNr, status: b ? b.status : null, vandaag: b && b.vandaag.length ? b.vandaag.map((w) => w.titel).join(' + ') : 'rust' } });
}

// Core-voortgang per deelnemer, met wie in coaching zit.
async function routeCoreOverzicht(req, res) {
  if (!beheerEmail(req, req.query?.t)) return res.status(403).json({ ok: false });
  const l = await coreOverzicht().catch(() => []);
  for (const x of l) { const lm = await haalLid(x.email).catch(() => null); x.coaching = lm && lm.coaching ? lm.coaching : null; x.lid = !!(lm && lidBeeld(lm).open); }
  return res.status(200).json({ ok: true, deelnemers: l.filter((x) => !BEHEER.includes(x.email)) });
}

async function routeGebruik(req, res) {
  const email = leesAppToken(String(req.query?.t || ''));
  if (!email || !BEHEER.includes(email)) return res.status(403).json({ ok: false });
  const [ov, soorten, core] = await Promise.all([gebruikOverzicht(Math.min(30, Number(req.query?.dagen) || 14)), actiefPerSoort(), coreTrechter().catch(() => null)]);
  return res.status(200).json({ ok: true, ...ov, soorten, core });
}
// Actieve mensen per soort (11-10-2026): vandaag, 7 en 30 dagen, gesplitst in
// gratis, betaald lid, lid via schema en coaching.
async function actiefPerSoort() {
  const nlDag = (t) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const sleutels = (n) => Array.from({ length: n }, (_, i) => `stat:${nlDag(Date.now() - i * 86400000)}:actief`);
  const [r1, r7, r30] = await Promise.all([redis(['SUNION', ...sleutels(1)]), redis(['SUNION', ...sleutels(7)]), redis(['SUNION', ...sleutels(30)])]);
  const lijst = (r) => ((r.ok && r.result) || []).filter((e) => !BEHEER.includes(e));
  const soort = {};
  for (const e of lijst(r30)) {
    const b = lidBeeld(await haalLid(e));
    soort[e] = b.coaching || b.bron === 'coaching' ? 'coaching' : !b.open ? 'gratis' : b.bron === 'betaald' ? 'betaald' : 'schema';
  }
  const tel = (r) => { const t = { totaal: 0, gratis: 0, betaald: 0, schema: 0, coaching: 0 }; for (const e of lijst(r)) { t.totaal++; t[soort[e] || 'gratis']++; } return t; };
  return { vandaag: tel(r1), week: tel(r7), maand: tel(r30) };
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

// ---- Gratis account vanuit de bandenpagina (09-10-2026) ----------------------
// Iemand vult op /banden zijn fiets en gewicht in plus naam en mailadres. Is het
// mailadres nieuw voor de app, dan maken we meteen een gratis account en loggen
// we in: de uitslag staat op de volgende pagina, in de app. Bestaat het adres al
// (lid, Core, appgegevens of al een app-account), dan eerst een inlogcode, zodat
// niemand met andermans mailadres in een bestaand account komt.
async function routeGastAccount(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!(await vrijGrens(req))) return res.status(429).json({ ok: false, fout: 'Even rustig aan, probeer het zo nog eens.' });
  const body = await leesBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  if (!geldigMail(email)) return res.status(400).json({ ok: false, fout: 'Vul een geldig e-mailadres in.' });
  const [core, lid, mc, banden, push, coach] = await Promise.all([coreVoorEmail(email), haalLid(email), mcLid(email),
    redis(['EXISTS', `app:banden:${email}`]), redis(['EXISTS', `app:push:${email}`]), redis(['EXISTS', `app:coach:${email}`])]);
  const bestaand = !!core || !!lid || heeftTag(mc, 'mkc-app') || [banden, push, coach].some((r) => r.ok && Number(r.result) > 0) || BEHEER.includes(email);
  if (bestaand) return res.status(200).json({ ok: true, bestaand: true });
  await nieuwAccount(email);
  await tel(email, 'banden-account');
  return res.status(200).json({ ok: true, t: maakAppToken(email) });
}

// ---- "Vond je dit nuttig?" (09-10-2026) ----------------------------------------
async function routeNuttig(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false });
  const id = String(body.id || '').replace(/[^a-z0-9]/g, '').slice(0, 20), w = body.nuttig === 'ja' ? 'ja' : 'nee';
  if (!id) return res.status(400).json({ ok: false });
  await redis(['HSET', 'app:nuttig', id, w]);
  await redis(['HINCRBY', 'app:nuttig:tel', w, 1]);
  const c = await redis(['GET', `app:coach:${email}`]);
  try { const l = c.ok && c.result ? JSON.parse(c.result) : null; const b = l && l.find((x) => x.aid === id); if (b) { b.nuttig = w; await redis(['SET', `app:coach:${email}`, JSON.stringify(l)]); } } catch {}
  return res.status(200).json({ ok: true });
}

// ---- "Hou me op de hoogte" voor Afvalprogramma en pacingplan (09-10-2026) ----
const INTERESSE = { afval: 'interesse-afvalprogramma', pacing: 'interesse-pacingplan' };
async function routeInteresse(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false });
  if (!INTERESSE[body.product]) return res.status(400).json({ ok: false });
  await zetInteresse(email, body.product);
  return res.status(200).json({ ok: true });
}
async function zetInteresse(email, product) {
  const tag = INTERESSE[product];
  await redis(['SADD', `app:interesse:${product}`, email]);
  if (MC_KEY && MC_LIST) {
    try {
      const dc = MC_KEY.split('-')[1], hash = crypto.createHash('md5').update(email).digest('hex');
      await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${MC_LIST}/members/${hash}/tags`, { method: 'POST', headers: { Authorization: 'apikey ' + MC_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: [{ name: tag, status: 'active' }] }), signal: AbortSignal.timeout(8000) });
    } catch {}
  }
}

// ---- Push opnieuw (12-10-2026), alleen Michel, alleen naar zijn eigen telefoon ----
// Voor screenshots op Instagram. GET = wat hij kreeg (logboek) + voorbeelden van
// elk soort bericht. POST { t, title, body, url } = nu naar zijn eigen toestel.
async function routePushOpnieuw(req, res) {
  const body = req.method === 'POST' ? await leesBody(req) : {};
  const ik = leesAppToken(String(req.method === 'POST' ? body.t : req.query?.t || ''));
  if (!ik || !BEHEER.includes(ik)) return res.status(403).json({ ok: false });
  if (req.method === 'POST') {
    const p = await haalPush(ik);
    if (!p || !p.sub) return res.status(400).json({ ok: false, fout: 'Zet eerst meldingen aan op deze telefoon.' });
    await new Promise((ok) => setTimeout(ok, 5000)); // tijd om je scherm te vergrendelen
    const r = await stuurPush(p.sub, { title: String(body.title || '').slice(0, 120), body: String(body.body || '').slice(0, 400), url: String(body.url || '/app').slice(0, 200), tag: 'mkc-opnieuw-' + Date.now() });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, fout: r.ok ? null : 'Versturen lukte niet' });
  }
  const l = await redis(['LRANGE', `app:pushlog:${ik}`, '0', '39']);
  const log = ((l.ok && l.result) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  // Ook oudere meldingen uit de app (van vóór het logboek) erbij.
  const ml = await redis(['LRANGE', `app:meldingen:${ik}`, '0', '19']);
  for (const x of (ml.ok && ml.result) || []) { try { const m = JSON.parse(x); if (!log.some((g) => g.title === m.titel && Math.abs(Date.parse(g.op) - Date.parse(m.op)) < 6e4)) log.push({ title: m.titel, body: m.tekst, url: m.link, op: m.op }); } catch {} }
  log.sort((a, b) => Date.parse(b.op) - Date.parse(a.op));
  const vb = [];
  const och = await ochtendBericht(ik).catch(() => null); if (och) vb.push({ soort: 'Ochtendbericht (echt, nu)', ...och, url: '/app#rijden' });
  // Varianten (12-10-2026): elke keer andere combinaties van weer, plaats, fiets,
  // gewicht en kouType, door de echte banden- en kledingberekening.
  const kies = (l) => l[Math.floor(Math.random() * l.length)];
  const schud = (l) => l.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const PLAATSEN = ['Utrecht', 'Valkenburg', 'Zwolle', 'Eindhoven', 'Amersfoort', 'Nijmegen', 'Gent', 'Leuven', 'Apeldoorn', 'Haarlem', 'Groningen', 'Breda', 'Maastricht', 'Arnhem', 'Den Bosch'];
  const FIETSEN = [
    { naam: 'Racefiets', type: 'weg', breedte: 25, tubeless: false },
    { naam: 'Racefiets', type: 'weg', breedte: 28, tubeless: true },
    { naam: 'Racefiets', type: 'weg', breedte: 30, tubeless: true, hookless: true },
    { naam: 'Racefiets', type: 'weg', breedte: 26, tubeless: false },
    { naam: 'Gravel', type: 'gravel', breedte: 40, tubeless: true },
    { naam: 'Gravel', type: 'gravel', breedte: 45, tubeless: true }
  ];
  const WEER = [
    { naam: 'vrieskou', t: [-3, 1], wind: [5, 15], nat: false, regen: 0 },
    { naam: 'koude ochtend', t: [2, 6], wind: [10, 25], nat: false, regen: 0 },
    { naam: 'herfstregen', t: [7, 11], wind: [15, 30], nat: true, regen: 2 },
    { naam: 'nat wegdek', t: [8, 12], wind: [5, 15], nat: true, regen: 0 },
    { naam: 'regen op komst', t: [10, 14], wind: [10, 20], nat: false, regen: 1.5 },
    { naam: 'harde wind', t: [9, 15], wind: [32, 45], nat: false, regen: 0 },
    { naam: 'fris voorjaar', t: [11, 15], wind: [10, 20], nat: false, regen: 0 },
    { naam: 'lekker weer', t: [16, 20], wind: [5, 15], nat: false, regen: 0 },
    { naam: 'zomer', t: [22, 27], wind: [5, 12], nat: false, regen: 0 },
    { naam: 'hitte', t: [29, 33], wind: [3, 10], nat: false, regen: 0 }
  ];
  const tussen = ([a, b]) => Math.round(a + Math.random() * (b - a));
  const plaatsen = schud(PLAATSEN);
  schud(WEER).forEach((w, i) => {
    const temp = tussen(w.t), wind = tussen(w.wind);
    const uren = Array.from({ length: 6 }, (_, u) => ({ temp: temp + Math.round(u * (temp < 15 ? 0.7 : 0.4)), wind: wind + (u % 2), regen: u >= 1 && u <= 2 ? w.regen / 2 : 0 }));
    const weer = { temp, laagste: temp, wind, nat: w.nat, regenStraks: w.regen > 0, uren };
    const fiets = kies(FIETSEN), gewicht = kies([62, 68, 72, 75, 78, 82, 86, 92]), kouType = kies(['normaal', 'normaal', 'koud', 'warm']);
    const profiel = { plaats: { naam: plaatsen[i] }, gewicht, kouType, fietsen: [fiets] };
    const b = ochtendTekst(profiel, weer, 0, kies([1.5, 2, 3, 4]));
    vb.push({ soort: `Ochtendbericht: ${w.naam} (${fiets.naam.toLowerCase()} ${fiets.breedte} mm, ${gewicht} kg${kouType !== 'normaal' ? ', snel ' + kouType : ''})`, ...b, url: '/app#rijden' });
  });
  const dag = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10), op = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const leeg = { analyse: false, schema: false, coaching: false };
  const TOCHTEN = schud(['Amstel Gold Race Toerversie', 'Limburgs Mooiste', 'Tour du ALS', 'Fietselfstedentocht', 'Ronde van Vlaanderen Cyclo', 'Luik-Bastenaken-Luik Challenge', 'La Marmotte', "L'Étape du Tour", 'Mont Ventoux', 'Maratona dles Dolomites', 'Mallorca 312', 'Paris-Roubaix Challenge', 'Ötztaler Radmarathon', 'Les Trois Ballons', "Alpe d'HuZes", 'Unbound Gravel', 'The Traka', 'Dreiländergiro', 'Veenendaal-Veenendaal', 'Gravel One Fifty']);
  for (const [soort, d, info] of [
    ['Doel: sneller, na 3 weken', { doel: 'sneller', op: op(22) }, leeg],
    ['Doel: sneller, na de analyse', { doel: 'sneller', op: op(50) }, { ...leeg, analyse: true }],
    ['Doel: tocht, 4 weken ervoor', { doel: 'evenement', naam: TOCHTEN[0], datum: dag(26), op: op(5) }, leeg],
    ['Doel: tocht, 3 weken ervoor', { doel: 'evenement', naam: TOCHTEN[1], datum: dag(19), op: op(5) }, leeg],
    ['Doel: tocht, 2 weken ervoor', { doel: 'evenement', naam: TOCHTEN[2], datum: dag(12), op: op(5) }, leeg],
    ['Doel: tocht, 4 weken ervoor (coaching)', { doel: 'evenement', naam: TOCHTEN[3], datum: dag(24), op: op(5) }, { ...leeg, coaching: true }],
    ['Doel: tocht, week ervoor', { doel: 'evenement', naam: TOCHTEN[4], datum: dag(6), op: op(5) }, leeg],
    ['Doel: tocht, week ervoor', { doel: 'evenement', naam: TOCHTEN[5], datum: dag(4), op: op(5) }, leeg],
    ['Doel: tocht, dag ervoor', { doel: 'evenement', naam: TOCHTEN[6], datum: dag(1), op: op(5) }, leeg],
    ['Doel: tocht, dag ervoor', { doel: 'evenement', naam: TOCHTEN[7], datum: dag(1), op: op(5) }, leeg],
    ['Doel: tocht, erna', { doel: 'evenement', naam: TOCHTEN[8], datum: dag(-3), op: op(40) }, leeg],
    ['Doel: tocht, erna', { doel: 'evenement', naam: TOCHTEN[9], datum: dag(-2), op: op(40) }, leeg],
    ['Doel: afvallen', { doel: 'afvallen', op: op(8) }, leeg],
    ['Doel: fit, groepsrit', { doel: 'fit', op: op(12) }, leeg],
    ['Doel: fit, winterplan', { doel: 'fit', op: op(35) }, leeg]
  ]) { const s = volgendeStap(d, info); if (s) vb.push({ soort, title: s.titel, body: s.tekst, url: s.link }); }
  vb.push({ soort: 'Coach open', title: 'Vanaf nu: 3 gratis vragen per week', body: 'Je eigen coach staat open. Vraag over training, voeding, banden of herstel, met Michels kennis uit 9 jaar prof.', url: '/app#coach' });
  return res.status(200).json({ ok: true, log, voorbeelden: vb });
}

// ---- Aankondiging "3 gratis vragen" (11-10-2026) ----
// Alleen Michel. GET = proef: wie zou hem krijgen. POST { t, verstuur: true } =
// melding in de app (+ push) en een mail via Resend naar iedereen met een gratis
// account die de app de laatste 120 dagen opende. Leden en coaching niet.
// Eén keer per persoon (app:aankondig:gratisvragen).
async function routeAankondig(req, res) {
  const body = req.method === 'POST' ? await leesBody(req) : {};
  const ik = leesAppToken(String(req.method === 'POST' ? body.t : req.query?.t || ''));
  if (!ik || !BEHEER.includes(ik)) return res.status(403).json({ ok: false });
  const nlDag = (t) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const r = await redis(['SUNION', ...Array.from({ length: 120 }, (_, i) => `stat:${nlDag(Date.now() - i * 86400000)}:actief`)]);
  const al = await redis(['SMEMBERS', 'app:aankondig:gratisvragen']); const gehad = new Set((al.ok && al.result) || []);
  const lijst = [];
  for (const email of ((r.ok && r.result) || []).filter((e) => !BEHEER.includes(e) && !gehad.has(e))) {
    const [lidm, mc] = await Promise.all([haalLid(email), mcLid(email)]);
    const b = lidBeeld(lidm);
    if (b.open || b.coaching || b.bron === 'coaching') continue;
    lijst.push({ email, naam: ((mc && mc.merge_fields && mc.merge_fields.FNAME) || '').split(' ')[0], mail: !!mc && mc.status === 'subscribed' });
  }
  if (!(req.method === 'POST' && body.verstuur)) return res.status(200).json({ ok: true, proef: true, aantal: lijst.length, mail: lijst.filter((x) => x.mail).length, lijst: lijst.map((x) => x.email) });
  let gemaild = 0;
  for (const p of lijst) {
    await appMelding(p.email, { soort: 'coach', titel: 'Vanaf nu: 3 gratis vragen per week', tekst: 'Je eigen coach staat open. Vraag over training, voeding, banden of herstel, met Michels kennis uit 9 jaar prof.', link: '/app#coach' });
    if (p.mail && RESEND_KEY) {
      const link = `${APP_URL}?t=${maakAppToken(p.email)}#coach`;
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px">
        <p>Hoi${p.naam ? ' ' + p.naam.replace(/[<>&"]/g, '') : ''},</p>
        <p>Goed nieuws: je eigen coach in de MKC-app staat open. Vanaf nu stel je elke week 3 vragen gratis.</p>
        <p>Waarover maakt niet uit. Twijfel je over je bandenspanning voor de kasseien van zondag, wil je weten wat je eet op een rit van vier uur, of waarom je benen leeg voelen na een rustige week? Vraag het gewoon. De coach is getraind op mijn kennis uit 9 jaar profwielrennen en mijn ervaring als coach, en kent je fietsen en je analyse als je die hebt.</p>
        <p>Je 3 vragen gelden voor de coach en de bandencoach samen. Elke maandag krijg je er weer 3 bij.</p>
        <p style="margin:22px 0 26px"><a href="${link}" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">Stel je eerste vraag</a></p>
        <p>Sportieve groet,<br>Michel</p>
        <p style="color:#555;font-size:14px">P.S. Vrijdag 16 oktober gaat de MKC-app helemaal open. Als lid vraag je dan zoveel je wilt.</p>
        <p style="color:#888;font-size:12px">Je krijgt deze mail omdat je een account hebt in de MKC-app.</p></div>`;
      try {
        const m = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Michel Kreder <michel@michelkredercoaching.nl>', to: p.email, reply_to: 'info@michelkredercoaching.nl', subject: 'Vanaf nu: 3 gratis vragen per week aan je coach', html }), signal: AbortSignal.timeout(10000) });
        if (m.ok) gemaild++;
      } catch {}
    }
    await redis(['SADD', 'app:aankondig:gratisvragen', p.email]);
  }
  return res.status(200).json({ ok: true, verstuurd: lijst.length, gemaild });
}

// ---- Doelen (11-10-2026), zie lib/doelen.js ----
//   POST doel { t, doel, naam?, datum? }  -> bewaren
//   GET  doelronde (Vercel Cron)           -> per persoon de melding die aan de beurt is
async function haalDoel(email) { const r = await redis(['GET', `app:doel:${email}`]); return leesDoel(r.ok && r.result); }
async function routeDoel(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false });
  const oud = await haalDoel(email);
  const n = nieuwDoel(body, oud);
  if (n.fout) return res.status(400).json({ ok: false, fout: n.fout });
  await redis(['SET', `app:doel:${email}`, JSON.stringify(n.doel)]);
  await redis(['SADD', 'app:doel:alle', email]);
  await redis(['HINCRBY', 'app:doel:tel', n.doel.doel, 1]);
  if (n.doel.doel === 'afvallen') await zetInteresse(email, 'afval');
  return res.status(200).json({ ok: true, doel: n.doel });
}
async function routeDoelRonde(req, res) {
  const cron = process.env.CRON_SECRET || '';
  const auth = String(req.headers?.authorization || '');
  const proef = !(cron && auth === `Bearer ${cron}`);
  if (proef) { const ik = leesAppToken(String(req.query?.t || '')); if (!ik || !BEHEER.includes(ik)) return res.status(401).json({ ok: false }); }
  const r = await redis(['SMEMBERS', 'app:doel:alle']);
  const uit = [];
  for (const email of (r.ok && r.result) || []) {
    const d = await haalDoel(email); if (!d || d.klaar) continue;
    const [lid, lidm, schemaDossier] = await Promise.all([mcLid(email), haalLid(email), haalSchema(email)]);
    const info = { analyse: heeftTag(lid, 'power-profile-koper'), schema: !!(schemaDossier && schemaDossier.huidig), coaching: !!(lidm && lidm.coaching) };
    const st = volgendeStap(d, info); if (!st) continue;
    uit.push({ email, stap: st.id });
    if (proef) continue;
    await appMelding(email, { soort: 'doel', titel: st.titel, tekst: st.tekst, link: st.link });
    d.gestuurd = [...(d.gestuurd || []), st.id]; if (st.klaar) { d.klaar = true; if (d.doel === 'evenement') await telOp(email, 'finishes'); }
    await redis(['SET', `app:doel:${email}`, JSON.stringify(d)]);
  }
  return res.status(200).json({ ok: true, proef, verstuurd: uit });
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

// ---- Verlopen reeks-tags weghalen (12-10-2026), zie lib/reeks.js ----------------
async function routeReeksen(req, res) {
  const cron = process.env.CRON_SECRET;
  if (!cron || String(req.headers?.authorization || '') !== `Bearer ${cron}`) return res.status(401).json({ ok: false });
  return res.status(200).json(await ruimReeksenOp());
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
// "Ik rijd mee": anonieme teller per toestel, geen namen (09-10-2026).
async function routeGroepsritMee(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!(await vrijGrens(req))) return res.status(429).json({ ok: false });
  const body = await leesBody(req);
  const id = String(body.id || ''), k = String(body.k || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
  if (!GR_ID.test(id) || !k) return res.status(400).json({ ok: false });
  const r = await redis(['GET', `groepsrit:${id}`]); if (!r.ok || !r.result) return res.status(404).json({ ok: false });
  const rit = JSON.parse(r.result);
  await redis([body.mee === false ? 'SREM' : 'SADD', `groepsrit:${id}:mee`, k]);
  await redis(['EXPIRE', `groepsrit:${id}:mee`, Math.max(3600, Math.ceil((rit.start - Date.now()) / 1000) + 3 * 86400)]);
  const n = await redis(['SCARD', `groepsrit:${id}:mee`]);
  if (body.mee !== false && rit.maker && n.ok) { const m = await redis(['HGET', `app:teller:${rit.maker}`, 'groepMeeMax']); if ((Number(n.result) || 0) > (Number(m.result) || 0)) await redis(['HSET', `app:teller:${rit.maker}`, 'groepMeeMax', String(n.result)]); }
  return res.status(200).json({ ok: true, mee: n.ok ? Number(n.result) || 0 : 0 });
}
// De pagina van een groepsrit, met een eigen voorbeeld in WhatsApp (naam, dag,
// weer). Zelfde app, alleen de kop krijgt Open Graph-tags.
let APP_HTML = null;
async function routeRitPagina(req, res) {
  const id = String(req.query?.id || '');
  if (APP_HTML === null) { try { APP_HTML = fs.readFileSync(path.join(process.cwd(), 'app.html'), 'utf8'); } catch { APP_HTML = ''; } }
  if (!APP_HTML) { res.setHeader('Location', '/app'); return res.status(302).end(); }
  let titel = 'Groepsrit in de MKC-app', tekst = 'Bekijk het weer, de wind en je eigen bandenspanning voor deze rit.';
  if (GR_ID.test(id)) {
    try {
      const r = await redis(['GET', `groepsrit:${id}`]);
      if (r.ok && r.result) {
        const rit = JSON.parse(r.result);
        const dag = new Date(rit.start).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' });
        const tijd = new Date(rit.start).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
        titel = `${rit.naam} · ${dag} ${tijd}`;
        let weer = '';
        try { const u = await grWeer(rit); if (u && u.length) { const tl = u.map((x) => x.temp); weer = `${Math.min(...tl)} tot ${Math.max(...tl)} graden, wind tot ${Math.max(...u.map((x) => x.wind))} km/u. `; } } catch {}
        tekst = `Vanuit ${rit.plaats.naam || 'de start'}, ${rit.duur} uur. ${weer}Tik voor je windadvies en je eigen bandenspanning.`;
      }
    } catch {}
  }
  const e = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const og = `<meta property="og:title" content="${e(titel)}"><meta property="og:description" content="${e(tekst)}"><meta property="og:image" content="https://rapport.michelkredercoaching.nl/mkc-app-product.png"><meta property="og:type" content="website"><meta property="og:url" content="https://rapport.michelkredercoaching.nl/rit/${e(id)}"><meta name="twitter:card" content="summary_large_image">`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  return res.status(200).send(APP_HTML.replace('</head>', og + '</head>'));
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
    await telOp(email, 'groepsritten');
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
  const mee = await redis(['SCARD', `groepsrit:${id}:mee`]);
  const ikMee = kijker ? await redis(['SISMEMBER', `groepsrit:${id}:mee`, kijker]) : { ok: false };
  let uren = null;
  try { uren = await grWeer(rit); } catch (e) {}
  const ik = leesAppToken(String(req.query?.t || ''));
  return res.status(200).json({ ok: true, rit: { id: rit.id, naam: rit.naam, door: rit.door, start: rit.start, duur: rit.duur, tempo: rit.tempo, plaats: rit.plaats, eigen: !!ik && ik === rit.maker },
    uren, kijkers: n.ok ? Number(n.result) || 0 : 0, mee: mee.ok ? Number(mee.result) || 0 : 0, ikMee: !!(ikMee.ok && ikMee.result === 1) });
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
    if (actie === 'startbonus') return await routeStartBonus(req, res);
    if (actie === 'doelenoverzicht') return await routeDoelenOverzicht(req, res);
    if (actie === 'badgeoverzicht') return await routeBadgeOverzicht(req, res);
    if (actie === 'ranglijst') return await routeRanglijst(req, res);
    if (actie === 'rangprofiel') return await routeRangProfiel(req, res);
    if (actie === 'rangbeheer') return await routeRangBeheer(req, res);
    if (actie === 'schemabeheer') return await routeSchemaBeheer(req, res);
    if (actie === 'coreoverzicht') return await routeCoreOverzicht(req, res);
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
    if (actie === 'reeksen') return await routeReeksen(req, res);
    if (actie === 'review') return await routeReview(req, res);
    if (actie === 'gastaccount') return await routeGastAccount(req, res);
    if (actie === 'aitegoed') return await routeAiTegoed(req, res);
    if (actie === 'nuttig') return await routeNuttig(req, res);
    if (actie === 'interesse') return await routeInteresse(req, res);
    if (actie === 'groepsritmee') return await routeGroepsritMee(req, res);
    if (actie === 'ritpagina') return await routeRitPagina(req, res);
    if (actie === 'doel') return await routeDoel(req, res);
    if (actie === 'aankondig') return await routeAankondig(req, res);
    if (actie === 'pushopnieuw') return await routePushOpnieuw(req, res);
    if (actie === 'doelronde') return await routeDoelRonde(req, res);
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

// Ledenprijzen (besluit Michel 11-10-2026): analyse en pacingplan €19 i.p.v. €29, Afvalprogramma €20 korting.
const LEDEN_ANALYSE = 19;
async function routeOverzicht(req, res) {
  const email = leesAppToken(String(req.query?.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Je inloglink is verlopen. Vraag hieronder een nieuwe aan.' });
  meldActief(email);
  const [core, lid, lidmaatschap, kanLid, bandenProfiel, ritten, schemaDossier, meldingen, coachBerichten] = await Promise.all([coreVoorEmail(email), mcLid(email), haalLid(email), lidOpen(), haalBandenProfiel(email), haalRitten(email), haalSchema(email), haalMeldingen(email), haalCoachBerichten(email)]);
  const reviewNu = await reviewOpen(email);
  const [ia, ip, doel] = await Promise.all([redis(['SISMEMBER', 'app:interesse:afval', email]), redis(['SISMEMBER', 'app:interesse:pacing', email]), haalDoel(email)]);
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
  // Ledenprijs Strava-analyse (11-10-2026): leden (maand, jaar of via schema)
  // betalen €19 i.p.v. €29, via een persoonlijk kortingstoken voor de funnel.
  const lb = lidBeeld(lidmaatschap);
  // Maten (13-10-2026): door wie ben je uitgenodigd, en hoeveel maten maakten via jou een account.
  const [uitg, vacc, uitn] = await Promise.all([redis(['GET', `lid:uitgenodigd:${email}`]), redis(['GET', `lid:vriendaccounts:${email}`]), redis(['GET', `lid:uitnodigingen:${email}`])]);
  let uitnodigingen = []; try { uitnodigingen = ((uitn.ok && uitn.result && JSON.parse(uitn.result)) || []).slice(0, 30); } catch (e) {}
  let uitgenodigd = null; try { const u = uitg.ok && uitg.result ? JSON.parse(uitg.result) : null; if (u && !(lidmaatschap && lidmaatschap.betaaldOoit)) uitgenodigd = { naam: u.naam || '' }; } catch (e) {}
  const ledenAnalyse = lb.open && lb.bron !== 'coaching' && !lb.coaching ? (() => { const t = maakKortingToken(LEDEN_ANALYSE, 30); return t ? `https://rapport.michelkredercoaching.nl/?korting=${t}` : null; })() : null;
  const palmares = await badgesBijwerken(email, { core, ritten, coachBerichten, doel, lidmaatschap, analyse }).catch((e) => { console.error('badges', email, e && e.message); return { badges: [], medailles: 0, beloningen: [], nieuweBadges: [], nieuweBeloningen: [] }; });
  const badgeKorting = await redis(['GET', `app:badgekorting:${email}`]);
  return res.status(200).json({ doel, ledenAnalyse, badges: palmares.badges, medailles: palmares.medailles, goud: palmares.goud, maand: palmares.maand, maandCollectie: palmares.maandCollectie, ranglijstOpen: palmares.ranglijstOpen, appReeks: palmares.appReeks, beloningen: palmares.beloningen, nieuweBadges: palmares.nieuweBadges, nieuweBeloningen: palmares.nieuweBeloningen, badgeKorting: Number(badgeKorting.ok && badgeKorting.result) || 0, review: reviewNu ? REVIEW_LINK : null, interesse: { afval: !!(ia.ok && ia.result === 1), pacing: !!(ip.ok && ip.result === 1) }, 
    ok: true,
    email,
    beheer: BEHEER.includes(email),
    lid: lidBeeld(lidmaatschap),
    uitgenodigd,
    uitnodigingen,
    vriendAccounts: Number(vacc.ok && vacc.result) || 0,
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
// "Je eerste week" afgerond (12-10-2026): één extra gratis coachvraag deze week,
// één keer per account. De server checkt wat hij kan zien: doel en eerste vraag.
async function routeStartBonus(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false });
  const [doel, berichten] = await Promise.all([haalDoel(email), haalCoachBerichten(email)]);
  const gesteld = (berichten || []).some((b) => b.van === 'ik' || b.van === 'klant');
  if (!doel || !gesteld) return res.status(400).json({ ok: false, fout: 'Rond eerst alle stappen af.' });
  const eerste = await redis(['SET', `app:startbonus:${email}`, '1', 'NX']);
  if (!eerste.ok || eerste.result !== 'OK') return res.status(200).json({ ok: true, al: true, gratisOver: await gratisOver(email) });
  const k = `app:gratisvragen:${email}:${weekSleutel()}`;
  await redis(['INCRBY', k, '-1']); await redis(['EXPIRE', k, String(8 * 86400)]);
  await tel(email, 'startbonus');
  return res.status(200).json({ ok: true, gratisOver: await gratisOver(email) });
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
      redis(['INCRBY', `app:ai:${m}:out`, String(u.output_tokens || 0)]),
      redis(['INCRBY', 'app:ai:totaal:in', String(inn)]),
      redis(['INCRBY', 'app:ai:totaal:out', String(u.output_tokens || 0)])
    ]);
    await tegoedCheck();
  } catch {}
}
// Anthropic-tegoed (09-10-2026): Michel vult in Beheer in wat er op zijn
// Anthropic-account staat (in dollars, zoals de console het toont). Daarna
// telt de app het geschatte verbruik eraf, en onder $10 krijgt hij een mail.
const AI_PRIJS_IN = 5, AI_PRIJS_UIT = 25; // dollar per miljoen tokens (Opus)
async function tegoedStand() {
  const [t, i, o] = await Promise.all([redis(['GET', 'app:ai:tegoed']), redis(['GET', 'app:ai:totaal:in']), redis(['GET', 'app:ai:totaal:out'])]);
  let tg = null; try { tg = t.ok && t.result ? JSON.parse(t.result) : null; } catch {}
  const tin = Number((i.ok && i.result) || 0), tout = Number((o.ok && o.result) || 0);
  if (!tg) return { tg: null, tin, tout };
  const verbruikt = ((tin - tg.basisIn) * AI_PRIJS_IN + (tout - tg.basisUit) * AI_PRIJS_UIT) / 1e6;
  return { tg, tin, tout, resterend: Math.round((tg.dollar - verbruikt) * 100) / 100, verbruikt: Math.round(verbruikt * 100) / 100 };
}
async function tegoedCheck() {
  const s = await tegoedStand();
  if (!s.tg || s.tg.gewaarschuwd || s.resterend > 10 || !RESEND_KEY) return;
  s.tg.gewaarschuwd = new Date().toISOString();
  await redis(['SET', 'app:ai:tegoed', JSON.stringify(s.tg)]);
  try {
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'MKC-app <michel@michelkredercoaching.nl>', to: 'michel.kredercoaching@gmail.com', subject: `Anthropic-tegoed bijna op (nog ± ${s.resterend} dollar)`,
        html: `<p style="font-family:Arial,sans-serif">Het geschatte tegoed op je Anthropic-account is nog ongeveer ${s.resterend} dollar. Waardeer het op via console.anthropic.com (Billing), en vul daarna het nieuwe bedrag in bij Beheer in de app. Is het tegoed op, dan geeft de coach in de app geen antwoorden meer.</p>` }) });
  } catch {}
}
async function routeAiTegoed(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const ik = leesAppToken(String(body.t || ''));
  if (!ik || !BEHEER.includes(ik)) return res.status(403).json({ ok: false });
  const dollar = Number(String(body.dollar || '').replace(',', '.'));
  if (!(dollar >= 0 && dollar < 100000)) return res.status(400).json({ ok: false, fout: 'Vul een bedrag in.' });
  const s = await tegoedStand();
  await redis(['SET', 'app:ai:tegoed', JSON.stringify({ dollar, basisIn: s.tin, basisUit: s.tout, op: new Date().toISOString(), gewaarschuwd: null })]);
  return res.status(200).json({ ok: true, ai: await aiGebruik() });
}
async function aiGebruik() {
  const m = new Date().toISOString().slice(0, 7);
  const [v, i, o] = await Promise.all(['vragen', 'in', 'out'].map((x) => redis(['GET', `app:ai:${m}:${x}`])));
  const n = (r) => Number((r.ok && r.result) || 0);
  const tin = n(i), tout = n(o);
  // Schatting met Opus-prijzen (~$5 in, ~$25 uit per miljoen tokens), omgerekend naar euro.
  const euro = Math.round(((tin * 5 + tout * 25) / 1e6) * 0.92 * 100) / 100;
  const tg = await tegoedStand();
  return { maand: m, vragen: n(v), tokensIn: tin, tokensUit: tout, euro, tegoed: tg.tg ? { resterend: tg.resterend, op: tg.tg.op.slice(0, 10), was: tg.tg.dollar } : null };
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
  return { gewicht: gewicht >= 40 && gewicht <= 150 ? gewicht : null, plaats, fietsen, kouType, kouGekozen: !!p.kouGekozen || kouType !== "normaal" };
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
  ].join(' ') + await voorbeeldenTekst('bandvraag', vraag);
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
    const aid = await bewaarAntwoord({ email, bron: 'bandvraag', vraag, antwoord: tekst });
    return res.status(200).json({ ok: true, antwoord: tekst, aid, gratisOver: recht.lid ? null : await telGratis(email) });
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
  const [core, lid, banden, schemaDossier, lidm, doel] = await Promise.all([coreVoorEmail(email), mcLid(email), haalBandenProfiel(email), haalSchema(email), haalLid(email), haalDoel(email)]);
  const mf = (lid && lid.merge_fields) || {};
  const regels = [];
  if (doelContext(doel)) regels.push(doelContext(doel));
  if (lidm && lidm.coaching) regels.push(`BELANGRIJK: deze renner zit in persoonlijke coaching bij Michel (${lidm.coaching === 'premium' ? 'Premium' : 'Flexibel'}). Michel maakt zijn trainingsplan zelf, persoonlijk in TrainingPeaks. Pas dat plan nooit aan en schuif geen trainingen: bij vragen over zijn plan, zijn trainingen of zijn opbouw zeg je vriendelijk dat hij dat even met Michel kortsluit, via TrainingPeaks of de mail, omdat Michel zijn plan zo heeft opgebouwd. Algemene vragen over voeding, herstel, materiaal, kleding, banden en techniek beantwoord je gewoon. Raad hem nooit een Strava-analyse, een trainingsschema of een pacingplan aan: dat regelt Michel binnen zijn coaching.`);
  const sb = schemaDossier && schemaDossier.huidig && schemaDossier.huidig.plan ? schemaBeeld(schemaDossier.huidig) : null;
  if (sb) regels.push(schemaContext(sb));
  else if (!(lidm && lidm.coaching)) regels.push('Deze renner heeft geen trainingsschema en geen persoonlijke coaching.');
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
  const tekst = String(body.tekst || '').trim().slice(0, 1000);
  if (tekst.length < 3) return res.status(400).json({ ok: false, fout: 'Typ je vraag.' });
  const datum = new Date().toISOString().slice(0, 10);
  const n = await redis(['INCR', `app:coachvraag:${email}:${datum}`]);
  await telOp(email, 'coach');
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
          system: `${COACH_KENNIS}\n\nOVER DEZE RENNER\n${context}\n\nREGELS\n${COACH_REGELS}${await voorbeeldenTekst('mkc-coach', tekst)}`,
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
  const aid = antwoord && !medisch ? await bewaarAntwoord({ email, bron: 'mkc-coach', vraag: tekst, antwoord }) : null;
  const nieuw = berichten.concat(
    { van: 'ik', tekst, op: nu },
    { van: 'coach', tekst: antwoord || COACH_STORING, op: new Date().toISOString(), medisch, storing: !antwoord, ...(aid ? { aid } : {}) }
  ).slice(-60);
  await redis(['SET', `app:coach:${email}`, JSON.stringify(nieuw)]);
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
    if (!rit.oordeel && !rit.oordeelKleding) await telOp(email, 'beoordeeld');
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
    if (!ritten.some((x) => String(x.op).slice(0, 10) === dag)) {
      // Eerste rit van de dag: tellen voor de badges, met het weer dat de server zelf ophaalt.
      await telOp(email, 'ritten');
      if (amsUur(rit.op) < 7) await telOp(email, 'vroeg');
      try {
        const pr = await haalBandenProfiel(email);
        const w = pr && pr.plaats && pr.plaats.lat != null ? await haalWeer(pr.plaats.lat, pr.plaats.lon) : null;
        if (w) { rit.serverWeer = { temp: w.temp, nat: !!w.nat }; if (w.temp < 5) await telOp(email, 'winter'); if (w.nat) await telOp(email, 'regen'); }
      } catch (e) {}
    }
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
// Redis: app:antwoorden (lijst, nieuwste eerst, max 200), app:correcties (JSON, max 150),
//        app:nagekeken (set met id's die klaar zijn: goedgekeurd of gecorrigeerd)
// ===========================================================================
const MAX_VOORBEELDEN = 8;
async function bewaarAntwoord({ email, bron, vraag, antwoord }) {
  try {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    bewaarAntwoord.laatste = id;
    await redis(['LPUSH', 'app:antwoorden', JSON.stringify({ id, email, bron, vraag: String(vraag).slice(0, 600), antwoord: String(antwoord).slice(0, 1500), op: new Date().toISOString() })]);
    await redis(['LTRIM', 'app:antwoorden', '0', '199']);
    return id;
  } catch { return null; }
}
async function haalCorrecties() {
  const r = await redis(['GET', 'app:correcties']);
  try { const l = JSON.parse((r.ok && r.result) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
// Tekstblok voor de systeemprompt (11-10-2026): de correcties die het meest op
// de nieuwe vraag lijken (gedeelde woorden), aangevuld met de nieuwste. Zo blijft
// een oude correctie over kasseien bruikbaar, ook als er 40 nieuwere zijn.
const STOPWOORDEN = new Set('de het een en van ik je jij mijn wat hoe is in op met voor te dat die als bij of maar ook om niet nog wel naar zijn kan moet wil heb ben er dan dit al was wordt zou zo'.split(' '));
const woorden = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPWOORDEN.has(w)));
async function voorbeeldenTekst(bron, vraag) {
  const alle = (await haalCorrecties()).filter((c) => !bron || c.bron === bron || bron === 'mkc-coach');
  const vw = woorden(vraag);
  const score = (c) => { let n = 0; for (const w of woorden(c.vraag)) if (vw.has(w)) n++; return n; };
  const passend = vw.size ? alle.map((c, i) => ({ c, s: score(c), i })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c) : [];
  const l = [...new Set([...passend.slice(0, 5), ...alle])].slice(0, MAX_VOORBEELDEN);
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
    if (body.goed) { await redis(['SADD', 'app:nagekeken', id]); }
    else {
    const tekst = String(body.correctie || '').trim().slice(0, 1200);
    const a = antwoorden.find((x) => x.id === id);
    correcties = correcties.filter((c) => c.id !== id);
    if (tekst && a) correcties.unshift({ id, bron: a.bron, vraag: a.vraag, origineel: a.antwoord, correctie: tekst, op: new Date().toISOString() });
    correcties = correcties.slice(0, 150);
    await redis(['SET', 'app:correcties', JSON.stringify(correcties)]);
    if (a) await redis(['SADD', 'app:nagekeken', id]);
    }
  }
  const perId = Object.fromEntries(correcties.map((c) => [c.id, c.correctie]));
  const nh = await redis(['HGETALL', 'app:nuttig']); const nut = {}; const na = (nh.ok && nh.result) || [];
  if (Array.isArray(na)) for (let x = 0; x < na.length; x += 2) nut[na[x]] = na[x + 1]; else Object.assign(nut, na);
  // Alleen wat nog niet is nagekeken; "niet nuttig" bovenaan.
  const nk = await redis(['SMEMBERS', 'app:nagekeken']); const klaar = new Set((nk.ok && nk.result) || []);
  const open = antwoorden.filter((a) => !klaar.has(a.id)).map((a) => ({ ...a, correctie: perId[a.id] || '', nuttig: nut[a.id] || '' }));
  open.sort((a, b) => (b.nuttig === 'nee') - (a.nuttig === 'nee'));
  return res.status(200).json({ ok: true, antwoorden: open, aantalCorrecties: correcties.length, nagekeken: klaar.size });
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
function pushBeeld(p) { return p && p.sub ? { aan: true, tijd: p.tijd, dagen: p.dagen, ochtend: p.ochtend !== false, core: p.core !== false, doel: p.doel !== false, tip: p.tip !== false } : { aan: false, tijd: '07:00', dagen: [1, 2, 3, 4, 5, 6, 0], ochtend: true, core: true, doel: true, tip: true }; }
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
  const doel = typeof body.doel === 'boolean' ? body.doel : oud.doel !== false;
  const tip = typeof body.tip === 'boolean' ? body.tip : oud.tip !== false;
  const p = { sub, tijd, dagen, ochtend, core, doel, tip, laatste: oud.laatste || null, laatsteTip: oud.laatsteTip || null, sinds: oud.sinds || new Date().toISOString() };
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
  return ochtendTekst(profiel, weer, kledingBijstel(ritten));
}
function ochtendTekst(profiel, weer, bijstel = 0, duurUur = 2) {
  const rit = weerTijdensRit(weer, 0.5, duurUur);
  const kl = kledingAdvies({ temp: rit.temp, start: rit.start, wind: rit.wind, regen: rit.regen, nat: !!weer.nat, kouType: profiel.kouType || 'normaal', bijstel, duurUur });
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
    body: ochtendBody(banden, kledingKort(kl), kl && kl.tips[0]),
    url: '/app'
  };
}

// Pushtekst: nooit midden in een woord afkappen; de tip valt weg als het te lang wordt.
function ochtendBody(banden, kort, tip) {
  const kleren = /^vandaag liever binnen/i.test(kort || '') ? kort.charAt(0).toUpperCase() + kort.slice(1) + '.' : `Trek aan: ${kort}.`;
  let t = `${banden}${kleren}`;
  if (tip && (t + ' ' + tip).length <= 230) t += ' ' + tip;
  if (t.length > 230) { t = t.slice(0, 229); t = t.slice(0, Math.max(t.lastIndexOf(','), t.lastIndexOf(' '))) + '...'; }
  return t;
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

// Tip van Michel als pushbericht (12-10-2026): dezelfde tip als in de app,
// afgestemd op doel, Core en schema. Nooit midden in een woord afkappen.
async function tipBericht(email) {
  const [doel, core, sch] = await Promise.all([haalDoel(email), coreVoorEmail(email).catch(() => null), haalSchema(email).catch(() => null)]);
  const t = tipVoor({ doel: doel && !doel.klaar ? doel.doel : null, core: !!core, schema: !!(sch && sch.huidig), datum: new Date() });
  if (!t) return null;
  let body = t.k + ' ' + t.t;
  if (body.length > 230) { body = body.slice(0, 229); body = body.slice(0, body.lastIndexOf(' ')) + '...'; }
  return { title: 'Tip van Michel', body, url: '/app' };
}
const TIP_TIJD = 7 * 60 + 30;   // rond half acht, Nederlandse tijd

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
    const slim = await magSlim(email);
    // Geen ochtendbericht (gratis, of zelf uitgezet)? Dan de Tip van Michel, één keer per dag rond half acht.
    if (!(slim && p.ochtend !== false)) {
      if (p.tip === false || p.laatsteTip === nu.datum || nu.minuten < TIP_TIJD || nu.minuten - TIP_TIJD > 90) { overgeslagen++; continue; }
      const tb = await tipBericht(email).catch(() => null);
      if (!tb) { overgeslagen++; continue; }
      const rt = await stuurPush(p.sub, tb);
      if (rt.weg) { await redis(['DEL', `app:push:${email}`]); await redis(['SREM', 'app:push:alle', email]); weg++; continue; }
      if (rt.ok) { p.laatsteTip = nu.datum; await redis(['SET', `app:push:${email}`, JSON.stringify(p)]); await logPush(email, tb); verstuurd++; }
      continue;
    }
    // Aan de beurt: juiste dag, tijd net voorbij (binnen een uur), vandaag nog niet gehad.
    if (!p.dagen.includes(nu.dag) || nu.minuten < doel || nu.minuten - doel > 60 || p.laatste === nu.datum) { overgeslagen++; continue; }
    const bericht = await ochtendBericht(email).catch(() => null);
    if (!bericht) { overgeslagen++; continue; }
    const r = await stuurPush(p.sub, bericht);
    if (r.weg) { await redis(['DEL', `app:push:${email}`]); await redis(['SREM', 'app:push:alle', email]); weg++; continue; }
    if (r.ok) { p.laatste = nu.datum; await redis(['SET', `app:push:${email}`, JSON.stringify(p)]); await logPush(email, bericht); await telOp(email, 'ochtend'); verstuurd++; }
  }
  return res.status(200).json({ ok: true, verstuurd, overgeslagen, weg });
}
