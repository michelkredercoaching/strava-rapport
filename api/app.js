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
import { lidBeeld, haalLid, lidOpen } from './lid.js';
import { COACH_KENNIS, COACH_REGELS } from '../lib/coach-kennis.js';
import { meldMedisch } from '../lib/meld-medisch.js';

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
  const antwoord = { ok: true, bericht: 'Als dit adres bij ons bekend is, staat er binnen een minuut een mail met je inlogcode.' };

  // Rem: één inlogmail per adres per minuut.
  const rem = await redis(['SET', `app:login:${email}`, '1', 'NX', 'EX', '60']);
  if (rem.ok && rem.result !== 'OK') return res.status(200).json(antwoord);

  const [core, lid] = await Promise.all([coreVoorEmail(email), mcLid(email)]);
  const bekend = !!core || (lid && lid.status && lid.status !== 'archived');
  if (bekend) {
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
  const [core, lid, lidmaatschap, kanLid, bandenProfiel, ritten] = await Promise.all([coreVoorEmail(email), mcLid(email), haalLid(email), lidOpen(), haalBandenProfiel(email), haalRitten(email)]);
  const mf = (lid && lid.merge_fields) || {};
  const analyse = heeftTag(lid, 'power-profile-koper') ? {
    datum: mf.RAPDAT || '', ftp: mf.FTP || '', meet: mf.MEETMETH || '', type: mf.RENTYPE || '',
    omslag: mf.OMSLAG || '', advies: mf.ADVSCHEMA || ''
  } : null;
  return res.status(200).json({
    ok: true,
    email,
    beheer: BEHEER.includes(email),
    lid: lidBeeld(lidmaatschap),
    lidOpen: kanLid,
    naam: (core && core.naam) || mf.FNAME || '',
    core,
    analyse,
    banden: heeftTag(lid, 'bandenspanning-pdf'),
    // Slimme bandenspanning: leden (en Michel) krijgen hun bewaarde fietsen mee.
    bandenSlim: BEHEER.includes(email) || !!lidBeeld(lidmaatschap).open,
    bandenProfiel: (BEHEER.includes(email) || lidBeeld(lidmaatschap).open) ? (bandenProfiel || schoonProfiel({})) : null,
    bandenRitten: (BEHEER.includes(email) || lidBeeld(lidmaatschap).open) ? ritten : [],
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
  return res.status(200).json({ ok: true, t: maakAppToken(email) });
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
  return { gewicht: gewicht >= 40 && gewicht <= 150 ? gewicht : null, plaats, fietsen };
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
async function routeWeer(req, res) {
  const email = await slimEmail(req, res, req.query?.t); if (!email) return;
  const lat = Math.round(Number(req.query?.lat) * 100) / 100, lon = Math.round(Number(req.query?.lon) * 100) / 100;
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ ok: false, fout: 'Geen geldige plek.' });
  const sleutel = `${lat},${lon}`, c = weerCache.get(sleutel);
  if (c && Date.now() - c.op < 15 * 60 * 1000) return res.status(200).json({ ok: true, weer: c.weer });
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&hourly=precipitation,temperature_2m&past_hours=3&forecast_hours=4&timezone=Europe%2FAmsterdam&wind_speed_unit=kmh`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('weer ' + r.status);
    const j = await r.json();
    const nu = j.current || {}, uur = j.hourly || {};
    const tijden = uur.time || [], regen = uur.precipitation || [], temps = uur.temperature_2m || [];
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
      code: nu.weather_code ?? null
    };
    weerCache.set(sleutel, { op: Date.now(), weer });
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
  const email = await slimEmail(req, res, body.t); if (!email) return;
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
    'Toon: warm, direct, korte zinnen, geen gedachtestreepjes. Spreek de renner aan met je. Nederlands, maximaal 90 woorden, geen begroeting of ondertekening. Geef altijd concrete getallen voor en achter als de vraag om een spanning gaat.',
    'Gaat de vraag niet over banden, bandenspanning, materiaal of rijden in bepaald weer, zeg dan vriendelijk dat deze knop alleen over banden gaat.',
    'Beloof nooit dat Michel persoonlijk iets doet.'
  ].join(' ');
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
    const tekst = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    if (!tekst) throw new Error('leeg');
    return res.status(200).json({ ok: true, antwoord: tekst });
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
  const [core, lid, banden] = await Promise.all([coreVoorEmail(email), mcLid(email), haalBandenProfiel(email)]);
  const mf = (lid && lid.merge_fields) || {};
  const regels = [];
  const naam = (core && core.naam) || mf.FNAME || '';
  if (naam) regels.push(`Naam: ${String(naam).split(' ')[0]}.`);
  if (core) {
    if (core.intakeNodig) regels.push('Core-app: gestart, intake nog niet gedaan.');
    else regels.push(`Core-app: blok ${core.blok || 1}, week ${core.weekInBlok || core.week} van 12, fase ${core.fase || '?'}, ${core.gedaan || 0} van ${core.frequentie || '?'} sessies deze week gedaan, ${core.afgerond || 0} weken afgerond.${core.startScore ? ` Rompscore start ${core.startScore}` : ''}${core.rompscore ? `, laatste ${core.rompscore}` : ''}.`);
  } else regels.push('Core-app: niet gestart.');
  if ((lid && (lid.tags || []).some((t) => t.name === 'power-profile-koper'))) {
    regels.push(`Strava-analyse (${mf.RAPDAT || 'datum onbekend'}): ${mf.MEETMETH === 'hartslag' ? `omslagpunt ${mf.OMSLAG || '?'} bpm` : `FTP ${mf.FTP || '?'} W`}, renner-type ${mf.RENTYPE || '?'}, geadviseerd schema ${mf.ADVSCHEMA || '?'}.`);
  } else regels.push('Strava-analyse: niet gedaan.');
  if (banden && banden.fietsen && banden.fietsen.length) {
    regels.push(`Gewicht: ${banden.gewicht || '?'} kg. Fietsen: ${banden.fietsen.map((f) => `${f.naam} (${f.type === 'gravel' ? 'gravel' : 'racefiets'}, ${f.breedte} mm, ${f.tubeless ? 'tubeless' : 'binnenband'}${f.hookless ? ', hookless' : ''})`).join('; ')}.`);
  }
  return regels.join('\n');
}

async function routeCoach(req, res) {
  if (req.method !== 'POST') {
    const email = await slimEmail(req, res, req.query?.t); if (!email) return;
    return res.status(200).json({ ok: true, berichten: (await haalCoachBerichten(email)).slice(-30) });
  }
  const body = await leesBody(req);
  const email = await slimEmail(req, res, body.t); if (!email) return;
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
          system: `${COACH_KENNIS}\n\nOVER DEZE RENNER\n${context}\n\nREGELS\n${COACH_REGELS}`,
          messages: [...eerder, { role: 'user', content: tekst }]
        }),
        signal: AbortSignal.timeout(40000)
      });
      if (!r.ok) console.error('coach Claude', r.status, await r.text());
      else {
        const j = await r.json();
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
  if (medisch) {
    const [core, mc] = await Promise.all([coreVoorEmail(email), mcLid(email)]);
    await meldMedisch({ email, naam: (core && core.naam) || (mc && mc.merge_fields && mc.merge_fields.FNAME) || '', bron: 'mkc-coach', vraag: tekst,
      extra: core ? `Doet de Core-app: blok ${core.blok || 1}, week ${core.weekInBlok || core.week}.` : 'Doet de Core-app niet.' });
  }
  return res.status(200).json({ ok: true, berichten: nieuw.slice(-30) });
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
  const email = await slimEmail(req, res, body.t); if (!email) return;
  let ritten = await haalRitten(email);
  const num = (x, min, max) => { const n = Math.round(Number(x) * 10) / 10; return isFinite(n) && n >= min && n <= max ? n : null; };
  if (body.id && body.oordeel) {
    if (!['zacht', 'goed', 'hard'].includes(body.oordeel)) return res.status(400).json({ ok: false });
    const rit = ritten.find((x) => x.id === String(body.id));
    if (!rit) return res.status(404).json({ ok: false, fout: 'Rit niet gevonden.' });
    rit.oordeel = body.oordeel; rit.oordeelOp = new Date().toISOString();
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
      oordeel: null
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
