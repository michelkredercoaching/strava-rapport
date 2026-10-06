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

const SECRET      = process.env.PP_TOKEN_SECRET || '';
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const MC_KEY      = process.env.MAILCHIMP_API_KEY || '';
const MC_LIST     = process.env.MAILCHIMP_LIST_ID || '';
const APP_URL     = process.env.APP_URL || 'https://rapport.michelkredercoaching.nl/app';
const AFZENDER    = 'Michel Kreder <michel@michelkredercoaching.nl>';
const GELDIG_DAGEN = 180;

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
async function stuurInlogmail(email, naam, link) {
  if (!RESEND_KEY) { console.error('Geen RESEND_API_KEY'); return false; }
  const voornaam = String(naam || '').trim().split(' ')[0];
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px">
    <p>${voornaam ? 'Hoi ' + esc(voornaam) : 'Hoi'},</p>
    <p>Hier is je inloglink voor de MKC-app. Met één tik ben je binnen, je hoeft geen wachtwoord te onthouden.</p>
    <p style="margin:26px 0"><a href="${esc(link)}" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">Open mijn app</a></p>
    <p>Zet de app daarna op je beginscherm, dan hoef je deze mail niet meer te zoeken.</p>
    <p style="color:#777;font-size:13px">Heb je dit niet aangevraagd? Dan kun je deze mail negeren, er gebeurt verder niets.</p>
    <p>Sportieve groet,<br>Michel</p></div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AFZENDER, to: email, subject: 'Je inloglink voor de MKC-app', html }),
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
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const actie = String(req.query?.actie || '');
  try {
    if (actie === 'login') return await routeLogin(req, res);
    if (actie === 'overzicht') return await routeOverzicht(req, res);
    if (actie === 'vancore') return await routeVanCore(req, res);
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
  const antwoord = { ok: true, bericht: 'Als dit adres bij ons bekend is, staat er binnen een minuut een inloglink in je mail.' };

  // Rem: één inlogmail per adres per minuut.
  const rem = await redis(['SET', `app:login:${email}`, '1', 'NX', 'EX', '60']);
  if (rem.ok && rem.result !== 'OK') return res.status(200).json(antwoord);

  const [core, lid] = await Promise.all([coreVoorEmail(email), mcLid(email)]);
  const bekend = !!core || (lid && lid.status && lid.status !== 'archived');
  if (bekend) {
    const naam = (core && core.naam) || (lid && lid.merge_fields && lid.merge_fields.FNAME) || '';
    await stuurInlogmail(email, naam, `${APP_URL}?t=${maakAppToken(email)}`);
  }
  return res.status(200).json(antwoord);
}

async function routeOverzicht(req, res) {
  const email = leesAppToken(String(req.query?.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Je inloglink is verlopen. Vraag hieronder een nieuwe aan.' });
  const [core, lid] = await Promise.all([coreVoorEmail(email), mcLid(email)]);
  const mf = (lid && lid.merge_fields) || {};
  const analyse = heeftTag(lid, 'power-profile-koper') ? {
    datum: mf.RAPDAT || '', ftp: mf.FTP || '', meet: mf.MEETMETH || '', type: mf.RENTYPE || '',
    omslag: mf.OMSLAG || '', advies: mf.ADVSCHEMA || ''
  } : null;
  return res.status(200).json({
    ok: true,
    email,
    naam: (core && core.naam) || mf.FNAME || '',
    core,
    analyse,
    banden: heeftTag(lid, 'bandenspanning-pdf'),
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
