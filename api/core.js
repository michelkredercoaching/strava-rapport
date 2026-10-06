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
import {
  maakPlan, sessie, heeftRodeVlag, KLACHTEN, OEFENINGEN, TESTS, rompscore, balans,
  volgendeWeek, testNodig, meterNodig, verdiendeBadges, BADGES,
  WEEKTIPS, besteStart, FASES, WEKEN as WEEKTABEL, letters, nodigVoorWeek, frequentie, startniveau
} from '../lib/core.js';

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
const isBetaald = (d) => d.betaald !== false;

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
    `Week ${d.week} van 12 (${FASES[WEEKTABEL[d.week - 1]?.fase] || ''}), ${d.afgerond} weken afgerond.`,
    d.intake ? `Klachten: ${(d.intake.klachten || []).join(', ') || 'geen'}. Ervaring: ${d.intake.ervaring}. Leeftijd: ${({ onder40: 'jonger dan 40', '40-55': '40 tot 55', '55plus': '55 of ouder' })[d.intake.leeftijd] || 'onbekend'}. ${frequentie(d.intake)}x per week. Startniveau uit de starttest: ${startniveau(planIntake(d))}.` : 'Intake nog niet gedaan.',
    s ? `Oefeningen deze week: ${letters(d.intake).map((l, i) => { const x = sessie(d.week, l, planIntake(d)); return 'sessie ' + (i + 1) + ': ' + x.oefeningen.map((o) => `${o.naam} (${o.cue})`).join('; '); }).join(' | ')}.` : '',
    s ? `Werk/rust deze week: ${s.werk}s/${s.rust}s, ${s.rondes} rondes.` : '',
    (d.reacties || []).length ? `Laatste weekreacties: ${(d.reacties || []).slice(-3).map((x) => `week ${x.week} ${x.reactie}`).join(', ')}.` : '',
    (d.berichten || []).length ? `Eerdere vragen: ${(d.berichten || []).filter((b) => b.van === 'klant').slice(-3).map((b) => b.tekst.slice(0, 120)).join(' / ')}` : '',
    laatsteTest ? `Laatste romptest (week ${laatsteTest.moment}): Rompscore ${laatsteTest.score}.` : '',
    d.doel ? `Doel: ${d.doel.naam} op ${d.doel.datum}.` : ''
  ].filter(Boolean).join('\n');

  const systeem = [
    'Je bent de coach-assistent van het Core-programma van Michel Kreder, wielercoach en oud-profrenner. Je antwoord gaat direct naar de deelnemer, er kijkt niemand meer naar.',
    'Het programma: 12 weken romp- en heupoefeningen zonder gewichten voor wielrenners, 2, 3 of 4 sessies per week (de deelnemer kiest en kan wisselen), elke week zwaarder. Een week is rond bij 2 van de 2, 2 van de 3 of 3 van de 4 sessies. Gaat het slechter, dan herhaalt de deelnemer de week met lichtere varianten. Romptest in week 0, 4, 8 en 12.',
    'Toon: warm, direct, korte zinnen, geen gedachtestreepjes, geen jargon. Spreek de deelnemer aan met je. Nederlands, maximaal 120 woorden, geen begroeting en geen ondertekening.',
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
  return { ...(d.intake || {}), verlicht: !!d.verlicht, startScore: start ? start.score : null };
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
  const sessies = d.intake && !geblokkeerd
    ? letters(d.intake).map((l) => {
        const s = sessie(week, l, intake);
        return { ...s, warmingUp: s.warmingUp.map((id) => ({ id, ...OEFENINGEN[id] })),
                 coolDown: { ...s.coolDown, ...OEFENINGEN[s.coolDown.id] } };
      })
    : [];
  const gedaan = gedaanDezeWeek(d);
  const tests = (d.tests || []).map((t) => ({ moment: t.moment, score: t.score, uitslag: t.uitslag, balans: balans(t.uitslag) }));
  const vakjes = [];
  for (let w = 1; w <= 12; w++) for (const l of letters(d.intake)) {
    vakjes.push({ week: w, letter: l, gedaan: (d.sessies || []).some((s) => s.week === w && s.letter === l) });
  }
  // Alleen aftellen, geen doeltip (besluit Michel).
  const doel = d.doel ? { ...d.doel, ...(besteStart(d.doel.datum) || {}) } : null;

  return {
    naam: d.naam || '', status: d.status,
    betaald: isBetaald(d),
    // Proefweek: week 1 mag, vanaf week 2 op slot tot er betaald is.
    opSlot: !isBetaald(d) && d.week >= 2,
    koopUrl: KOOP_URL,
    zwaarsteDag: d.intake?.zwaarsteDag || null,
    intakeNodig: !d.intake, geblokkeerd,
    week, afgerond: d.afgerond, fase: WEEKTABEL[week - 1].fase, faseNaam: FASES[WEEKTABEL[week - 1].fase],
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
    weektip: WEEKTIPS[week], intakeTips: d.intake ? maakPlan(intake).tips || [] : [],
    doel,
    vervolgVraag: d.afgerond >= 9, doorgaan: !!d.doorgaan,
    berichten: (d.berichten || []).map((b) => ({ van: b.van, tekst: b.tekst, op: b.op, medisch: !!b.medisch })),
  };
}

// ===========================================================================
// ROUTES
// ===========================================================================
export default async function handler(req, res) {
  const actie = (req.query?.actie || '').toString();
  try {
    switch (actie) {
      case 'nieuw':     return await routeNieuw(req, res);
      case 'plan':      return await routePlan(req, res);
      case 'intake':    return await routeIntake(req, res);
      case 'doel':      return await routeDoel(req, res);
      case 'afvink':    return await routeAfvink(req, res);
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

async function routePlan(req, res) {
  const r = await metToken(req, res); if (!r) return;
  return res.status(200).json({ ok: true, ...klantBeeld(r.d) });
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
    op: nu()
  };
  d.intake = intake;
  if (body.doelNaam && body.doelDatum && !isNaN(new Date(body.doelDatum))) {
    d.doel = { naam: String(body.doelNaam).slice(0, 60), datum: String(body.doelDatum).slice(0, 10) };
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
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Sessie afgerond ------------------------------------------------------------
async function routeAfvink(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (!d.intake || d.status === 'wacht-op-fysio') return res.status(400).json({ ok: false, fout: 'eerst de intake' });
  if (!isBetaald(d) && d.week >= 2) return res.status(403).json({ ok: false, fout: 'je proefweek zit erop', opSlot: true });
  const letter = letters(d.intake).includes(body.letter) ? body.letter : null;
  if (!letter) return res.status(400).json({ ok: false, fout: 'welke sessie?' });
  if (!gedaanDezeWeek(d).includes(letter)) {
    d.sessies.push({ week: d.week, letter, teller: d.teller, op: nu(),
      finisher: Number(body.finisher) > 0 ? Math.min(600, Math.round(Number(body.finisher))) : undefined });
  }
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Week afsluiten ---------------------------------------------------------------
async function routeWeekklaar(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const r = await metToken(req, res); if (!r) return;
  const { d, body } = r;
  if (gedaanDezeWeek(d).length < nodigVoorWeek(d.intake)) return res.status(400).json({ ok: false, fout: `rond eerst ${nodigVoorWeek(d.intake)} sessies af` });
  if (!isBetaald(d) && d.week >= 2) return res.status(403).json({ ok: false, fout: 'je proefweek zit erop', opSlot: true });
  const reactie = ['beter', 'gelijk', 'slechter'].includes(body.reactie) ? body.reactie : null;
  if (!reactie) return res.status(400).json({ ok: false, fout: 'hoe reageerde je lichaam?' });

  const oudeWeek = d.week;
  const stap = volgendeWeek(d.week, reactie, d.slechterOpRij);
  d.reacties.push({ week: d.week, reactie, op: nu() });
  d.teller += 1;
  let melding;
  if (reactie === 'slechter') {
    d.slechterOpRij += 1;
    d.verlicht = true;
    d.week = stap.week;
    d.afgerond = Math.min(d.afgerond, d.week - 1);
    // Kijk naar "twee keer op rij", niet naar of de week terug kon: in week 1
    // kan dat niet, maar het advies om het te laten checken hoort er wel bij.
    melding = stap.seintje
      ? `Twee weken op rij slechter. ${stap.week < oudeWeek ? `We zetten je een week terug, naar week ${d.week}` : `Je doet week ${d.week} nog een keer`}, met lichtere varianten. Blijft het slechter gaan, of heb je echte pijn in plaats van spierpijn? Stop dan even en laat het checken door je huisarts of fysiotherapeut.`
      : `Je doet week ${d.week} nog een keer, met lichtere varianten. Zo bouw je nooit door op pijn.`;
    // Twee keer slechter op rij: geen mail, wel de vlag 'slechter' in het coachscherm.
  } else {
    d.slechterOpRij = 0;
    d.verlicht = false;
    d.afgerond = Math.max(d.afgerond, oudeWeek);
    if (oudeWeek >= 12) { d.status = 'klaar'; melding = 'Alle 12 weken rond. Doe nu je eindtest en kijk wat het je heeft opgeleverd.'; }
    else if (d.vasthouden) {
      // Eén week vasthouden na een hertest met weinig vooruitgang.
      d.vasthouden = false;
      melding = `Je Rompscore steeg de laatste weken nog weinig. Je doet week ${d.week} daarom nog één keer, op hetzelfde niveau, en daarna bouwen we verder.`;
    }
    else {
      d.week = stap.week;
      melding = isBetaald(d) ? `Week ${d.week} staat klaar.` : 'Je proefweek zit erop. Week 2 staat voor je klaar.';
      if (!isBetaald(d) && oudeWeek === 1) { d.proefKlaarOp = nu(); await mcTag(d.email, 'core-proef-klaar'); }
    }
  }
  const nieuwBadge = verdiendeBadges(d.afgerond).find((b) => b.fase * 3 === d.afgerond && reactie !== 'slechter');
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
  if (vorige && [4, 8].includes(moment) && score - vorige.score < 5) d.vasthouden = true;
  d.tests.push({ moment, uitslag, score, op: nu() });
  await bewaarDossier(d);
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
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
// Drie vaste dagen, één tijd, 12 weken. Elke afspraak heeft de link naar de
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
      `DTSTART:${start}`, `DTEND:${eind}`, `RRULE:FREQ=WEEKLY;BYDAY=${DAGCODE[dagen[i]]};COUNT=12`,
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
  let gemaild = 0, overgeslagen = 0;
  for (const id of leden.result || []) {
    const d = await haalDossier(id);
    // Proefdeelnemers krijgen hun mails uit de Mailchimp-journey, niet van hier.
    if (!d || d.status !== 'actief' || !isBetaald(d)) { overgeslagen++; continue; }
    const laatste = (d.sessies || []).slice(-1)[0];
    if (laatste && Date.now() - new Date(laatste.op) > 14 * 864e5) { overgeslagen++; continue; }
    await mail({ naar: d.email, onderwerp: `Week ${d.week}: je core-sessies staan klaar`, html: herinneringHtml(d), antwoordNaar: INTERN_NAAR });
    gemaild++;
  }
  return res.status(200).json({ ok: true, gemaild, overgeslagen });
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
    <p><a href="${link}" style="${KNOP}">Door naar week ${d.week}</a></p>
    <p>Vanaf nu krijg je elke maandag je week in je mail. Twijfel je over een oefening? Stel je vraag op je pagina, je krijgt direct antwoord.</p>
    <p>Sterke kilometers,<br>Michel</p>
  </div>`;
}

function herinneringHtml(d) {
  const tip = WEEKTIPS[d.week];
  const doel = d.doel ? besteStart(d.doel.datum) : null;
  return `<div style="${STIJL}">
    <p>${hoi(d)}</p>
    <p>Week ${d.week} van 12. Je sessies staan klaar op je pagina.</p>
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
