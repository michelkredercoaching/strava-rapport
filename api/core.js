// /api/core.js
// Alle routes van het Core-programma voor wielrenners in ÉÉN bestand. Zelfde
// opbouw als api/afvalprogramma.js (token in de link, dossier in Upstash, mails
// via Resend, conceptantwoord dat altijd langs Michel gaat). Routeren via ?actie=
//
//   POST ?actie=nieuw      Woo-webhook: bestelling betaald -> token + welkomstmail.
//                          Ook vanuit het coachscherm (interne sleutel, bron
//                          'begeleiding'): gratis toegang voor begeleidingsklanten.
//                          Had dit mailadres al een proefweek, dan gaat datzelfde
//                          dossier open en blijft alle voortgang staan.
//   GET  ?actie=plan       persoonlijke pagina haalt alles op (token in de url)
//   POST ?actie=intake     intake invullen -> plan op maat
//   POST ?actie=doel       doel instellen of wissen (naam + datum)
//   POST ?actie=afvink     sessie afgerond
//   POST ?actie=weekklaar  week afsluiten met "hoe reageerde je lichaam" -> volgende week
//   POST ?actie=test       romptest opslaan
//   POST ?actie=meter      rugklachtenmeter opslaan
//   POST ?actie=doorgaan   interesse in een vervolg na week 12 (meten, nog niets verkopen)
//   POST ?actie=vraag      vraag -> direct antwoord van de AI-assistent (medisch: vast veilig antwoord)
//   POST ?actie=groenlicht deelnemer met rode vlag bevestigt groen licht van huisarts/fysio
//   POST ?actie=frequentie 2, 3 of 4 sessies per week wijzigen (geldt meteen)
//   GET  ?actie=manifest   persoonlijk app-manifest: het beginscherm-icoon opent de eigen pagina
//   GET  ?actie=agenda     .ics met de sessies (2, 3 of 4 per week) op vaste dagen, met de link erin
//   GET  ?actie=rij        intern: deelnemers voor het coachscherm (beveiligd)
//   POST ?actie=antwoord   intern: goedgekeurd antwoord versturen (beveiligd)
//   POST ?actie=herinner   maandagmail, via Vercel Cron (beveiligd)
//   POST ?actie=verwijder  intern: deelnemer wissen (beveiligd)
//
// Proefweek: maakProef() hieronder wordt aangeroepen vanuit
// api/keuzehulp-inschrijving.js (route 'core-gratis'). Een proefdeelnemer krijgt
// intake, starttest en week 1. Vanaf week 2 staat alles op slot tot hij betaalt.
//
// Gebruikt dezelfde env-variabelen als het Afvalprogramma, er hoeft niets bij:
//   PP_TOKEN_SECRET, UPSTASH_REDIS_REST_URL/TOKEN, RESEND_API_KEY,
//   ANTHROPIC_API_KEY, AFVAL_INTERN_SLEUTEL (ook voor dit coachscherm),
//   WOO_WEBHOOK_SECRET, CRON_SECRET.

import crypto from 'node:crypto';
import { leesDoel } from '../lib/doelen.js';
import {
  maakPlan, sessie, heeftRodeVlag, KLACHTEN, OEFENINGEN, TESTS, rompscore, balans,
  volgendeWeek, testNodig, meterNodig, verdiendeBadges, BADGES,
  WEEKTIPS, besteStart, FASES, WEKEN as WEEKTABEL, letters, nodigVoorWeek, frequentie, startniveau,
  weekRij, blokVan, BLOK_WEKEN, BLOKTIPS, disbalansUit, weekInBlok,
  DISCIPLINES, disciplineVan, doelModus, MODUS_UITLEG, FASE_UITLEG, FIETSTIPS, extraSessie,
  BEPERKINGEN, vervangerKeuze
} from '../lib/core.js';
import { meldMedisch } from '../lib/meld-medisch.js';
import { COACH_TOON } from '../lib/coach-kennis.js';
import { appMelding } from '../lib/app-melding.js';
import { tel } from '../lib/stat.js';
// Kringverwijzing met lid.js (die gebruikt zetLidmaatschap van hier). Mag, want
// beide gebruiken elkaars functies pas binnen een aanvraag, niet bij het laden.
import { lidOpen, haalLid as haalLidmaatschap, haalSchema, LANCERING } from './lid.js';
// Voorverkoop (14-10-2026): nieuwe leden kunnen al betalen, de Core-app opent pas bij de lancering.
const CORE_BEHEER = ['michel.kredercoaching@gmail.com', 'michel.kreder@gmail.com'];
const coreNogDicht = (d) => Date.now() < LANCERING && d.bron === 'lid' && !CORE_BEHEER.includes(String(d.email || '').toLowerCase());
import { meld as meldActief } from '../lib/app-opruimen.js';
import { reviewMoment } from '../lib/review.js';

const SECRET      = process.env.PP_TOKEN_SECRET || '';
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const CLAUDE_KEY  = process.env.ANTHROPIC_API_KEY || '';
const INTERN      = process.env.AFVAL_INTERN_SLEUTEL || '';
const WOO_SECRET  = process.env.WOO_WEBHOOK_SECRET || '';

const AFZENDER    = 'Michel Kreder <michel@michelkredercoaching.nl>';
const INTERN_NAAR = 'michel.kredercoaching@gmail.com';
const PAGINA_URL  = process.env.CORE_PAGINA_URL || 'https://rapport.michelkredercoaching.nl/mijn-core';
const BEWAAR_S    = 60 * 60 * 24 * 400;   // ruim na week 12, ook als iemand later begint
// Waar de betaalknop na de proefweek naartoe gaat: de checkout met product
// 13050 (Core-programma, €49). Overschrijven kan met CORE_KOOP_URL in Vercel.
const KOOP_URL    = process.env.CORE_KOOP_URL || 'https://michelkredercoaching.nl/checkout/?add-to-cart=13050';
const MC_KEY      = process.env.MAILCHIMP_API_KEY || '';
const MC_LIST     = process.env.MAILCHIMP_LIST_ID || '';

// ===========================================================================
// REDIS
// ===========================================================================
//   core:d:<id>      JSON  het dossier
//   core:actief      SET   lopende deelnemers (herinneringen + coachscherm)
//   core:order:<nr>  id    ontdubbelen van de Woo-webhook
//   core:email:<adr> id    één dossier per mailadres (proef -> betaald)
async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });
    if (!r.ok) { console.error('Redis fout:', r.status); return { ok: false }; }
    const j = await r.json();
    return { ok: true, result: j.result };
  } catch (e) { console.error('Redis exception:', e); return { ok: false }; }
}
async function haalDossier(id) {
  const r = await redis(['GET', `core:d:${id}`]);
  if (!r.ok || !r.result) return null;
  try { return JSON.parse(r.result); } catch { return null; }
}
async function bewaarDossier(d) {
  d.gewijzigd = new Date().toISOString();
  // Koppeling mailadres -> dossier even lang laten leven als het dossier zelf
  // (stond vast op 400 dagen na aanmaken; actieve leden raakten hem dan kwijt).
  if (d.email) redis(['EXPIRE', `core:email:${d.email}`, String(BEWAAR_S)]);
  return redis(['SET', `core:d:${d.id}`, JSON.stringify(d), 'EX', String(BEWAAR_S)]);
}

// ===========================================================================
// TOKEN — "core|<id>|<vervalt>|<handtekening>" in base64url
// ===========================================================================
function handtekening(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
}
export function maakCoreToken(id, dagenGeldig = 400) {
  if (!SECRET) return null;
  const exp = Date.now() + dagenGeldig * 24 * 3600 * 1000;
  const payload = `core|${id}|${exp}`;
  return Buffer.from(`${payload}|${handtekening(payload)}`).toString('base64url');
}
export function leesCoreToken(token) {
  if (!SECRET || !token || typeof token !== 'string' || token.length > 240) return null;
  let tekst;
  try { tekst = Buffer.from(token, 'base64url').toString('utf8'); } catch { return null; }
  const delen = tekst.split('|');
  if (delen.length !== 4 || delen[0] !== 'core') return null;
  const [, id, expStr, sig] = delen;
  const goed = handtekening(`core|${id}|${expStr}`);
  const a = Buffer.from(String(sig)), b = Buffer.from(goed);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!/^\d+$/.test(expStr) || Date.now() > Number(expStr)) return null;
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  return id;
}
const linkVoor = (id) => `${PAGINA_URL}?t=${maakCoreToken(id)}`;

// Mailchimp-tag zetten (fail-safe). Zo weet de journey dat iemand zijn
// proefweek af heeft.
async function mcTag(email, tag) {
  if (!MC_KEY || !MC_LIST) return;
  try {
    const dc = MC_KEY.split('-')[1];
    const hash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
    await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${MC_LIST}/members/${hash}/tags`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [{ name: tag, status: 'active' }] }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) { console.error('Mailchimp-tag mislukt (genegeerd):', e); }
}

function nieuwDossier({ email, naam, order, betaald, bron }) {
  return {
    id: crypto.randomBytes(8).toString('hex'), email, naam: String(naam || '').slice(0, 80), order: order || null,
    besteldOp: nu(), betaald: !!betaald, proefSinds: betaald ? null : nu(), status: 'wacht-op-intake',
    bron: bron || (betaald ? 'aankoop' : 'proef'),
    intake: null, doel: null,
    week: 1, afgerond: 0, teller: 1, verlicht: false, slechterOpRij: 0,
    sessies: [], reacties: [], tests: [], meters: [], berichten: [], doorgaan: null
  };
}
async function dossierVoorEmail(email) {
  const r = await redis(['GET', `core:email:${email}`]);
  return r.ok && r.result ? haalDossier(r.result) : null;
}
async function bewaarNieuw(d) {
  await bewaarDossier(d);
  await redis(['SADD', 'core:actief', d.id]);
  await redis(['SET', `core:email:${d.email}`, d.id, 'EX', String(BEWAAR_S)]);
}
// Dossiers zonder betaald-veld komen uit de webhook: die zijn betaald.
// Sinds het lidmaatschap van de MKC-app (07-10-2026) kan toegang ook tot een
// datum lopen: d.lidTot (ISO). Wie eerder eenmalig betaalde heeft geen lidTot
// en houdt dus gewoon toegang.
const isBetaald = (d) => d.betaald !== false && (!d.lidTot || Date.now() < Date.parse(d.lidTot));
// Na week 12 doorgaan met blok 2 en verder: leden (lidTot) en begeleidingsklanten.
// Wie eenmalig betaalde, sluit na week 12 af met de vraag of hij als lid door wil.
const nogGeldig = (iso) => !!iso && Date.now() < Date.parse(iso);
const magDoorlopen = (d) => nogGeldig(d.lidTot) || nogGeldig(d.doorloopTot) || d.bron === 'begeleiding';
// Op slot: proefweek voorbij zonder betaling, of na week 12 zonder lidmaatschap.
const opSlotNu = (d) => (!isBetaald(d) && d.week >= 2) || (d.week > BLOK_WEKEN && !magDoorlopen(d));

// Proefweek starten, of de bestaande link teruggeven. Aangeroepen vanuit
// api/keuzehulp-inschrijving.js. Mailt zelf niets, dat doet die route.
export async function maakProef({ email, naam }) {
  email = String(email || '').trim().toLowerCase();
  const bestaand = await dossierVoorEmail(email);
  if (bestaand) return { id: bestaand.id, link: linkVoor(bestaand.id), nieuw: false, betaald: isBetaald(bestaand) };
  const d = nieuwDossier({ email, naam, betaald: false });
  await bewaarNieuw(d);
  return { id: d.id, link: linkVoor(d.id), nieuw: true, betaald: false };
}

// ===========================================================================
// MAIL
// ===========================================================================
async function mail({ naar, onderwerp, html, antwoordNaar }) {
  if (!RESEND_KEY) { console.error('Geen RESEND_API_KEY'); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AFZENDER, to: [naar], subject: onderwerp, html,
        ...(antwoordNaar ? { reply_to: antwoordNaar } : {}) })
    });
    if (!r.ok) console.error('Resend fout:', r.status, await r.text());
    return r.ok;
  } catch (e) { console.error('Resend exception:', e); return false; }
}

// ===========================================================================
// CLAUDE — de coach-assistent. Het programma draait zonder Michel: vragen
// worden direct beantwoord. Medische vragen krijgen NOOIT een AI-advies maar
// altijd het vaste antwoord hieronder.
// ===========================================================================
const MEDISCH_ANTWOORD = 'Dit is een vraag die ik niet op afstand ga beantwoorden, want daar is je lijf te belangrijk voor. Stop met de oefening die pijn doet en sla hem voorlopig over. Laat het checken door je huisarts of fysiotherapeut, zeker als de pijn uitstraalt, je tintelingen voelt of als het erger wordt. Gaat het daarna weer goed, dan pak je de oefening op in de lichtste variant.';
const STORING_ANTWOORD = 'Het lukte me even niet om je vraag te beantwoorden. Probeer het over een paar minuten opnieuw. Voel je pijn bij een oefening? Sla die oefening dan over tot het weer goed voelt.';
const MAX_VRAGEN_PER_DAG = 5;
// Vangnet vóór Claude: bij deze woorden geen AI-antwoord, meteen het vaste
// medische antwoord. Liever een keer te voorzichtig dan een keer te los.
const MEDISCH_WOORDEN = /(uit\s*stra+l|stra+l\w*\s+(het\s+)?(uit|door)|tintel|doof|gevoelloos|hernia|ischias|operatie|geopereerd|zwanger|scherpe pijn|stekende pijn|bloed|'s nachts pijn|nachtelijke pijn|verlamd|krachtverlies|incontinent|koorts|gebroken|breuk)/i;

async function assistentAntwoord(vraag, d) {
  if (!CLAUDE_KEY) return null;
  const s = d.intake ? sessie(d.week, 'A', planIntake(d)) : null;
  const laatsteTest = (d.tests || []).slice(-1)[0];
  const context = [
    `Deelnemer: ${d.naam || 'onbekend'}`,
    d.intake && d.intake.kracht && d.intake.kracht !== 'nee' ? `Doet ook krachttraining in de sportschool, ${d.intake.kracht} per week.` : '',
    (() => { const db = planIntake(d).disbalans; return db ? 'Disbalans uit de laatste romptest: ' + Object.entries(db).map(([k, x]) => `${k} ${x.pct}% zwakker ${x.kant.toLowerCase()} (die kant gaat eerst en werkt ${x.extra} s langer)`).join(', ') + '.' : ''; })(),
    `Niveau ${d.week} (fase ${FASES[weekRij(d.week).fase] || ''}), ${d.afgerond} niveaus afgerond.${d.bijstel > 0 ? ' Vorige sessie voelde te licht, nu iets zwaarder.' : d.bijstel < 0 ? ' Vorige sessie voelde te zwaar, nu iets lichter.' : ''}`,
    d.intake ? `Klachten: ${(d.intake.klachten || []).join(', ') || 'geen'}. Ervaring: ${d.intake.ervaring}. Leeftijd: ${({ onder40: 'jonger dan 40', '40-55': '40 tot 55', '55plus': '55 of ouder' })[d.intake.leeftijd] || 'onbekend'}. ${frequentie(d.intake)}x per week. Startniveau uit de starttest: ${startniveau(planIntake(d))}.` : 'Intake nog niet gedaan.',
    s ? `Oefeningen deze week: ${letters(d.intake).map((l, i) => { const x = sessie(d.week, l, planIntake(d)); return 'sessie ' + (i + 1) + ': ' + x.oefeningen.map((o) => `${o.naam} (${o.cue})`).join('; '); }).join(' | ')}.` : '',
    s ? `Werk/rust deze week: ${s.werk}s/${s.rust}s, ${s.rondes} rondes.` : '',
    (d.reacties || []).length ? `Laatste reacties: ${(d.reacties || []).slice(-3).map((x) => `niveau ${x.week} ${x.reactie}`).join(', ')}.` : '',
    (d.berichten || []).length ? `Eerdere vragen: ${(d.berichten || []).filter((b) => b.van === 'klant').slice(-3).map((b) => b.tekst.slice(0, 120)).join(' / ')}` : '',
    laatsteTest ? `Laatste romptest: Rompscore ${laatsteTest.score}.` : '',
    d.doel ? `Doel: ${d.doel.naam} op ${d.doel.datum}.` : ''
  ].filter(Boolean).join('\n');

  const systeem = [
    'Je bent de coach-assistent van het Core-programma van Michel Kreder, wielercoach en oud-profrenner. Je antwoord gaat direct naar de deelnemer, er kijkt niemand meer naar.',
    'De Core-app beweegt mee: romp- en heupoefeningen zonder gewichten voor wielrenners, 2, 3 of 4 sessies per week (de deelnemer kiest en kan wisselen), in niveaus zonder einde. Een niveau is rond bij 2 van de 2, 2 van de 3 of 3 van de 4 sessies; daarna geeft de deelnemer aan hoe het ging. Goed = volgend niveau, te makkelijk = een niveau extra, te zwaar = hetzelfde niveau nog een keer (twee keer op rij te zwaar = een niveau terug), meer klachten = hetzelfde niveau opnieuw met lichtere varianten. Na elke sessie kan de deelnemer aangeven of het te licht of te zwaar was; de volgende sessies passen zich dan aan. Romptest bij de start en daarna elke 4 weken; stijgt de Rompscore flink, dan schuift de app een niveau op. Noem nooit een vast aantal weken of een einde.',
    COACH_TOON,
    'Nederlands, maximaal 120 woorden, geen jargon.',
    'Geef praktische uitleg over uitvoering, makkelijkere of zwaardere varianten, planning naast fietstraining en wat de deelnemer voelt (spierpijn, vermoeidheid). Gebruik de oefeningen uit de context.',
    'Spierpijn of vermoeidheid mag je uitleggen. Maar gaat de vraag over pijn die scherp is, erger wordt of blijft, uitstraling naar een been of arm, tintelingen, een doof gevoel, een hernia, een operatie, zwangerschap, medicijnen of iets anders medisch: geef GEEN advies en antwoord alleen met het woord [MEDISCH].',
    'Gaat de vraag niet over dit programma, training of fietsen, zeg dan vriendelijk dat je alleen vragen over het Core-programma beantwoordt.',
    'Beloof nooit dat Michel persoonlijk iets doet of contact opneemt. Verzin geen getallen die niet in de context staan.'
  ].join(' ');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        // Wordt een vraag door een veiligheidsfilter geweigerd, dan probeert de
        // API zelf een ander model in plaats van niets terug te geven.
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 4000,
        output_config: { effort: 'low' },
        fallbacks: 'default',
        system: systeem,
        messages: [{ role: 'user', content: `${context}\n\nVraag van de deelnemer:\n${vraag}` }]
      })
    });
    if (!r.ok) { console.error('Claude fout:', r.status, await r.text()); return null; }
    const j = await r.json();
    if (j.stop_reason === 'refusal') return { tekst: MEDISCH_ANTWOORD, medisch: true };
    const t = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    if (!t) return null;
    // Medisch: altijd het vaste antwoord, nooit een AI-advies.
    if (t.includes('[MEDISCH]')) return { tekst: MEDISCH_ANTWOORD, medisch: true };
    return { tekst: t, medisch: false };
  } catch (e) { console.error('Claude exception:', e); return null; }
}

// ===========================================================================
// HULPJES
// ===========================================================================
async function leesBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let ruw = '';
  for await (const stuk of req) ruw += stuk;
  try { return JSON.parse(ruw || '{}'); } catch { return {}; }
}
function vergelijkVeilig(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function magIntern(req) {
  if (vergelijkVeilig(req.headers['x-afval-sleutel'], INTERN)) return true;
  const cron = process.env.CRON_SECRET, auth = String(req.headers.authorization || '');
  return !!(cron && auth.startsWith('Bearer ') && vergelijkVeilig(auth.slice(7), cron));
}
// ---- Strava (14-10-2026): een gedane Core-sessie als activiteit op Strava ----
// Eén keer koppelen met schrijfrechten (activity:write), daarna per sessie een knop.
// Tokens per dossier in core:strava:<id>. Zelfde Strava-app als de analyse (zelfde domein).
const stuurDoor = (res, url) => { res.statusCode = 302; res.setHeader('Location', url); res.end(); };
const STRAVA_TERUG = 'https://rapport.michelkredercoaching.nl/api/core?actie=stravaterug';
async function stravaBewaar(id, tk) { await redis(['SET', `core:strava:${id}`, JSON.stringify(tk), 'EX', String(400 * 86400)]); } // vervalt net als het dossier na 400 dagen zonder gebruik
async function stravaToken(id) {
  const r = await redis(['GET', `core:strava:${id}`]); if (!r.ok || !r.result) return null;
  let tk; try { tk = JSON.parse(r.result); } catch { return null; }
  if (tk.exp && tk.exp * 1000 > Date.now() + 120000) return tk.access;
  const v = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: tk.refresh }) });
  const j = await v.json().catch(() => ({}));
  if (!j.access_token) { if (v.status === 400 || v.status === 401) await redis(['DEL', `core:strava:${id}`]); return null; }
  await stravaBewaar(id, { ...tk, access: j.access_token, refresh: j.refresh_token || tk.refresh, exp: j.expires_at });
  return j.access_token;
}
async function routeStravaKoppel(req, res) {
  const t = String(req.query?.t || ''), id = leesCoreToken(t);
  if (!id || !process.env.STRAVA_CLIENT_ID) return stuurDoor(res, '/mijn-core?t=' + encodeURIComponent(t) + '&strava=fout');
  return stuurDoor(res, 'https://www.strava.com/oauth/authorize?' + new URLSearchParams({ client_id: process.env.STRAVA_CLIENT_ID, response_type: 'code', redirect_uri: STRAVA_TERUG, approval_prompt: 'auto', scope: 'activity:write', state: t }).toString());
}
async function routeStravaTerug(req, res) {
  const t = String(req.query?.state || ''), id = leesCoreToken(t), terug = (s) => stuurDoor(res, '/mijn-core?t=' + encodeURIComponent(t) + '&strava=' + s);
  if (!id) return stuurDoor(res, '/app');
  if (req.query?.error || !String(req.query?.scope || '').includes('activity:write')) return terug('geweigerd');
  const v = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, code: String(req.query?.code || ''), grant_type: 'authorization_code' }) });
  const j = await v.json().catch(() => ({}));
  if (!j.access_token) return terug('fout');
  await stravaBewaar(id, { access: j.access_token, refresh: j.refresh_token, exp: j.expires_at, atleet: j.athlete && j.athlete.id, op: nu() });
  return terug('gekoppeld');
}
async function routeStravaPost(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const sessie = [...(d.sessies || [])].reverse().find((s) => s.letter === body.letter);
  if (!sessie) return res.status(400).json({ ok: false, fout: 'Doe eerst je sessie.' });
  const access = await stravaToken(d.id);
  if (!access) return res.status(200).json({ ok: false, koppel: true });
  const dubbel = await redis(['SET', `core:strava:post:${d.id}:${sessie.op}`, '1', 'NX', 'EX', String(90 * 86400)]);
  if (!dubbel.ok || dubbel.result !== 'OK') return res.status(200).json({ ok: true, al: true });
  const schoon = (x, n) => String(x || '').replace(/[<>]/g, '').trim().slice(0, n);
  const sec = Math.max(300, Math.min(5400, Math.round(Number(body.sec) || 900)));
  const oef = Array.isArray(body.oefeningen) ? body.oefeningen.slice(0, 12).map((x) => schoon(x, 50)).filter(Boolean) : [];
  const start = new Date(Date.parse(sessie.op) - sec * 1000);
  const lokaal = new Date(start.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
  const p = (n) => String(n).padStart(2, '0');
  const startLokaal = `${lokaal.getFullYear()}-${p(lokaal.getMonth() + 1)}-${p(lokaal.getDate())}T${p(lokaal.getHours())}:${p(lokaal.getMinutes())}:${p(lokaal.getSeconds())}`;
  const form = new URLSearchParams({ name: schoon('Core: ' + (body.naam || 'sessie'), 90), sport_type: 'Workout', type: 'Workout', start_date_local: startLokaal, elapsed_time: String(sec),
    description: `Core-sessie in de MKC Core-app, niveau ${d.week}.${oef.length ? '\n' + oef.join(', ') : ''}\nrapport.michelkredercoaching.nl/app`, trainer: '1' });
  const a = await fetch('https://www.strava.com/api/v3/activities', { method: 'POST', headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const aj = await a.json().catch(() => ({}));
  if (!a.ok || !aj.id) { await redis(['DEL', `core:strava:post:${d.id}:${sessie.op}`]); if (a.status === 401) { await redis(['DEL', `core:strava:${d.id}`]); return res.status(200).json({ ok: false, koppel: true }); } console.error('strava post', a.status, JSON.stringify(aj).slice(0, 300)); return res.status(502).json({ ok: false, fout: 'Strava gaf een fout. Probeer het zo nog eens.' }); }
  await tel(d.email, 'core-strava').catch(() => {});
  return res.status(200).json({ ok: true, url: 'https://www.strava.com/activities/' + aj.id });
}
async function metToken(req, res) {
  const body = req.method === 'GET' ? {} : await leesBody(req);
  const t = req.method === 'GET' ? (req.query?.t || '').toString() : String(body.t || '');
  const id = leesCoreToken(t);
  if (!id) { res.status(403).json({ ok: false, fout: 'link ongeldig of verlopen' }); return null; }
  const d = await haalDossier(id);
  if (!d) { res.status(404).json({ ok: false, fout: 'niet gevonden' }); return null; }
  return { d, body };
}
// De intake plus de tijdelijke verlichting na een slechte week.
// De intake plus wat het plan verder bijstuurt: lichtere week na 'slechter',
// en de score van de starttest (bepaalt het startniveau).
function planIntake(d) {
  const start = (d.tests || []).find((t) => t.moment === 0);
  const laatste = (d.tests || []).filter((t) => t.uitslag).slice(-1)[0];
  return { ...(d.intake || {}), verlicht: !!d.verlicht, bijstel: d.bijstel || 0, startScore: start ? start.score : null, disbalans: laatste ? disbalansUit(laatste.uitslag) : null,
    discipline: soortVan(d), doelModus: modusVan(d), bevrorenWeek: d.bevroren || null, vervang: d.vervang || {} };
}
// Periodisering (12-10-2026)
function soortVan(d) { const x = d.intake && d.intake.discipline; return DISCIPLINES[x] ? x : (d.doel ? disciplineVan(d.doel.naam) : null); }
function dagenTot(d) { const b = d.doel ? besteStart(d.doel.datum) : null; return b ? b.dagenTotDoel : null; }
function modusVan(d) { return doelModus(dagenTot(d)); }
// Varianten vastzetten vanaf 3 weken voor je doel; daarna weer los.
function periodiseer(d) {
  const m = modusVan(d), voor = d.bevroren || null;
  if (m && m !== 'herstel' && !d.bevroren) d.bevroren = d.week;
  if ((!m || m === 'herstel') && d.bevroren) d.bevroren = null;
  return voor !== (d.bevroren || null);
}
// Na een afgerond niveau: zo opschuiven dat je zwaarste fase net voor je doel valt.
function stemAfOpDoel(d) {
  const W = (() => { const x = dagenTot(d); return x == null ? null : Math.floor(x / 7); })();
  if (W == null || W > 12 || W < 1) return null;
  const doelWib = Math.min(12, Math.max(1, 13 - W)), wib = weekInBlok(d.week), start = d.week - wib;
  if (wib < doelWib) { const nieuw = start + Math.min(doelWib, wib + 2); if (nieuw > d.week) { d.week = nieuw; return 'inhalen'; } }
  else if (wib - doelWib >= 4 && (magDoorlopen(d) || start + 12 + doelWib <= BLOK_WEKEN)) { d.week = start + 12 + doelWib; return 'nieuwblok'; }
  return null;
}
function fmtSessie(s) {
  return { ...s, warmingUp: s.warmingUp.map((id) => ({ id, ...OEFENINGEN[id] })), coolDown: { ...s.coolDown, ...OEFENINGEN[s.coolDown.id] } };
}
const nu = () => new Date().toISOString();

function gedaanDezeWeek(d) {
  return [...new Set((d.sessies || []).filter((s) => s.teller === d.teller).map((s) => s.letter))];
}

// Wat de klant terugkrijgt. Nooit het hele dossier.
function klantBeeld(d) {
  const intake = planIntake(d);
  const geblokkeerd = d.status === 'wacht-op-fysio';
  const week = d.week;
  const modus = intake.doelModus;
  let sessies = d.intake && !geblokkeerd ? letters(d.intake).map((l) => fmtSessie(sessie(week, l, intake))) : [];
  if (d.intake && !geblokkeerd) {
    if (modus === 'rust') sessies = [];
    else if (modus === 'opener') sessies = [fmtSessie(extraSessie('opener', intake))];
    else if (modus === 'herstel') sessies = [fmtSessie(extraSessie('mobiliteit', intake))];
    else if (modus === 'fris1') sessies = sessies.slice(0, 2);
  }
  const gedaan = gedaanDezeWeek(d);
  const tests = (d.tests || []).map((t) => ({ moment: t.moment, score: t.score, uitslag: t.uitslag, balans: balans(t.uitslag) }));
  const vakjes = [];
  // De laatste 12 niveaus tot en met het huidige (geen blokken meer in beeld).
  const blokStart = Math.max(0, week - BLOK_WEKEN);
  for (let w = blokStart + 1; w <= blokStart + BLOK_WEKEN; w++) for (const l of letters(d.intake)) {
    vakjes.push({ week: w, letter: l, gedaan: (d.sessies || []).some((s) => s.week === w && s.letter === l) });
  }
  // Reeks (12-10-2026): kalenderweken op rij waarin je genoeg sessies deed
  // (zoveel als nodig om een niveau af te ronden). Deze week telt mee als hij al rond is.
  const weekIdx = (t) => Math.floor((Date.parse(t) + 3 * 864e5) / (7 * 864e5));
  const perWeek = {}; for (const s of d.sessies || []) { const i = weekIdx(s.op); perWeek[i] = (perWeek[i] || 0) + 1; }
  const nodigW = nodigVoorWeek(d.intake); let reeks = 0, wi = weekIdx(new Date().toISOString());
  if ((perWeek[wi] || 0) >= nodigW) reeks++;
  for (wi = wi - 1; (perWeek[wi] || 0) >= nodigW; wi--) reeks++;
  // Alleen aftellen, geen doeltip (besluit Michel).
  const doel = d.doel ? { ...d.doel, ...(besteStart(d.doel.datum) || {}) } : null;

  return {
    naam: d.naam || '', status: d.status, nogDicht: coreNogDicht(d), opent: LANCERING,
    betaald: isBetaald(d),
    // Proefweek: week 1 mag, vanaf week 2 op slot tot er betaald is.
    opSlot: opSlotNu(d),
    koopUrl: KOOP_URL,
    lidOpen: LID_OPEN,
    zwaarsteDag: d.intake?.zwaarsteDag || null,
    kracht: d.intake ? (d.intake.kracht || null) : null,
    // Disbalans-meter: per paar het verschil bij elke romptest.
    disbalans: intake.disbalans || null,
    disbalansVerloop: ['Zijkant', 'Bil'].map((naam) => ({ naam, punten: tests.map((t) => { const b = (t.balans || []).find((x) => x.naam === naam); return b ? { moment: t.moment, pct: b.pct, zwakker: b.zwakker } : null; }).filter(Boolean) })).filter((x) => x.punten.length),
    intakeNodig: !d.intake, geblokkeerd,
    week, afgerond: d.afgerond, fase: weekRij(week).fase, faseNaam: FASES[weekRij(week).fase],
    blok: blokVan(week), weekInBlok: weekRij(week).weekInBlok, blokStart, niveau: week, bijstel: d.bijstel || 0,
    magDoorlopen: magDoorlopen(d),
    sessies, gedaanDezeWeek: gedaan,
    weekRond: gedaan.length >= nodigVoorWeek(d.intake), nodigVoorWeek: nodigVoorWeek(d.intake),
    frequentie: frequentie(d.intake),
    herhaling: !!d.verlicht,
    klaar: d.status === 'klaar',
    testNodig: d.intake && !geblokkeerd ? testNodig(d.afgerond, (d.tests || []).map((t) => t.moment)) : null,
    meterNodig: d.intake && !geblokkeerd ? meterNodig(d.afgerond, (d.meters || []).map((m) => m.moment)) : null,
    tests, testDefinities: TESTS,
    meters: (d.meters || []).map((m) => ({ moment: m.moment, onderrug: m.onderrug, nek: m.nek })),
    badges: BADGES.map((b) => ({ ...b, verdiend: verdiendeBadges(d.afgerond).some((v) => v.fase === b.fase) })),
    vakjes,
    weektip: (blokVan(week) > 1 && BLOKTIPS[weekRij(week).weekInBlok]) || WEEKTIPS[weekRij(week).weekInBlok], intakeTips: d.intake ? maakPlan(intake).tips || [] : [],
    discipline: intake.discipline, disciplineNaam: intake.discipline ? DISCIPLINES[intake.discipline].naam : null, disciplines: Object.fromEntries(Object.entries(DISCIPLINES).map(([k, v]) => [k, v.naam])),
    doelModus: modus || null, modusUitleg: modus ? MODUS_UITLEG[modus] : null,
    faseUitleg: FASE_UITLEG[weekRij(week).fase], focus: sessies[0] ? sessies[0].focus || null : null,
    fietstip: d.geenFietstips ? null : (FIETSTIPS[modus] || FIETSTIPS[weekRij(week).fase] || null),
    klachten: (d.intake && d.intake.klachten) || [], rugErnst: (d.intake && d.intake.rugErnst) || null, beperkingen: (d.intake && d.intake.beperkingen) || [], beperkingLabels: BEPERKINGEN, mobiliteit: fmtSessie(extraSessie('mobiliteit', intake)),
    doel, reeks, herinner: d.herinner ? { dagen: d.herinner.dagen, tijd: d.herinner.tijd } : null,
    vervolgVraag: d.afgerond >= 9, doorgaan: !!d.doorgaan,
    berichten: (d.berichten || []).map((b) => ({ van: b.van, tekst: b.tekst, op: b.op, medisch: !!b.medisch })),
  };
}

// ---- Voor de app-startpagina (api/app.js, 06-10-2026) ----------------------
// Korte samenvatting van iemands Core-dossier op mailadres. Geeft null als er
// geen dossier is. Alleen wat de startpagina nodig heeft, nooit het dossier.
// Account verwijderen op verzoek (09-10-2026): Core-dossier en koppeling weg.
export async function wisCore(email) {
  email = String(email || '').toLowerCase(); if (!email) return false;
  const r = await redis(['GET', `core:email:${email}`]);
  if (r.ok && r.result) await redis(['DEL', `core:d:${r.result}`]);
  await redis(['DEL', `core:email:${email}`]);
  return true;
}
// Core-voortgang per deelnemer (13-10-2026), voor Michels beheerscherm: o.a.
// om de voortgang van coachingklanten te checken.
export async function coreOverzicht() {
  const ids = await redis(['SMEMBERS', 'core:actief']);
  const nuMs = Date.now(), l = [];
  for (const id of (ids.ok && ids.result) || []) {
    const d = await haalDossier(id); if (!d || !d.email) continue;
    let b = null; try { b = klantBeeld(d); } catch (e) {}
    const s = d.sessies || [], tests = d.tests || [];
    const laatste = s.length ? s[s.length - 1].op : null;
    const pijn = (d.pijn || []).filter((x) => nuMs - Date.parse(x.op) < 28 * 864e5);
    l.push({
      email: d.email, naam: d.naam || '', betaald: isBetaald(d), bron: d.bron || '', intake: !!d.intake,
      niveau: b ? b.week : d.week, fase: b ? b.faseNaam : '', afgerond: d.afgerond || 0,
      sessies: s.length, deze7: s.filter((x) => nuMs - Date.parse(x.op) < 7 * 864e5).length, laatste,
      reeks: b ? b.reeks || 0 : 0, frequentie: b ? b.frequentie : null,
      rompStart: tests[0] ? tests[0].score : null, rompNu: tests.length ? tests[tests.length - 1].score : null, tests: tests.length,
      pijnMax: pijn.length ? Math.max(...pijn.map((x) => x.score || 0)) : null,
      klachten: (d.intake && d.intake.klachten) || [], doel: b && b.doel ? (b.doel.naam || b.doel.doel || '') : ''
    });
  }
  return l.sort((a, b) => String(b.laatste || '').localeCompare(String(a.laatste || '')));
}
// Core-trechter (12-10-2026): waar haken mensen af? Voor Michels beheerscherm.
export async function coreTrechter() {
  const ids = await redis(['SMEMBERS', 'core:actief']);
  const t = { dossiers: 0, intake: 0, sessie1: 0, starttest: 0, niveau2: 0, betaald: 0, actief14: 0, na4weken: 0, gestart4wkGeleden: 0, pijnHoog: 0 };
  const nuMs = Date.now();
  for (const id of (ids.ok && ids.result) || []) {
    const d = await haalDossier(id); if (!d) continue;
    t.dossiers++;
    if (d.intake) t.intake++;
    const s = d.sessies || [];
    if (s.length) t.sessie1++;
    if ((d.tests || []).some((x) => x.moment === 0)) t.starttest++;
    if ((d.afgerond || 0) >= 1) t.niveau2++;
    if (isBetaald(d)) t.betaald++;
    const laatste = s.length ? Date.parse(s[s.length - 1].op) : 0;
    if (laatste && nuMs - laatste < 14 * 864e5) t.actief14++;
    const eerste = s.length ? Date.parse(s[0].op) : 0;
    if (eerste && nuMs - eerste > 28 * 864e5) { t.gestart4wkGeleden++; if (laatste && nuMs - laatste < 14 * 864e5) t.na4weken++; }
    if ((d.pijn || []).some((x) => x.score >= 6 && nuMs - Date.parse(x.op) < 14 * 864e5)) t.pijnHoog++;
  }
  return t;
}
export async function coreVoorEmail(email) {
  if (!email) return null;
  const d = await dossierVoorEmail(String(email).toLowerCase());
  if (!d) return null;
  const b = klantBeeld(d);
  const tests = b.tests || [];
  return {
    link: linkVoor(d.id), naam: b.naam, nogDicht: b.nogDicht,
    betaald: b.betaald, opSlot: b.opSlot, intakeNodig: b.intakeNodig, klaar: b.klaar,
    week: b.week, blok: b.blok, weekInBlok: b.weekInBlok, fase: b.fase, faseNaam: b.faseNaam, magDoorlopen: b.magDoorlopen,
    gedaan: b.gedaanDezeWeek.length, frequentie: b.frequentie, afgerond: b.afgerond,
    reeks: b.reeks || 0,
    sessiesTotaal: (d.sessies || []).length,
    sessiesMaand: (d.sessies || []).filter((x) => String(x.op || '').slice(0, 7) === new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }).slice(0, 7)).length,
    startScore: tests[0] ? tests[0].score : null,
    rompscore: tests.length ? tests[tests.length - 1].score : null,
    kracht: b.kracht, disbalans: b.disbalans, zwaarsteDag: b.zwaarsteDag,
    volgende: (() => { const s = b.sessies.find((x) => !b.gedaanDezeWeek.includes(x.letter)); return s ? { letter: s.letter, naam: s.naam, minuten: s.minuten, oefeningen: s.oefeningen.map((o) => o.id) } : null; })()
  };
}
// Lidmaatschap van de MKC-app (api/lid.js): zet of verleng toegang tot `tot`.
// Bestaat er nog geen dossier, dan wordt het aangemaakt en gaat de welkomstmail
// met de link de deur uit. Wie eerder eenmalig betaalde, houdt die toegang:
// daar zetten we geen einddatum op.
export async function zetLidmaatschap({ email, naam, tot, stil = false }) {
  email = String(email || '').toLowerCase();
  if (!email || !tot) return null;
  let d = await dossierVoorEmail(email);
  let nieuw = false;
  if (!d) {
    d = nieuwDossier({ email, naam, betaald: true, bron: 'lid' });
    d.lidTot = tot; d.lidSinds = nu();
    await bewaarNieuw(d); nieuw = true;
  } else {
    const eenmalig = d.betaald !== false && !d.lidTot && d.bron !== 'proef' && d.bron !== 'lid';
    if (!eenmalig) { d.betaald = true; d.lidTot = tot; if (!d.lidSinds) d.lidSinds = nu(); if (d.bron === 'proef') d.bron = 'lid'; }
    // Eenmalige kopers houden hun 12 weken voor altijd; het lidmaatschap geeft ze
    // daarnaast toegang tot blok 2 en verder, zolang het loopt.
    else d.doorloopTot = tot;
    // Had je de 12 weken al af en word je lid: dan begint blok 2.
    if (d.status === 'klaar') { d.status = 'actief'; d.week = Math.max(d.week, d.afgerond + 1); }
    if (!d.naam && naam) d.naam = String(naam).slice(0, 80);
    await bewaarDossier(d);
  }
  await mcTag(email, 'core-klant');
  if (nieuw && !stil) await mail({ naar: email, onderwerp: 'Je Core-app staat klaar', html: welkomHtml(d, linkVoor(d.id), false), antwoordNaar: INTERN_NAAR });
  return { id: d.id, link: linkVoor(d.id), nieuw };
}

// Mailadres achter een Core-link. Zo kan iemand vanuit de Core-app in één tik
// naar de startpagina, zonder opnieuw in te loggen.
export async function emailVoorCoreToken(token) {
  const id = leesCoreToken(token);
  if (!id) return null;
  const d = await haalDossier(id);
  return d && d.email ? String(d.email).toLowerCase() : null;
}

// ===========================================================================
// ROUTES
// ===========================================================================
// Lidmaatschap open (SEPA-incasso goedgekeurd)? Dan biedt de betaalmuur na de
// proefweek het lidmaatschap aan in plaats van de eenmalige €49. Schakelt
// vanzelf om; lid.js houdt het 10 minuten vast.
let LID_OPEN = false;
export default async function handler(req, res) {
  const actie = (req.query?.actie || '').toString();
  try { LID_OPEN = await lidOpen(); } catch { LID_OPEN = false; }
  try {
    switch (actie) {
      case 'nieuw':     return await routeNieuw(req, res);
      case 'plan':      return await routePlan(req, res);
      case 'intake':    return await routeIntake(req, res);
      case 'doel':      return await routeDoel(req, res);
      case 'herinnering': return await routeHerinnering(req, res);
      case 'pijn':      return await routePijn(req, res);
      case 'klachten':  return await routeKlachten(req, res);
      case 'vervang':   return await routeVervang(req, res);
      case 'discipline': return await routeDiscipline(req, res);
      case 'herinnerdag': return await routeHerinnerDag(req, res);
      case 'afvink':    return await routeAfvink(req, res);
      case 'gevoel':    return await routeGevoel(req, res);
      case 'kracht':    return await routeKracht(req, res);
      case 'weekklaar': return await routeWeekklaar(req, res);
      case 'test':      return await routeTest(req, res);
      case 'meter':     return await routeMeter(req, res);
      case 'doorgaan':  return await routeDoorgaan(req, res);
      case 'vraag':     return await routeVraag(req, res);
      case 'groenlicht': return await routeGroenlicht(req, res);
      case 'frequentie': return await routeFrequentie(req, res);
      case 'manifest':  return routeManifest(req, res);
      case 'agenda':    return await routeAgenda(req, res);
      case 'rij':       return await routeRij(req, res);
      case 'antwoord':  return await routeAntwoord(req, res);
      case 'herinner':  return await routeHerinner(req, res);
      case 'verwijder': return await routeVerwijder(req, res);
      case 'stravakoppel': return await routeStravaKoppel(req, res);
      case 'stravaterug': return await routeStravaTerug(req, res);
      case 'stravapost': return await routeStravaPost(req, res);
      default:          return res.status(400).json({ ok: false, fout: 'onbekende actie' });
    }
  } catch (e) {
    console.error('core fout:', e);
    return res.status(500).json({ ok: false, fout: 'serverfout' });
  }
}

// --- Woo-webhook: bestelling betaald ---------------------------------------
async function routeNieuw(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  // Dicht als het geheim ontbreekt: zonder geldige webhook-sleutel of interne
  // sleutel maakt niemand een (betaald) dossier aan.
  if (!vergelijkVeilig(body.secret, WOO_SECRET) && !magIntern(req)) {
    return res.status(403).json({ ok: false, fout: 'geen geldige sleutel' });
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, fout: 'e-mail' });
  // Begeleidingsklant: alleen via het coachscherm (interne sleutel), nooit via de webhook.
  const begeleiding = body.bron === 'begeleiding' && magIntern(req);

  if (body.order) {
    const bestaat = await redis(['GET', `core:order:${body.order}`]);
    if (bestaat.ok && bestaat.result) return res.status(200).json({ ok: true, herhaling: true, id: bestaat.result, link: linkVoor(bestaat.result) });
  }

  // Had dit mailadres al een proefweek? Dan gaat datzelfde dossier open.
  let d = await dossierVoorEmail(email);
  const upgrade = !!(d && !isBetaald(d));
  if (upgrade) {
    d.betaald = true; d.betaaldOp = nu(); d.order = body.order || d.order;
    if (begeleiding) d.bron = 'begeleiding';
    if (!d.naam && body.naam) d.naam = String(body.naam).slice(0, 80);
    await bewaarDossier(d);
  } else if (d) {
    // Al betaald (bijvoorbeeld een tweede bestelling): niets nieuws aanmaken.
    if (begeleiding && d.bron !== 'begeleiding') { d.bron = 'begeleiding'; await bewaarDossier(d); }
    return res.status(200).json({ ok: true, herhaling: true, id: d.id, link: linkVoor(d.id) });
  } else {
    d = nieuwDossier({ email, naam: body.naam, order: body.order, betaald: true, bron: begeleiding ? 'begeleiding' : 'aankoop' });
    await bewaarNieuw(d);
  }
  // Uit de verkoopmails van de proefweek-journey.
  await mcTag(email, 'core-klant');
  const id = d.id;
  if (body.order) await redis(['SET', `core:order:${body.order}`, id, 'EX', String(BEWAAR_S)]);

  const link = linkVoor(id);
  await mail({ naar: email, onderwerp: upgrade ? 'Je hele Core-app staat open' : begeleiding ? 'De Core-app hoort nu bij je begeleiding' : 'Je Core-app staat klaar',
    html: upgrade ? openHtml(d, link) : welkomHtml(d, link, begeleiding), antwoordNaar: INTERN_NAAR });
  // Zelf toegevoegd vanuit het coachscherm: geen meldingsmail aan jezelf.
  if (begeleiding) return res.status(200).json({ ok: true, id, link, begeleiding: true });
  return res.status(200).json({ ok: true, id, link });
}

// Eén doel (12-10-2026): het doel staat in de MKC-app (app:doel:<email>, lib/doelen.js).
// Core telt af naar een tocht uit de app; een doel dat alleen in Core stond gaat
// eenmalig naar de app.
async function syncDoel(d) {
  if (!d.email) return false;
  const r = await redis(['GET', `app:doel:${d.email}`]);
  const a = leesDoel(r.ok && r.result);
  const oud = JSON.stringify(d.doel || null);
  if (a && !a.klaar) d.doel = a.doel === 'evenement' ? { naam: a.naam, datum: a.datum } : null;
  else if (!a && d.doel) await schrijfAppDoel(d);
  return JSON.stringify(d.doel || null) !== oud;
}
async function schrijfAppDoel(d) {
  if (!d.email) return;
  if (!d.doel) { await redis(['DEL', `app:doel:${d.email}`]); return; }
  const r = await redis(['GET', `app:doel:${d.email}`]);
  const a = leesDoel(r.ok && r.result);
  const zelfde = a && a.doel === 'evenement' && a.datum === d.doel.datum;
  await redis(['SET', `app:doel:${d.email}`, JSON.stringify({ doel: 'evenement', naam: d.doel.naam, datum: d.doel.datum, op: zelfde ? a.op : nu(), gestuurd: zelfde ? (a.gestuurd || []) : [] })]);
  await redis(['SADD', 'app:doel:alle', d.email]);
}
// Pijncheck (12-10-2026): vóór de sessie (bij klachten) of tijdens, met de knop
// "Pijn?". 0-3 gewoon, 4-5 lichter, 6+ alleen mobiliteit en Michel krijgt een
// seintje met de oefening. Drie keer op rij hoger = lichter en ook een seintje.
async function routePijn(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const score = Math.round(Number(body.score));
  if (!(score >= 0 && score <= 10)) return res.status(400).json({ ok: false, fout: 'kies een cijfer van 0 tot 10' });
  const plek = KLACHTEN.includes(body.plek) ? body.plek : null;
  const oefening = String(body.oefening || '').slice(0, 80) || null;
  const waar = body.waar === 'tijdens' ? 'tijdens' : 'voor';
  d.pijn = (d.pijn || []).concat({ score, plek, oefening, waar, niveau: d.week, op: nu() }).slice(-60);
  const advies = score >= 6 ? 'mobiliteit' : score >= 4 ? 'licht' : 'normaal';
  let seintje = false;
  if (score >= 6 && (oefening || waar === 'tijdens' || body.melden)) {
    seintje = true;
    await meldMedisch({ email: d.email, naam: d.naam, bron: 'core-pijn', vraag: `Pijn ${score}/10${plek ? ' (' + plek + ')' : ''}${oefening ? ', bij ' + oefening : ''}${waar === 'tijdens' ? ', tijdens de sessie' : ', vóór de sessie'}.`, coreId: d.id,
      extra: `Core-app niveau ${d.week}. Klachten bij de intake: ${((d.intake && d.intake.klachten) || []).join(', ') || 'geen'}.` });
  }
  const voor = d.pijn.filter((x) => x.waar === 'voor' && (!plek || x.plek === plek)).slice(-3);
  if (voor.length === 3 && voor[0].score < voor[1].score && voor[1].score < voor[2].score && voor[2].score >= 4) {
    d.verlicht = true;
    if (!seintje) await meldMedisch({ email: d.email, naam: d.naam, bron: 'core-pijn', vraag: `Pijn loopt op: ${voor.map((x) => x.score).join(' > ')}${plek ? ' (' + plek + ')' : ''}.`, coreId: d.id, extra: `Core-app niveau ${d.week}. De app zet de sessies lichter.` });
  }
  await bewaarDossier(d);
  const letter = letters(d.intake || {}).includes(body.letter) ? body.letter : null;
  const licht = advies === 'licht' && letter ? fmtSessie(sessie(d.week, letter, { ...planIntake(d), verlicht: true })) : null;
  return res.status(200).json({ ok: true, advies, licht, ...klantBeeld(d) });
}
// Klachten en beperkingen aanpassen na de intake (12-10-2026).
async function routeKlachten(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (!d.intake) return res.status(400).json({ ok: false, fout: 'doe eerst je intake' });
  const klachten = (Array.isArray(body.klachten) ? body.klachten : []).filter((x) => KLACHTEN.includes(x));
  d.intake.klachten = klachten;
  d.intake.rugErnst = klachten.includes('onderrug') ? (['lange-ritten', 'regelmatig', 'rust'].includes(body.rugErnst) ? body.rugErnst : (d.intake.rugErnst || 'lange-ritten')) : null;
  d.intake.beperkingen = (Array.isArray(body.beperkingen) ? body.beperkingen : []).filter((x) => BEPERKINGEN[x]);
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}
// "Kan ik niet": deze oefening voortaan vervangen (of terugzetten).
async function routeVervang(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const id = String(body.id || '');
  if (!OEFENINGEN[id]) return res.status(400).json({ ok: false, fout: 'onbekende oefening' });
  d.vervang = { ...(d.vervang || {}) };
  if (body.terug) delete d.vervang[id];
  else {
    const alt = vervangerKeuze(id, planIntake(d));
    if (!alt) return res.status(400).json({ ok: false, fout: 'Voor deze oefening heb ik nog geen goede vervanger. Sla hem over en laat het Michel weten via de coach.' });
    d.vervang[id] = alt;
  }
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, vervanger: d.vervang[id] ? OEFENINGEN[d.vervang[id]].naam : null, ...klantBeeld(d) });
}
async function routeDiscipline(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (!d.intake) return res.status(400).json({ ok: false, fout: 'doe eerst je intake' });
  d.intake.discipline = DISCIPLINES[body.discipline] ? body.discipline : null;
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}
// D14 (12-10-2026): herinnering via de app op je vaste dagen.
const HDAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
async function routeHerinnering(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (body.uit) d.herinner = null;
  else {
    const dagen = (Array.isArray(body.dagen) ? body.dagen : []).filter((x) => HDAGEN.includes(x));
    const tijd = /^\d{2}:\d{2}$/.test(String(body.tijd || '')) ? body.tijd : '19:00';
    if (!dagen.length) return res.status(400).json({ ok: false, fout: 'kies je dagen' });
    d.herinner = { dagen, tijd, laatste: null };
  }
  await bewaarDossier(d);
  await redis([d.herinner ? 'SADD' : 'SREM', 'core:herinner', d.id]);
  return res.status(200).json({ ok: true, ...klantBeeld(d), pushAan: await pushAanVoor(d.email) });
}
async function pushAanVoor(email) { const p = await redis(['GET', `app:push:${String(email || '').toLowerCase()}`]); try { return !!(p.ok && p.result && JSON.parse(p.result).sub); } catch { return false; } }
// Cron elk half uur: wie vandaag een herinnering wil en het tijdstip is net geweest.
async function routeHerinnerDag(req, res) {
  if (!magIntern(req)) return res.status(403).json({ ok: false });
  const v = Object.fromEntries(new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const dag = String(v.weekday).slice(0, 2).toLowerCase(), minuten = Number(v.hour) * 60 + Number(v.minute), datum = `${v.year}-${v.month}-${v.day}`;
  const morgen = HDAGEN[(HDAGEN.indexOf(dag) + 1) % 7];
  const ids = await redis(['SMEMBERS', 'core:herinner']);
  let verstuurd = 0;
  for (const id of (ids.ok && ids.result) || []) {
    const d = await haalDossier(id);
    if (!d || !d.herinner || d.status !== 'actief' || opSlotNu(d)) continue;
    const [h, m] = d.herinner.tijd.split(':').map(Number), doelMin = h * 60 + m;
    if (!d.herinner.dagen.includes(dag) || minuten < doelMin || minuten - doelMin >= 30 || d.herinner.laatste === datum) continue;
    const b = klantBeeld(d);
    const vandaagGedaan = (d.sessies || []).some((s) => String(s.op).slice(0, 10) === datum);
    const volgende = b.sessies.find((s) => !b.gedaanDezeWeek.includes(s.letter));
    d.herinner.laatste = datum; await bewaarDossier(d);
    if (vandaagGedaan || !volgende) continue;
    const zwaar = d.intake && d.intake.zwaarsteDag;
    await appMelding(d.email, { soort: 'core', titel: 'Tijd voor je core', tekst: `Vandaag: ${volgende.naam}, ${volgende.minuten} minuten.${zwaar === morgen ? ' Morgen je zwaarste rit, dus vandaag kort en rustig.' : zwaar === dag ? ' Na je zware rit van vandaag mag het rustig.' : ''} Tik om te starten.`, link: linkVoor(d.id) + '#vandaag' });
    verstuurd++;
  }
  return res.status(200).json({ ok: true, verstuurd });
}
async function routePlan(req, res) {
  const r = await metToken(req, res); if (!r) return;
  let gewijzigd = await syncDoel(r.d);
  if (periodiseer(r.d)) gewijzigd = true;
  // Fietstips alleen voor wie geen schema of coaching heeft (besluit Michel).
  try {
    const [lidm, sch] = await Promise.all([haalLidmaatschap(r.d.email), haalSchema(r.d.email)]);
    const geen = !!(r.d.bron === 'begeleiding' || (lidm && lidm.coaching) || (sch && sch.huidig));
    if (geen !== !!r.d.geenFietstips) { r.d.geenFietstips = geen; gewijzigd = true; }
  } catch {}
  if (gewijzigd) await bewaarDossier(r.d);
  await tel(r.d.email, 'core-open');
  meldActief(r.d.email);
  redis(['EXPIRE', `core:email:${r.d.email}`, String(BEWAAR_S)]);
  return res.status(200).json({ ok: true, ...klantBeeld(r.d), pushAan: await pushAanVoor(r.d.email) });
}

// --- Intake -------------------------------------------------------------------
async function routeIntake(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const klachten = (Array.isArray(body.klachten) ? body.klachten : []).filter((k) => KLACHTEN.includes(k));
  const intake = {
    klachten,
    rugErnst: klachten.includes('onderrug') && ['lange-ritten', 'regelmatig', 'rust'].includes(body.rugErnst) ? body.rugErnst : null,
    rodeVlag: body.rodeVlag === true,
    ervaring: ['nooit', 'af en toe', 'regelmatig'].includes(body.ervaring) ? body.ervaring : 'af en toe',
    frequentie: [2, 3, 4].includes(Number(body.frequentie)) ? Number(body.frequentie) : 3,
    leeftijd: ['onder40', '40-55', '55plus'].includes(body.leeftijd) ? body.leeftijd : null,
    zwaarsteDag: ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].includes(body.zwaarsteDag) ? body.zwaarsteDag : null,
    kracht: ['nee', '1x', '2x'].includes(body.kracht) ? body.kracht : null,
    discipline: DISCIPLINES[body.discipline] ? body.discipline : null,
    beperkingen: (Array.isArray(body.beperkingen) ? body.beperkingen : []).filter((x) => BEPERKINGEN[x]),
    // Uitdrukkelijke toestemming voor gezondheidsgegevens (AVG art. 9), 09-10-2026.
    toestemming: body.toestemming === true ? { op: nu(), versie: 'privacy-2026-10-09' } : null,
    op: nu()
  };
  d.intake = intake;
  if (body.doelNaam && body.doelDatum && !isNaN(new Date(body.doelDatum))) {
    d.doel = { naam: String(body.doelNaam).slice(0, 60), datum: String(body.doelDatum).slice(0, 10) };
    await schrijfAppDoel(d);
  }
  if (heeftRodeVlag(intake)) {
    d.status = 'wacht-op-fysio';
    await bewaarDossier(d);
    // Geen mail aan Michel: de deelnemer bevestigt zelf groen licht (?actie=groenlicht).
    return res.status(200).json({ ok: true, ...klantBeeld(d) });
  }
  d.status = 'actief';
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// Na een rode vlag: de deelnemer bevestigt zelf dat zijn huisarts of
// fysiotherapeut groen licht gaf. Dat wordt met datum vastgelegd.
async function routeGroenlicht(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (d.status !== 'wacht-op-fysio') return res.status(400).json({ ok: false, fout: 'je programma staat al open' });
  if (body.bevestig !== true) return res.status(400).json({ ok: false, fout: 'vink eerst aan dat je groen licht hebt' });
  d.status = 'actief';
  d.intake.rodeVlag = false;
  d.groenlichtOp = nu();
  // Wie een rode vlag had, begint altijd een niveau lichter.
  d.verlicht = true;
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

async function routeDoel(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (body.wis) d.doel = null;
  else {
    const datum = String(body.datum || '').slice(0, 10);
    if (!body.naam || isNaN(new Date(datum))) return res.status(400).json({ ok: false, fout: 'vul een naam en een datum in' });
    d.doel = { naam: String(body.naam).slice(0, 60), datum };
  }
  await schrijfAppDoel(d);
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Sessie afgerond ------------------------------------------------------------
async function routeAfvink(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (!d.intake || d.status === 'wacht-op-fysio') return res.status(400).json({ ok: false, fout: 'eerst de intake' });
  if (opSlotNu(d)) return res.status(403).json({ ok: false, fout: d.week > BLOK_WEKEN ? 'word lid om door te gaan' : 'je proefweek zit erop', opSlot: true });
  const letter = letters(d.intake).includes(body.letter) ? body.letter : null;
  if (!letter) return res.status(400).json({ ok: false, fout: 'welke sessie?' });
  if (!gedaanDezeWeek(d).includes(letter)) {
    await tel(d.email, 'core-sessie');
    d.sessies.push({ week: d.week, letter, teller: d.teller, op: nu(),
      finisher: Number(body.finisher) > 0 ? Math.min(600, Math.round(Number(body.finisher))) : undefined });
  }
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Gevoel na een sessie (08-10-2026) ----------------------------------------
// "Te licht" maakt de volgende sessies van dit niveau iets zwaarder (langer
// werken, korter rusten), "te zwaar" iets lichter. Vervalt bij het volgende niveau.
async function routeGevoel(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const g = { licht: 1, goed: 0, zwaar: -1 }[body.gevoel];
  if (g === undefined) return res.status(400).json({ ok: false, fout: 'hoe voelde het?' });
  d.bijstel = g;
  const laatste = (d.sessies || []).filter((x) => x.teller === d.teller).pop();
  if (laatste) laatste.gevoel = body.gevoel;
  await bewaarDossier(d);
  const melding = g > 0 ? 'Genoteerd. Je volgende sessies worden iets zwaarder: langer werken, korter rusten.'
    : g < 0 ? 'Genoteerd. Je volgende sessies worden iets lichter. Zo bouw je veilig op.' : 'Mooi, dan blijft het zo.';
  return res.status(200).json({ ok: true, melding, ...klantBeeld(d) });
}

// --- Sportschool (09-10-2026) -------------------------------------------------
// Voor wie de intake al deed: één vraag, komt in de tips en bij de coach.
async function routeKracht(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (!d.intake) return res.status(400).json({ ok: false, fout: 'doe eerst je intake' });
  if (!['nee', '1x', '2x'].includes(body.kracht)) return res.status(400).json({ ok: false, fout: 'kies een antwoord' });
  d.intake.kracht = body.kracht;
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Week afsluiten ---------------------------------------------------------------
async function routeWeekklaar(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (d.status === 'klaar') return res.status(400).json({ ok: false, fout: 'je programma is al afgerond' });
  if (gedaanDezeWeek(d).length < nodigVoorWeek(d.intake)) return res.status(400).json({ ok: false, fout: `rond eerst ${nodigVoorWeek(d.intake)} sessies af` });
  if (opSlotNu(d)) return res.status(403).json({ ok: false, fout: d.week > BLOK_WEKEN ? 'word lid om door te gaan' : 'je proefweek zit erop', opSlot: true });
  const reactie = ['makkelijk', 'beter', 'gelijk', 'zwaar', 'slechter'].includes(body.reactie) ? body.reactie : null;
  if (!reactie) return res.status(400).json({ ok: false, fout: 'hoe reageerde je lichaam?' });

  const oudeWeek = d.week;
  const stap = volgendeWeek(d.week, reactie, d.slechterOpRij, d.zwaarOpRij || 0);
  // Eenmalige kopers zonder lidmaatschap springen niet voorbij niveau 12.
  if (!magDoorlopen(d) && oudeWeek < BLOK_WEKEN && stap.week > BLOK_WEKEN) stap.week = BLOK_WEKEN;
  d.bijstel = 0;
  d.reacties.push({ week: d.week, reactie, op: nu() });
  d.teller += 1;
  let melding;
  if (reactie === 'zwaar') {
    // Te zwaar maar geen klachten: niveau herhalen, bij twee keer op rij een stap terug.
    const terug = stap.week < oudeWeek;
    d.zwaarOpRij = terug ? 0 : (d.zwaarOpRij || 0) + 1;
    d.slechterOpRij = 0; d.verlicht = false;
    d.week = stap.week;
    d.afgerond = Math.min(d.afgerond, d.week - 1);
    melding = terug
      ? `Twee keer op rij te zwaar. De app beweegt mee: je gaat een stapje terug, naar niveau ${d.week}. Zo bouw je weer op met vertrouwen.`
      : `Goed dat je het zegt. Je doet niveau ${d.week} nog een keer, zodat je het straks onder controle hebt. Voelt het weer te zwaar, dan gaan we een stapje terug.`;
  } else if (reactie === 'slechter') {
    d.zwaarOpRij = 0;
    d.slechterOpRij += 1;
    d.verlicht = true;
    d.week = stap.week;
    d.afgerond = Math.min(d.afgerond, d.week - 1);
    // Kijk naar "twee keer op rij", niet naar of de week terug kon: in week 1
    // kan dat niet, maar het advies om het te laten checken hoort er wel bij.
    melding = stap.seintje
      ? `Twee keer op rij slechter. ${stap.week < oudeWeek ? `We zetten je een niveau terug, naar niveau ${d.week}` : `Je doet niveau ${d.week} nog een keer`}, met lichtere varianten. Blijft het slechter gaan, of heb je echte pijn in plaats van spierpijn? Stop dan even en laat het checken door je huisarts of fysiotherapeut.`
      : `Je doet niveau ${d.week} nog een keer, met lichtere varianten. Zo bouw je nooit door op pijn.`;
    // Twee keer slechter op rij: geen mail, wel de vlag 'slechter' in het coachscherm.
  } else {
    d.slechterOpRij = 0; d.zwaarOpRij = 0;
    d.verlicht = false;
    d.afgerond = Math.max(d.afgerond, oudeWeek);
    if (oudeWeek >= BLOK_WEKEN && !magDoorlopen(d)) { d.status = 'klaar'; melding = 'Niveau 12 bereikt. Doe je romptest en kijk wat het je heeft opgeleverd. Wil je verder, dan beweegt de app als lid gewoon met je mee.'; }
    else if (d.vasthouden) {
      // Eén week vasthouden na een hertest met weinig vooruitgang.
      d.vasthouden = false;
      melding = `Je Rompscore steeg de laatste weken nog weinig. Je doet niveau ${d.week} daarom nog één keer, en daarna bouwen we verder.`;
    }
    else {
      d.week = stap.week;
      const afst = isBetaald(d) ? stemAfOpDoel(d) : null;
      melding = !isBetaald(d) ? 'Je proefweek zit erop. Het volgende niveau staat voor je klaar.'
        : reactie === 'makkelijk' ? `Te makkelijk? Dan gaan we sneller: je springt naar niveau ${d.week}.` : `Niveau ${d.week} staat klaar.`;
      if (afst === 'inhalen') melding += ` ${d.doel.naam} komt dichterbij: de app schuift je iets sneller door, zodat je op je sterkst bent op de dag zelf.`;
      if (afst === 'nieuwblok') melding += ` Je ligt ruim voor op schema. Je begint aan een nieuw, zwaarder blok dat precies uitkomt op ${d.doel.naam}.`;
      periodiseer(d);
      if (!isBetaald(d) && oudeWeek === 1) { d.proefKlaarOp = nu(); await mcTag(d.email, 'core-proef-klaar'); }
    }
  }
  const nieuwBadge = verdiendeBadges(d.afgerond).find((b) => b.fase * 3 === d.afgerond && reactie !== 'slechter' && reactie !== 'zwaar');
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, melding, nieuwBadge: nieuwBadge || null, ...klantBeeld(d) });
}

// --- Romptest -------------------------------------------------------------------
async function routeTest(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const moment = testNodig(d.afgerond, (d.tests || []).map((t) => t.moment));
  if (moment == null) return res.status(400).json({ ok: false, fout: 'er staat nu geen test open' });
  const uitslag = {};
  for (const t of TESTS) {
    const s = Math.round(Number(body.uitslag?.[t.id]));
    if (!(s >= 0 && s <= 900)) return res.status(400).json({ ok: false, fout: `vul ${t.naam.toLowerCase()} in` });
    uitslag[t.id] = s;
  }
  const score = rompscore(uitslag);
  // Hertest in week 4 of 8 en de Rompscore steeg minder dan 5 punten sinds de
  // vorige test? Dan houden we de volgende week één keer vast in plaats van
  // weer zwaarder te gaan, zodat de basis eerst steviger wordt.
  const vorige = (d.tests || []).filter((t) => t.moment < moment).pop();
  if (vorige && [4, 8].includes(moment % BLOK_WEKEN) && score - vorige.score < 5) d.vasthouden = true;
  d.tests.push({ moment, uitslag, score, op: nu() });
  if (vorige && score > vorige.score) await reviewMoment(d.email, 'rompscore');
  // De romptest stuurt mee (08-10-2026): 10 punten of meer erbij sinds de vorige
  // test = de app schuift je een niveau op (eenmalige kopers niet voorbij niveau 12).
  let melding = null;
  if (vorige && score - vorige.score >= 10 && (magDoorlopen(d) || d.week < BLOK_WEKEN) && d.status !== 'klaar') {
    d.week += 1; d.vasthouden = false; d.bijstel = 0;
    melding = `Je Rompscore steeg flink (+${score - vorige.score}). De app beweegt mee: je schuift een niveau op, naar niveau ${d.week}.`;
  }
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, melding, ...klantBeeld(d) });
}

// --- Rugklachtenmeter ------------------------------------------------------------
async function routeMeter(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const moment = meterNodig(d.afgerond, (d.meters || []).map((m) => m.moment));
  if (moment == null) return res.status(400).json({ ok: false, fout: 'er staat nu geen meting open' });
  const cijfer = (v) => { const n = Math.round(Number(v)); return n >= 0 && n <= 10 ? n : null; };
  const onderrug = cijfer(body.onderrug), nek = cijfer(body.nek);
  if (onderrug == null || nek == null) return res.status(400).json({ ok: false, fout: 'kies voor allebei een cijfer van 0 tot 10' });
  d.meters.push({ moment, onderrug, nek, op: nu() });
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

async function routeDoorgaan(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d } = r;
  if (!d.doorgaan) {
    d.doorgaan = nu();
    // Alleen tellen, geen mail. Staat in het coachscherm.
  }
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Vraag aan Michel ------------------------------------------------------------
async function routeVraag(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const tekst = String(body.tekst || '').trim().slice(0, 1200);
  if (tekst.length < 5) return res.status(400).json({ ok: false, fout: 'je bericht is leeg' });

  const berichten = d.berichten || [];
  // Rem op kosten en misbruik: een paar vragen per dag is ruim genoeg.
  const vandaag = nu().slice(0, 10);
  if (berichten.filter((b) => b.van === 'klant' && String(b.op).startsWith(vandaag)).length >= MAX_VRAGEN_PER_DAG) {
    return res.status(200).json({ ok: false, rem: true, melding: 'Je hebt vandaag al een paar vragen gesteld. Morgen kun je weer verder.' });
  }

  const bericht = { id: crypto.randomBytes(4).toString('hex'), van: 'klant', week: d.week, tekst, op: nu() };
  const a = MEDISCH_WOORDEN.test(tekst) ? { tekst: MEDISCH_ANTWOORD, medisch: true } : await assistentAntwoord(tekst, d);
  bericht.medisch = !!a?.medisch;
  const antwoord = { id: crypto.randomBytes(4).toString('hex'), van: 'coach', tekst: a?.tekst || STORING_ANTWOORD, op: nu(), medisch: bericht.medisch, storing: !a };
  d.berichten = berichten.concat(bericht, antwoord);
  await bewaarDossier(d);
  // Medisch: Michel krijgt een seintje, zodat hij zelf contact kan opnemen.
  if (bericht.medisch) await meldMedisch({ email: d.email, naam: d.naam, bron: 'core-coach', vraag: tekst, coreId: d.id,
    extra: `Core-app niveau ${d.week}. Klachten bij de intake: ${((d.intake && d.intake.klachten) || []).join(', ') || 'geen'}.` });
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Aantal sessies per week wijzigen -------------------------------------------
// Geldt meteen. Wat deze week al is afgevinkt telt gewoon mee.
async function routeFrequentie(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  const f = Number(body.frequentie);
  if (![2, 3, 4].includes(f) || !d.intake) return res.status(400).json({ ok: false, fout: 'kies 2, 3 of 4' });
  d.intake.frequentie = f;
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- App op het beginscherm ---------------------------------------------------
// Per deelnemer een eigen manifest, zodat het icoon direct zijn eigen pagina
// opent (de token zit in start_url). iOS en Android lezen dit bij "Zet op
// beginscherm".
function routeManifest(req, res) {
  const t = (req.query?.t || '').toString();
  if (!leesCoreToken(t)) return res.status(403).json({ ok: false });
  const basis = new URL(PAGINA_URL);
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  return res.status(200).send(JSON.stringify({
    name: 'Mijn Core', short_name: 'Core', lang: 'nl',
    description: 'Je Core-programma voor wielrenners',
    start_url: `${basis.pathname}?t=${encodeURIComponent(t)}`,
    scope: basis.pathname, id: basis.pathname,
    display: 'standalone', orientation: 'portrait',
    background_color: '#0A0A0A', theme_color: '#0A0A0A',
    icons: [
      { src: '/core-programma/icoon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/core-programma/icoon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/core-programma/icoon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }));
}

// --- Sessies in je agenda -------------------------------------------------------
// Vaste dagen, één tijd, een half jaar (26 weken). Elke afspraak heeft de link naar de
// eigen pagina, zodat tikken in de agenda meteen de sessie opent.
const DAGCODE = { ma: 'MO', di: 'TU', wo: 'WE', do: 'TH', vr: 'FR', za: 'SA', zo: 'SU' };
const DAGNR = { zo: 0, ma: 1, di: 2, wo: 3, do: 4, vr: 5, za: 6 };
async function routeAgenda(req, res) {
  const t = (req.query?.t || '').toString();
  const id = leesCoreToken(t);
  if (!id) return res.status(403).send('link ongeldig');
  const d = await haalDossier(id);
  const lt = letters(d?.intake);
  const dagen = String(req.query?.dagen || '').split(',').filter((x) => DAGCODE[x]).slice(0, lt.length);
  if (dagen.length !== lt.length) return res.status(400).send(`kies ${lt.length} dagen`);
  const m = String(req.query?.tijd || '19:00').match(/^(\d{1,2}):(\d{2})$/);
  const uur = m ? Math.min(23, Number(m[1])) : 19, min = m ? Math.min(59, Number(m[2])) : 0;
  const link = linkVoor(id);
  const p2 = (n) => String(n).padStart(2, '0');
  const stempel = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  // Eerstvolgende datum (vanaf morgen) voor elke gekozen dag; zwevende lokale tijd.
  const regels = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Michel Kreder Coaching//Core//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Core-programma'];
  lt.forEach((letter, i) => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    while (d.getDay() !== DAGNR[dagen[i]]) d.setDate(d.getDate() + 1);
    const start = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(uur)}${p2(min)}00`;
    const eindMin = uur * 60 + min + 20;
    const eind = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(Math.floor(eindMin / 60) % 24)}${p2(eindMin % 60)}00`;
    regels.push('BEGIN:VEVENT', `UID:core-${id}-${letter}@michelkredercoaching.nl`, `DTSTAMP:${stempel}`,
      `DTSTART:${start}`, `DTEND:${eind}`, `RRULE:FREQ=WEEKLY;BYDAY=${DAGCODE[dagen[i]]};COUNT=26`,
      `SUMMARY:Core-sessie ${i + 1}`,
      `DESCRIPTION:Tijd voor je core-sessie. Telefoon op de grond en op start drukken.\\n\\n${link}`,
      `URL:${link}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Core-sessie', 'TRIGGER:-PT10M', 'END:VALARM',
      'END:VEVENT');
  });
  regels.push('END:VCALENDAR');
  // ICS-regels mogen max 75 tekens zijn: vouwen met een spatie op de volgende regel.
  const gevouwen = regels.map((r) => { let uit = '', rest = r; while (rest.length > 74) { uit += rest.slice(0, 74) + '\r\n '; rest = rest.slice(74); } return uit + rest; }).join('\r\n') + '\r\n';
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="core-programma.ics"');
  return res.status(200).send(gevouwen);
}

// --- Intern: coachscherm ----------------------------------------------------------
// Zelfde vorm als het Afvalprogramma, zodat coach-afval.html met ?programma=core
// dezelfde lijst kan tekenen.
async function routeRij(req, res) {
  if (!magIntern(req)) return res.status(403).json({ ok: false });
  const leden = await redis(['SMEMBERS', 'core:actief']);
  const uit = [];
  for (const id of leden.result || []) {
    const d = await haalDossier(id);
    if (!d) continue;
    const berichten = d.berichten || [];
    const laatste = berichten[berichten.length - 1] || null;
    const laatsteSessie = (d.sessies || []).slice(-1)[0];
    const vlaggen = [];
    // Alleen informatief: het programma handelt alles zelf af.
    if (berichten.some((b) => b.van === 'klant' && b.medisch && b.op > (d.coachGezienOp || ''))) vlaggen.push('medisch');
    if (d.status === 'wacht-op-fysio') vlaggen.push('rode-vlag');
    if (d.slechterOpRij >= 2) vlaggen.push('slechter');
    if (!d.intake && isBetaald(d)) vlaggen.push('geen-intake');
    const stil = laatsteSessie ? (Date.now() - new Date(laatsteSessie.op)) > 14 * 864e5 : (Date.now() - new Date(d.besteldOp)) > 7 * 864e5;
    if (stil && d.status === 'actief' && isBetaald(d)) vlaggen.push('stil');
    const laatsteTest = (d.tests || []).slice(-1)[0];
    uit.push({
      id, naam: d.naam, email: d.email, week: d.week, weken: 12, status: d.status, vlaggen,
      // Labels zijn informatie, geen actie: ze tellen niet mee in 'Wacht op mij'.
      labels: [!isBetaald(d) ? 'proef' : null, d.bron === 'begeleiding' ? 'begeleiding' : null].filter(Boolean),
      laatsteBerichtOp: laatste?.op || null, voorbeeld: laatste ? laatste.tekst.slice(0, 90) : null, voorbeeldVan: laatste?.van || null,
      berichten: berichten.map((b) => ({ id: b.id, van: b.van, tekst: b.tekst, op: b.op, medisch: !!b.medisch, concept: b.concept || null })),
      core: {
        klachten: d.intake?.klachten || [], ervaring: d.intake?.ervaring || null,
        afgerond: d.afgerond, sessies: (d.sessies || []).length,
        rompscore: laatsteTest?.score ?? null, eersteScore: (d.tests || [])[0]?.score ?? null,
        rug: (d.meters || []).slice(-1)[0] || null,
        reacties: (d.reacties || []).slice(-3).map((x) => `wk${x.week} ${x.reactie}`),
        doel: d.doel, doorgaan: !!d.doorgaan
      }
    });
  }
  uit.sort((a, b) => (b.vlaggen.length - a.vlaggen.length) || String(b.laatsteBerichtOp || '').localeCompare(String(a.laatsteBerichtOp || '')));
  return res.status(200).json({ ok: true, deelnemers: uit });
}

async function routeAntwoord(req, res) {
  if (!magIntern(req)) return res.status(403).json({ ok: false });
  const body = await leesBody(req);
  const d = await haalDossier(String(body.id || ''));
  if (!d) return res.status(404).json({ ok: false });
  const tekst = String(body.tekst || '').trim();
  if (!tekst) return res.status(400).json({ ok: false, fout: 'lege tekst' });
  d.berichten = (d.berichten || []).concat({ id: crypto.randomBytes(4).toString('hex'), van: 'michel', tekst, op: nu() });
  d.onbeantwoord = false;
  // Michel heeft gereageerd, dus ook een rode vlag of "slechter" is gezien.
  if (body.ontgrendel && d.status === 'wacht-op-fysio' && d.intake) { d.status = 'actief'; d.intake.rodeVlag = false; }
  d.coachGezienOp = nu();
  await bewaarDossier(d);
  await mail({ naar: d.email, onderwerp: 'Bericht van Michel over je Core-programma', html: berichtHtml(d, tekst), antwoordNaar: INTERN_NAAR });
  return res.status(200).json({ ok: true });
}

async function routeVerwijder(req, res) {
  if (!magIntern(req)) return res.status(403).json({ ok: false });
  const body = await leesBody(req);
  const id = String(body.id || '');
  if (!/^[0-9a-f]{16}$/.test(id)) return res.status(400).json({ ok: false, fout: 'geen geldig id' });
  const d = await haalDossier(id);
  await redis(['DEL', `core:d:${id}`]);
  await redis(['DEL', `core:strava:${id}`]);
  await redis(['SREM', 'core:actief', id]);
  if (d?.order) await redis(['DEL', `core:order:${d.order}`]);
  return res.status(200).json({ ok: true, verwijderd: id });
}

// --- Maandagmail ------------------------------------------------------------------
// Iedereen die bezig is krijgt zijn week en de tip. Wie al 14 dagen niets
// afvinkte krijgt geen automatische mail maar een vlag in het coachscherm:
// daar moet een mens achteraan.
async function routeHerinner(req, res) {
  if (!magIntern(req)) return res.status(403).json({ ok: false });
  const leden = await redis(['SMEMBERS', 'core:actief']);
  let gemaild = 0, overgeslagen = 0, push = 0;
  for (const id of leden.result || []) {
    const d = await haalDossier(id);
    // Proefdeelnemers krijgen hun mails uit de Mailchimp-journey, niet van hier.
    if (!d || d.status !== 'actief' || !isBetaald(d)) { overgeslagen++; continue; }
    const laatste = (d.sessies || []).slice(-1)[0];
    if (laatste && Date.now() - new Date(laatste.op) > 14 * 864e5) { overgeslagen++; continue; }
    // 09-10-2026 (besluit Michel): geen mail meer, maar een melding in de app
    // en een pushbericht voor wie meldingen aan heeft. Spaart Resend.
    const doel = d.doel ? besteStart(d.doel.datum) : null;
    const r = await appMelding(d.email, {
      soort: 'core',
      titel: `Niveau ${d.week}: je core-sessies staan klaar`,
      tekst: `Fase ${FASES[weekRij(d.week).fase] || ''}.${doel && doel.dagenTotDoel > 0 ? ` Nog ${doel.wekenTotDoel} weken tot ${d.doel.naam}.` : ''} Tik om te starten.`,
      link: linkVoor(d.id)
    });
    gemaild++; if (r.push) push++;
  }
  return res.status(200).json({ ok: true, klaargezet: gemaild, push, overgeslagen });
}

// ===========================================================================
// MAILS
// ===========================================================================
const STIJL = 'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px';
const KNOP = 'background:#FF6B1A;color:#0a0a0a;padding:14px 24px;text-decoration:none;font-weight:bold;display:inline-block;border-radius:6px';
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const hoi = (d) => `Hoi${d.naam ? ' ' + esc(d.naam.split(' ')[0]) : ''},`;

function welkomHtml(d, link, begeleiding) {
  return `<div style="${STIJL}">
    <p>${hoi(d)}</p>
    ${begeleiding
      ? '<p>Vanaf nu hoort de Core-app bij je begeleiding, zonder extra kosten. Twaalf weken, 2, 3 of 4 korte sessies per week, en elke week net iets zwaarder. Plan de sessies op je rustige dagen, dan stem ik je fietstrainingen erop af.</p>'
      : '<p>Welkom in de Core-app. Twaalf weken, 2, 3 of 4 korte sessies per week (jij kiest), en elke week net iets zwaarder.</p>'}
    <p>Dit is je eigen pagina. Bewaar deze mail, want de link is persoonlijk:</p>
    <p><a href="${link}" style="${KNOP}">Open mijn Core-app</a></p>
    <p><b>Eerst doe je de intake.</b> Een paar korte vragen, onder andere of je last hebt van je onderrug, nek of knie. Daarop stem ik je oefeningen af.</p>
    <p><b>Daarna je starttest.</b> Een paar houdgrepen met de stopwatch op je pagina. Die herhaal je in week 4, 8 en 12, zodat je zwart op wit ziet wat het oplevert.</p>
    <p>Leg je telefoon bij de sessies gewoon op de grond. De pagina telt af en zegt wanneer je wisselt.</p>
    <p>Sterke kilometers,<br>Michel</p>
  </div>`;
}
function openHtml(d, link) {
  return `<div style="${STIJL}">
    <p>${hoi(d)}</p>
    <p>Je hele Core-app staat open. Alles wat je in je proefweek deed, staat er nog: je intake, je starttest en je afgevinkte sessies.</p>
    <p><a href="${link}" style="${KNOP}">Door naar niveau ${d.week}</a></p>
    <p>Vanaf nu krijg je elke maandag je week in je mail. Twijfel je over een oefening? Stel je vraag op je pagina, je krijgt direct antwoord.</p>
    <p>Sterke kilometers,<br>Michel</p>
  </div>`;
}

function herinneringHtml(d) {
  const tip = WEEKTIPS[d.week];
  const doel = d.doel ? besteStart(d.doel.datum) : null;
  return `<div style="${STIJL}">
    <p>${hoi(d)}</p>
    <p>Niveau ${d.week}, fase ${FASES[weekRij(d.week).fase] || ''}. Je sessies staan klaar op je pagina.</p>
    ${doel && doel.dagenTotDoel > 0 ? `<p>Nog <b>${doel.wekenTotDoel} weken</b> tot ${esc(d.doel.naam)}.</p>` : ''}
    ${tip ? `<p style="border-left:3px solid #FF6B1A;padding-left:14px;color:#333"><b>Tip van de week:</b> ${esc(tip)}</p>` : ''}
    <p><a href="${linkVoor(d.id)}" style="${KNOP}">Start je sessie</a></p>
    <p>Michel</p>
  </div>`;
}
function berichtHtml(d, tekst) {
  return `<div style="${STIJL}">
    <p>${hoi(d)}</p>
    <p>${esc(tekst).replace(/\n/g, '<br>')}</p>
    <p>Michel</p>
    <p style="font-size:13px;color:#666">Je pagina: <a href="${linkVoor(d.id)}">open hem hier</a></p>
  </div>`;
}
