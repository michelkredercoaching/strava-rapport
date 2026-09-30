// /api/afvalprogramma.js
// Alle routes van Het Afvalprogramma voor Wielrenners in ÉÉN bestand, omdat
// elk los bestand in api/ een Vercel-functie is. Zie [[vercel-12-functies-limiet]].
// Routeren gaat via ?actie=...
//
//   POST ?actie=nieuw        Woo-webhook: bestelling betaald -> token + welkomstmail
//   GET  ?actie=plan         klantpagina haalt het plan op (token in de url)
//   GET  ?actie=vragen       de inschrijfkaart-vragen, zodat de pagina ze rendert
//   POST ?actie=intake       klant vult zijn gegevens in -> plan wordt berekend
//   POST ?actie=checkin      wekelijkse check-in -> bijsturing + nieuw plan
//   POST ?actie=vraag        vraag aan de coach -> in de rij voor goedkeuring
//   GET  ?actie=rij          intern: wat ligt er klaar voor een mens (beveiligd)
//   POST ?actie=antwoord     intern: goedgekeurd antwoord versturen (beveiligd)
//
// Nodig in Vercel:
//   PP_TOKEN_SECRET            (bestaat al, zelfde geheim als de kortingslinks)
//   UPSTASH_REDIS_REST_URL     (bestaat al)
//   UPSTASH_REDIS_REST_TOKEN   (bestaat al)
//   RESEND_API_KEY             (bestaat al)
//   ANTHROPIC_API_KEY          NIEUW, voor de conceptantwoorden
//   AFVAL_INTERN_SLEUTEL       NIEUW, wachtwoord voor de interne routes
//   WOO_WEBHOOK_SECRET         NIEUW, om de Woo-webhook te kunnen controleren

import crypto from 'node:crypto';
import {
  berekenPlan, wekelijkseBijsturing, pasBijsturingToe,
  controleerVeiligheid, weekGemiddelden, DAGTYPES
} from '../lib/voeding.js';
import { VRAGEN, bepaalNiveau, niveauSamenvatting, NIVEAUS } from '../lib/niveau.js';
import { voorbeelddag, ritVoeding, ruiltabel, BLOK } from '../lib/porties.js';
import { dagSuggesties, ruilVanDeWeek } from '../lib/recepten.js';

const SECRET       = process.env.PP_TOKEN_SECRET || '';
const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const RESEND_KEY   = process.env.RESEND_API_KEY || '';
const CLAUDE_KEY   = process.env.ANTHROPIC_API_KEY || '';
const INTERN       = process.env.AFVAL_INTERN_SLEUTEL || '';
const WOO_SECRET   = process.env.WOO_WEBHOOK_SECRET || '';

const AFZENDER     = 'Michel Kreder <michel@michelkredercoaching.nl>';
const INTERN_NAAR  = 'michel.kredercoaching@gmail.com';
const PAGINA_URL   = 'https://rapport.michelkredercoaching.nl/mijn-programma';
const START_DATUM  = '2026-11-02';       // eerste ronde
const WEKEN        = 12;
const BEWAARTERMIJN_S = 60 * 60 * 24 * 300;   // 300 dagen, ruim na week 12

// ===========================================================================
// REDIS
// ===========================================================================
// Datamodel, alles onder de sleutel afval:
//   afval:d:<id>        JSON  het hele deelnemersdossier
//   afval:rij           LIST  id's die op een mens wachten (nieuwste eerst)
//   afval:actief        SET   id's van lopende deelnemers, voor de herinneringen
//
// Eén dossier ziet er zo uit:
//   { id, email, naam, besteldOp, startDatum, status,
//     intake: {...}, plan: {...},
//     metingen: [{week, gewicht, gevoel, etenGelukt, op}],
//     bijsturingen: [{week, regel, kcalAanpassing, op}],
//     berichten: [{id, van, tekst, op, concept, medisch, automatisch}],
//     evaluaties: [{week, tekst, op}] }
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
  const r = await redis(['GET', `afval:d:${id}`]);
  if (!r.ok || !r.result) return null;
  try { return JSON.parse(r.result); } catch { return null; }
}

async function bewaarDossier(d) {
  d.gewijzigd = new Date().toISOString();
  return redis(['SET', `afval:d:${d.id}`, JSON.stringify(d), 'EX', String(BEWAARTERMIJN_S)]);
}

async function zetInRij(id, reden) {
  await redis(['LPUSH', 'afval:rij', JSON.stringify({ id, reden, op: new Date().toISOString() })]);
  await redis(['LTRIM', 'afval:rij', '0', '499']);
}

// ===========================================================================
// TOKEN
// ===========================================================================
// "afval|<id>|<vervalt-ms>|<handtekening>" in base64url. Zelfde principe als
// lib/korting.js: de link bewijst zichzelf, er is geen wachtwoord nodig.
function handtekening(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
}

export function maakDeelnemerToken(id, dagenGeldig = 300) {
  if (!SECRET) return null;
  const exp = Date.now() + dagenGeldig * 24 * 3600 * 1000;
  const payload = `afval|${id}|${exp}`;
  return Buffer.from(`${payload}|${handtekening(payload)}`).toString('base64url');
}

export function leesDeelnemerToken(token) {
  if (!SECRET || !token || typeof token !== 'string' || token.length > 240) return null;
  let tekst;
  try { tekst = Buffer.from(token, 'base64url').toString('utf8'); } catch { return null; }
  const delen = tekst.split('|');
  if (delen.length !== 4 || delen[0] !== 'afval') return null;
  const [, id, expStr, sig] = delen;
  const goed = handtekening(`afval|${id}|${expStr}`);
  const a = Buffer.from(String(sig)), b = Buffer.from(goed);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!/^\d+$/.test(expStr) || Date.now() > Number(expStr)) return null;
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  return id;
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
      body: JSON.stringify({
        from: AFZENDER, to: [naar], subject: onderwerp, html,
        ...(antwoordNaar ? { reply_to: antwoordNaar } : {})
      })
    });
    if (!r.ok) console.error('Resend fout:', r.status, await r.text());
    return r.ok;
  } catch (e) { console.error('Resend exception:', e); return false; }
}

// ===========================================================================
// CLAUDE — conceptantwoord, NOOIT rechtstreeks naar de klant
// ===========================================================================
// Elk concept gaat eerst in de rij. Een mens leest het, past het aan en drukt
// op verzenden. Zo kan er geen onzin of medisch advies naar buiten.
async function conceptAntwoord({ vraag, dossier }) {
  if (!CLAUDE_KEY) return null;
  const plan = dossier.plan;
  const laatste = dossier.metingen?.[dossier.metingen.length - 1];
  const context = [
    `Deelnemer: ${dossier.naam || 'onbekend'}`,
    `Week ${huidigeWeek(dossier)} van ${WEKEN}`,
    plan ? `Plan: gemiddeld ${plan.gemiddeld} kcal/dag, eiwit ${plan.eiwit} g, ondergrens ${plan.ondergrens} kcal, verwacht tempo ${plan.verwachtTempo} kg/week.` : 'Nog geen plan.',
    laatste ? `Laatste weging: ${laatste.gewicht} kg in week ${laatste.week}. Trainingen: ${laatste.gevoel}. Eten: ${laatste.etenGelukt}.` : 'Nog geen weging.'
  ].join('\n');

  const systeem = [
    'Je schrijft een CONCEPT-antwoord voor Michel Kreder, wielercoach. Een mens leest het na voordat het verstuurd wordt.',
    'Toon: direct, warm, korte zinnen, geen gedachtestreepjes, geen jargon. Zoals een goede vriend die toevallig expert is.',
    'Schrijf in het Nederlands, maximaal 120 woorden, geen begroeting en geen ondertekening.',
    'Ga alleen over voeding rond training en over dit programma.',
    'Gaat de vraag over medicijnen, blessures, zwangerschap, een eetstoornis of iets anders medisch: schrijf GEEN advies, maar begin je antwoord met [MEDISCH] en zeg in één zin dat Michel hier zelf naar kijkt.',
    'Verzin geen getallen die niet in de context staan.'
  ].join(' ');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 400,
        system: systeem,
        messages: [{ role: 'user', content: `${context}\n\nVraag van de deelnemer:\n${vraag}` }]
      })
    });
    if (!r.ok) { console.error('Claude fout:', r.status, await r.text()); return null; }
    const j = await r.json();
    return (j.content || []).map(c => c.text || '').join('').trim() || null;
  } catch (e) { console.error('Claude exception:', e); return null; }
}

// ===========================================================================
// HULPJES
// ===========================================================================
function huidigeWeek(dossier) {
  const start = new Date(dossier.startDatum || START_DATUM).getTime();
  const nu = Date.now();
  if (nu < start) return 0;                       // nog in de voorbereiding
  return Math.min(WEKEN + 1, Math.floor((nu - start) / (7 * 24 * 3600 * 1000)) + 1);
}

function isEvaluatieweek(week) { return week === 4 || week === 8 || week === 12; }

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

// Twee manieren om binnen te komen op de interne routes:
//   1. het coachscherm, met de header x-afval-sleutel
//   2. Vercel Cron, dat zelf "Authorization: Bearer <CRON_SECRET>" meestuurt
// Die tweede is nodig omdat een cron geen eigen headers kan zetten.
function magIntern(req) {
  if (vergelijkVeilig(req.headers['x-afval-sleutel'], INTERN)) return true;
  const cronGeheim = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  if (cronGeheim && auth.startsWith('Bearer ')) {
    return vergelijkVeilig(auth.slice(7), cronGeheim);
  }
  return false;
}

// Wat de klant terugkrijgt. Nooit het hele dossier, alleen wat op zijn pagina hoort.
function klantBeeld(d) {
  const week = huidigeWeek(d);
  const metingen = d.metingen || [];
  // De grafiek en de cijfers tonen weekgemiddelden, want dat is ook waar de
  // bijsturing op rekent. Eén losse ochtend hoort niet de lijn te bepalen.
  const gemiddelden = weekGemiddelden(metingen);
  const start = gemiddelden[0]?.gewicht ?? d.intake?.gewicht ?? null;
  const nu = gemiddelden[gemiddelden.length - 1]?.gewicht ?? start;
  const dezeWeek = metingen.filter(m => m.week === week);
  return {
    naam: d.naam || '',
    status: d.status,
    week,
    weken: WEKEN,
    startDatum: d.startDatum,
    ingevuldDezeWeek: dezeWeek.some(m => (m.soort || 'checkin') === 'checkin'),
    wegingenDezeWeek: dezeWeek.length,
    plan: d.plan ? {
      ...d.plan,
      // De vertaling naar echt eten komt uit lib/porties.js, dus de pagina
      // rekent zelf niets uit en kan nooit afwijken van het plan.
      week: d.plan.week.map(dag => {
        const porties = voorbeelddag(dag);
        return {
          ...dag, porties,
          fiets: dag.type === 'rust' ? null
            : ritVoeding({ uren: dag.uren, gPerUur: dag.koolhydratenPerUur }),
          recepten: dagSuggesties(dag, porties)
        };
      })
    } : null,
    ruilTip: ruilVanDeWeek(week),
    ruilen: { blok: BLOK, kh: ruiltabel('kh'), eiwit: ruiltabel('eiwit'), vet: ruiltabel('vet'), fiets: ruiltabel('fiets') },
    intakeNodig: !d.plan,
    startgewicht: start,
    huidigGewicht: nu,
    verschil: start != null && nu != null ? Math.round((nu - start) * 10) / 10 : null,
    metingen: gemiddelden.map(m => ({ week: m.week, gewicht: m.gewicht, aantal: m.aantal })),
    laatsteBijsturing: (d.bijsturingen || []).slice(-1)[0]?.kop || null,
    evaluaties: (d.evaluaties || []).map(e => ({ week: e.week, tekst: e.tekst })),
    // De draad zoals de klant hem ziet: zonder concepten en zonder vlaggen.
    berichten: (d.berichten || []).map(b => ({
      van: b.van, tekst: b.tekst, op: b.op
    })),
    wachtOpAntwoord: !!d.onbeantwoord
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
      case 'vragen':    return res.status(200).json({ ok: true, vragen: VRAGEN.map(v => ({
                          id: v.id, tekst: v.tekst,
                          opties: v.opties.map(o => ({ waarde: o.waarde, tekst: o.tekst }))  // punten blijven binnen
                        })) });
      case 'intake':    return await routeIntake(req, res);
      case 'checkin':   return await routeCheckin(req, res);
      case 'vraag':     return await routeVraag(req, res);
      case 'rij':       return await routeRij(req, res);
      case 'antwoord':  return await routeAntwoord(req, res);
      case 'herinner':  return await routeHerinner(req, res);
      default:          return res.status(400).json({ ok: false, fout: 'onbekende actie' });
    }
  } catch (e) {
    console.error('afvalprogramma fout:', e);
    return res.status(500).json({ ok: false, fout: 'serverfout' });
  }
}

// --- Woo-webhook: bestelling betaald ---------------------------------------
async function routeNieuw(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  if (WOO_SECRET && body.secret !== WOO_SECRET) return res.status(403).json({ ok: false });

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, fout: 'e-mail' });

  // Ontdubbelen op ordernummer: Woo stuurt een webhook soms twee keer.
  if (body.order) {
    const bestaat = await redis(['GET', `afval:order:${body.order}`]);
    if (bestaat.ok && bestaat.result) {
      return res.status(200).json({ ok: true, herhaling: true, id: bestaat.result });
    }
  }

  const id = crypto.randomBytes(8).toString('hex');
  const dossier = {
    id, email,
    naam: String(body.naam || '').slice(0, 80),
    order: body.order || null,
    besteldOp: new Date().toISOString(),
    startDatum: body.startDatum || START_DATUM,
    status: 'wacht-op-intake',
    intake: null, plan: null,
    metingen: [], bijsturingen: [], berichten: [], evaluaties: [], onbeantwoord: false
  };
  await bewaarDossier(dossier);
  await redis(['SADD', 'afval:actief', id]);
  if (body.order) await redis(['SET', `afval:order:${body.order}`, id, 'EX', String(BEWAARTERMIJN_S)]);

  const link = `${PAGINA_URL}?t=${maakDeelnemerToken(id)}`;
  await mail({
    naar: email,
    onderwerp: 'Welkom bij Het Afvalprogramma. Dit is je eigen pagina',
    html: welkomHtml(dossier, link)
  });
  await mail({
    naar: INTERN_NAAR,
    onderwerp: `Afvalprogramma: nieuwe deelnemer ${dossier.naam || email}`,
    html: `<p>${dossier.naam || ''} ${email}</p><p>Order ${dossier.order || '-'}</p>
           <p>Vergeet TrainingPeaks niet: schema toewijzen met startdatum ${dossier.startDatum}.</p>
           <p>Pagina: <a href="${link}">${link}</a></p>`
  });
  return res.status(200).json({ ok: true, id, link });
}

// --- Klantpagina haalt zijn plan op ----------------------------------------
async function routePlan(req, res) {
  const id = leesDeelnemerToken((req.query?.t || '').toString());
  if (!id) return res.status(403).json({ ok: false, fout: 'link ongeldig of verlopen' });
  const d = await haalDossier(id);
  if (!d) return res.status(404).json({ ok: false, fout: 'niet gevonden' });
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Intake: gegevens invullen, plan berekenen -----------------------------
async function routeIntake(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const id = leesDeelnemerToken(String(body.t || ''));
  if (!id) return res.status(403).json({ ok: false, fout: 'link ongeldig' });
  const d = await haalDossier(id);
  if (!d) return res.status(404).json({ ok: false });

  const invoer = {
    geslacht: body.geslacht === 'vrouw' ? 'vrouw' : 'man',
    leeftijd: Number(body.leeftijd),
    lengte: Number(body.lengte),
    gewicht: Number(body.gewicht),
    streefgewicht: Number(body.streefgewicht),
    werk: ['zittend', 'actief', 'zwaar'].includes(body.werk) ? body.werk : 'zittend',
    ftp: Number.isFinite(Number(body.ftp)) && Number(body.ftp) > 0 ? Number(body.ftp) : null,
    medisch: {
      diabetes: !!body.diabetes, zwanger: !!body.zwanger, eetstoornis: !!body.eetstoornis
    },
    week: (Array.isArray(body.week) ? body.week : []).slice(0, 7).map((x, i) => ({
      dag: ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'][i],
      type: DAGTYPES.includes(x?.type) ? x.type : 'rust',
      uren: Math.max(0, Math.min(8, Number(x?.uren) || 0))
    }))
  };

  const check = controleerVeiligheid(invoer);
  if (!check.mag) {
    await zetInRij(id, `intake geweigerd: ${check.reden}`);
    return res.status(200).json({ ok: false, geweigerd: true, reden: check.reden, uitleg: check.uitleg });
  }

  // --- Inschrijfkaart: Basis of Opbouw. Uitkomst is INTERN. ---
  const antwoorden = {};
  for (const v of VRAGEN) {
    const gegeven = String(body.kaart?.[v.id] || '');
    if (v.opties.some(o => o.waarde === gegeven)) antwoorden[v.id] = gegeven;
  }
  const uren = invoer.week.reduce((s, dag) => s + (dag.uren || 0), 0);
  const niveau = bepaalNiveau({ antwoorden, uren, ftp: invoer.ftp, gewicht: invoer.gewicht });

  const plan = berekenPlan(invoer);
  d.intake = invoer;
  d.kaart = antwoorden;
  d.niveau = niveau;              // staat in het dossier, niet in klantBeeld
  d.plan = plan;
  d.status = 'actief';
  d.metingen = [{ week: 0, gewicht: invoer.gewicht, gevoel: 'goed', etenGelukt: 'ja', op: new Date().toISOString() }];
  await bewaarDossier(d);

  if (niveau.niveau === 'twijfel') await zetInRij(id, 'niveaukeuze: twijfelgeval');

  await mail({
    naar: INTERN_NAAR,
    onderwerp: `Afvalprogramma: ${NIVEAUS[niveau.advies].naam} voor ${d.naam || d.email}${niveau.niveau === 'twijfel' ? ' (TWIJFEL)' : ''}`,
    html: `<p>${d.naam || ''} ${d.email}</p>
           <p>${invoer.geslacht}, ${invoer.leeftijd} jr, ${invoer.lengte} cm, ${invoer.gewicht} kg naar ${invoer.streefgewicht} kg, FTP ${invoer.ftp ?? 'onbekend'}, ${uren} uur per week.</p>
           <h3 style="margin:18px 0 6px">Schema: ${NIVEAUS[niveau.advies].naam}</h3>
           <ul><li>${niveauSamenvatting(niveau).join('</li><li>')}</li></ul>
           <p>Gemiddeld ${plan.gemiddeld} kcal/dag, eiwit ${plan.eiwit} g, verwacht ${plan.verwachtTempo} kg/week.</p>
           ${plan.waarschuwingen.length ? `<p><b>Let op:</b> ${plan.waarschuwingen.join(', ')}</p>` : ''}
           <p><b>Nalezen voordat de eerste ronde begint. Daarna het schema in TrainingPeaks zetten met startdatum ${d.startDatum}.</b></p>`
  });
  return res.status(200).json({ ok: true, ...klantBeeld(d) });
}

// --- Wekelijkse check-in ----------------------------------------------------
async function routeCheckin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const id = leesDeelnemerToken(String(body.t || ''));
  if (!id) return res.status(403).json({ ok: false, fout: 'link ongeldig' });
  const d = await haalDossier(id);
  if (!d || !d.plan) return res.status(400).json({ ok: false, fout: 'nog geen plan' });

  const gewicht = Number(body.gewicht);
  if (!Number.isFinite(gewicht) || gewicht < 40 || gewicht > 200) {
    return res.status(400).json({ ok: false, fout: 'gewicht klopt niet' });
  }
  const week = huidigeWeek(d);

  // Een losse weging tussendoor. Mag elke dag, telt mee in het weekgemiddelde,
  // maar stuurt het plan niet bij: dat gebeurt één keer per week bij de
  // officiële check-in. Vaker bijsturen heeft geen zin, want het duurt dagen
  // voordat een aanpassing zichtbaar is.
  if (body.alleenGewicht) {
    d.metingen = (d.metingen || []).concat({
      week, gewicht: Math.round(gewicht * 10) / 10,
      soort: 'weging', op: new Date().toISOString()
    });
    await bewaarDossier(d);
    return res.status(200).json({ ok: true, alleenGewicht: true, ...klantBeeld(d) });
  }

  const meting = {
    week,
    gewicht: Math.round(gewicht * 10) / 10,
    gevoel: ['goed', 'wisselend', 'slecht'].includes(body.gevoel) ? body.gevoel : 'goed',
    etenGelukt: ['ja', 'meestal', 'nee'].includes(body.etenGelukt) ? body.etenGelukt : 'meestal',
    soort: 'checkin',
    op: new Date().toISOString()
  };
  // De officiële check-in van deze week vervangen, maar losse wegingen van
  // dezelfde week laten staan; die horen in het gemiddelde thuis.
  d.metingen = (d.metingen || [])
    .filter(m => !(m.week === week && (m.soort || 'checkin') === 'checkin'))
    .concat(meting)
    .sort((a, b) => (a.week - b.week) || String(a.op).localeCompare(String(b.op)));

  const uit = wekelijkseBijsturing({
    metingen: d.metingen, plan: d.plan,
    gevoel: meting.gevoel, etenGelukt: meting.etenGelukt,
    streefgewicht: d.intake?.streefgewicht, lengte: d.intake?.lengte
  });

  if (uit.kcalAanpassing) d.plan = pasBijsturingToe(d.plan, uit.kcalAanpassing);
  d.bijsturingen = (d.bijsturingen || []).concat({ week, ...uit, op: new Date().toISOString() });
  await bewaarDossier(d);

  if (uit.naarMens) {
    await zetInRij(id, `check-in week ${week}: ${uit.regel}`);
    await mail({
      naar: INTERN_NAAR,
      onderwerp: `Afvalprogramma: ${d.naam || d.email} week ${week} — ${uit.regel}`,
      html: `<p><b>${uit.kop}</b></p><p>${uit.werktekst}</p>
             <p>Gewicht ${meting.gewicht} kg, trainingen ${meting.gevoel}, eten ${meting.etenGelukt}.</p>
             <p>Aanpassing die automatisch is doorgevoerd: ${uit.kcalAanpassing} kcal.</p>`
    });
  }
  if (isEvaluatieweek(week)) {
    await zetInRij(id, `evaluatie week ${week}`);
  }
  return res.status(200).json({ ok: true, bijsturing: { kop: uit.kop, regel: uit.regel }, ...klantBeeld(d) });
}

// --- Vraag aan de coach -----------------------------------------------------
async function routeVraag(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const id = leesDeelnemerToken(String(body.t || ''));
  if (!id) return res.status(403).json({ ok: false, fout: 'link ongeldig' });
  const d = await haalDossier(id);
  if (!d) return res.status(404).json({ ok: false });

  const tekst = String(body.tekst || '').trim().slice(0, 1200);
  if (tekst.length < 5) return res.status(400).json({ ok: false, fout: 'je bericht is leeg' });

  // Rem: één nieuwe vraag per week, anders wordt het een gesprekje en loopt de
  // goedkeuringstijd uit de hand. Een antwoord van Michel zet de rem weer vrij.
  const berichten = d.berichten || [];
  const laatsteVanMichel = [...berichten].reverse().find(b => b.van === 'michel');
  const openVanKlant = berichten.filter(b => b.van === 'klant' &&
    (!laatsteVanMichel || b.op > laatsteVanMichel.op));
  if (openVanKlant.length >= 2) {
    return res.status(200).json({ ok: false, rem: true,
      melding: 'Je vraag staat nog open. Zodra Michel geantwoord heeft, kun je er weer een stellen.' });
  }

  const bericht = {
    id: crypto.randomBytes(4).toString('hex'),
    van: 'klant', week: huidigeWeek(d), tekst,
    op: new Date().toISOString()
  };
  d.berichten = berichten.concat(bericht);

  // Laag 1: past er een antwoord uit Michels eigen bibliotheek op? Dan gaat dat
  // meteen de deur uit, want die tekst heeft hij zelf geschreven.
  const kant = await kantEnKlaarAntwoord(tekst, d);
  if (kant) {
    d.berichten.push({
      id: crypto.randomBytes(4).toString('hex'),
      van: 'michel', tekst: kant.tekst, op: new Date().toISOString(),
      automatisch: true, bron: kant.sleutel
    });
    d.onbeantwoord = false;
    await bewaarDossier(d);
    return res.status(200).json({ ok: true, direct: true, antwoord: kant.tekst });
  }

  // Laag 2: concept laten maken en in de rij zetten. Verstuurt niets.
  bericht.concept = await conceptAntwoord({ vraag: tekst, dossier: d });
  bericht.medisch = !!(bericht.concept && bericht.concept.startsWith('[MEDISCH]'));
  d.onbeantwoord = true;
  await bewaarDossier(d);
  await zetInRij(id, `bericht${bericht.medisch ? ' (MEDISCH)' : ''}`);
  await mail({
    naar: INTERN_NAAR,
    onderwerp: `Afvalprogramma: bericht van ${d.naam || d.email}${bericht.medisch ? ' (MEDISCH)' : ''}`,
    html: `<p><b>Vraag:</b><br>${tekst.replace(/\n/g, '<br>')}</p>
           <p><b>Concept (nog niet verstuurd):</b><br>${(bericht.concept || 'geen concept, Claude gaf niets terug').replace(/\n/g, '<br>')}</p>
           <p>Beantwoorden in je berichtenscherm.</p>`
  });
  return res.status(200).json({ ok: true, melding: 'Je bericht staat klaar. Michel kijkt ernaar, meestal binnen een werkdag.' });
}

// ===========================================================================
// ANTWOORDBIBLIOTHEEK — laag 1
// ===========================================================================
// HIER KOMEN MICHELS EIGEN ANTWOORDEN. Zolang deze lijst leeg is, gaat elke
// vraag gewoon naar de rij en verandert er niets aan hoe het nu werkt.
// Voeg er een toe zodra je een vraag voor de derde keer met de hand beantwoordt.
//
// vraag: waar gaat het over, in jouw woorden. Claude gebruikt dit om te matchen.
// tekst: het antwoord dat LETTERLIJK verstuurd wordt. Nooit door Claude herschreven.
export const BIBLIOTHEEK = [
  // Voorbeeld van de vorm, deze staat uit tot Michel hem goedkeurt:
  // {
  //   sleutel: 'alcohol',
  //   vraag: 'mag ik alcohol drinken tijdens het programma',
  //   tekst: 'Een biertje op zijn tijd hoeft niet te botsen met je doel...'
  // },
];

// Claude kiest alleen WELK antwoord past. Hij schrijft niets. Past er niets,
// dan geeft hij "geen" terug en gaat het bericht gewoon naar de rij.
async function kantEnKlaarAntwoord(vraag, dossier) {
  if (!BIBLIOTHEEK.length || !CLAUDE_KEY) return null;
  const lijst = BIBLIOTHEEK.map((b, i) => `${i + 1}. ${b.sleutel}: ${b.vraag}`).join('\n');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 16,
        system: 'Je krijgt een vraag van een deelnemer en een genummerde lijst met onderwerpen. Antwoord met ALLEEN het nummer van het onderwerp dat de vraag volledig beantwoordt, of met het woord geen. Twijfel je, antwoord dan geen. Gaat de vraag over iets medisch, over zijn persoonlijke cijfers of over iets dat niet in de lijst staat, antwoord dan geen.',
        messages: [{ role: 'user', content: `Onderwerpen:\n${lijst}\n\nVraag:\n${vraag}` }]
      })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const uit = (j.content || []).map(c => c.text || '').join('').trim().toLowerCase();
    const nr = parseInt(uit, 10);
    if (!Number.isFinite(nr) || nr < 1 || nr > BIBLIOTHEEK.length) return null;
    return BIBLIOTHEEK[nr - 1];
  } catch (e) { console.error('bibliotheek-match fout:', e); return null; }
}

// --- Intern: de rij bekijken ------------------------------------------------
// Alle deelnemers met hun draad, gesorteerd op wie het langst wacht. Dit is
// wat het berichtenscherm laat zien: links de lijst, rechts het gesprek.
async function routeRij(req, res) {
  if (!magIntern(req)) return res.status(403).json({ ok: false });
  const leden = await redis(['SMEMBERS', 'afval:actief']);
  const ids = leden.result || [];
  const uit = [];
  for (const id of ids) {
    const d = await haalDossier(id);
    if (!d) continue;
    const berichten = d.berichten || [];
    const laatste = berichten[berichten.length - 1] || null;
    const week = huidigeWeek(d);
    const laatsteMeting = (d.metingen || []).slice(-1)[0] || null;

    // Vlaggen: waarom deze persoon jouw aandacht vraagt.
    const vlaggen = [];
    if (d.onbeantwoord) vlaggen.push(berichten.some(b => b.van === 'klant' && b.medisch) ? 'medisch' : 'vraag');
    if (d.niveau?.niveau === 'twijfel') vlaggen.push('niveau');
    if (!d.plan) vlaggen.push('geen-intake');
    if (isEvaluatieweek(week) && !(d.evaluaties || []).some(e => e.week === week)) vlaggen.push('evaluatie');
    const bij = (d.bijsturingen || []).slice(-1)[0];
    if (bij?.naarMens) vlaggen.push('checkin');
    if (week > 0 && !(d.metingen || []).some(m => m.week === week)) vlaggen.push('niet-gewogen');

    uit.push({
      id, naam: d.naam, email: d.email, week, weken: WEKEN,
      status: d.status, vlaggen,
      niveau: d.niveau ? { keuze: d.niveau.niveau, advies: d.niveau.advies,
                           percentage: d.niveau.percentage, redenen: d.niveau.redenen } : null,
      laatsteBerichtOp: laatste?.op || null,
      voorbeeld: laatste ? laatste.tekst.slice(0, 90) : null,
      voorbeeldVan: laatste?.van || null,
      berichten: berichten.map(b => ({
        id: b.id, van: b.van, tekst: b.tekst, op: b.op,
        automatisch: !!b.automatisch, medisch: !!b.medisch, concept: b.concept || null
      })),
      metingen: (d.metingen || []).map(m => ({ week: m.week, gewicht: m.gewicht, gevoel: m.gevoel, etenGelukt: m.etenGelukt })),
      laatsteMeting,
      laatsteBijsturing: bij || null,
      evaluaties: (d.evaluaties || []).map(e => ({ week: e.week })),
      plan: d.plan ? { gemiddeld: d.plan.gemiddeld, verwachtTempo: d.plan.verwachtTempo,
                       eiwit: d.plan.eiwit, ondergrens: d.plan.ondergrens } : null,
      intake: d.intake ? { geslacht: d.intake.geslacht, leeftijd: d.intake.leeftijd,
                           lengte: d.intake.lengte, gewicht: d.intake.gewicht,
                           streefgewicht: d.intake.streefgewicht, ftp: d.intake.ftp } : null
    });
  }
  // Wie iets open heeft staan bovenaan, daarna op laatste bericht.
  uit.sort((a, b) => (b.vlaggen.length - a.vlaggen.length) ||
    String(b.laatsteBerichtOp || '').localeCompare(String(a.laatsteBerichtOp || '')));
  return res.status(200).json({ ok: true, deelnemers: uit });
}

// --- Intern: goedgekeurd antwoord of evaluatie versturen --------------------
async function routeAntwoord(req, res) {
  if (!magIntern(req)) return res.status(403).json({ ok: false });
  const body = await leesBody(req);
  const d = await haalDossier(String(body.id || ''));
  if (!d) return res.status(404).json({ ok: false });
  const tekst = String(body.tekst || '').trim();
  if (!tekst) return res.status(400).json({ ok: false, fout: 'lege tekst' });

  if (body.soort === 'evaluatie') {
    const week = Number(body.week) || huidigeWeek(d);
    d.evaluaties = (d.evaluaties || []).concat({ week, tekst, op: new Date().toISOString() });
    await bewaarDossier(d);
    await mail({
      naar: d.email,
      onderwerp: `Je evaluatie van week ${week}`,
      html: berichtHtml(d, `Je evaluatie van week ${week}`, tekst),
      antwoordNaar: INTERN_NAAR
    });
    return res.status(200).json({ ok: true });
  }

  // Gewoon bericht in de draad, verstuurd door een mens.
  d.berichten = (d.berichten || []).concat({
    id: crypto.randomBytes(4).toString('hex'),
    van: 'michel', tekst, op: new Date().toISOString()
  });
  d.onbeantwoord = false;
  await bewaarDossier(d);
  await mail({
    naar: d.email,
    onderwerp: 'Bericht van Michel',
    html: berichtHtml(d, 'Bericht van Michel', tekst),
    antwoordNaar: INTERN_NAAR
  });
  return res.status(200).json({ ok: true });
}

// --- Wekelijkse herinnering ------------------------------------------------
// Bedoeld om één keer per week te draaien, op de dag dat de check-in openstaat.
// Beveiligd met dezelfde interne sleutel, zodat niemand anders hem kan aftrappen.
//
// Aanzetten kan op twee manieren:
//   1. Vercel Cron, bijvoorbeeld elke maandag om 8 uur. Dat vraagt een
//      vercel.json in de repo, en op het Hobby-plan draait cron één keer per dag.
//   2. Een geplande taak die de url aanroept met de x-afval-sleutel-header.
//
// Twee weken niet ingevuld levert géén extra mail op maar een plek in de rij:
// dan moet er een mens achteraan, geen automaat.
async function routeHerinner(req, res) {
  if (!magIntern(req)) return res.status(403).json({ ok: false });
  const leden = await redis(['SMEMBERS', 'afval:actief']);
  const ids = leden.result || [];
  let gemaild = 0, overgeslagen = 0, naarRij = 0;

  for (const id of ids) {
    const d = await haalDossier(id);
    if (!d || !d.plan) { overgeslagen++; continue; }
    const week = huidigeWeek(d);
    if (week < 1 || week > WEKEN) { overgeslagen++; continue; }
    if ((d.metingen || []).some(m => m.week === week)) { overgeslagen++; continue; }

    // Vorige week ook niet ingevuld? Dan is dit geen herinnering meer.
    const vorige = week > 1 && !(d.metingen || []).some(m => m.week === week - 1);
    if (vorige) {
      await zetInRij(id, `twee weken niet ingevuld (week ${week})`);
      naarRij++;
      continue;
    }

    await mail({
      naar: d.email,
      onderwerp: `Week ${week}: even wegen`,
      html: herinneringHtml(d, week),
      antwoordNaar: INTERN_NAAR
    });
    gemaild++;
  }
  return res.status(200).json({ ok: true, gemaild, overgeslagen, naarRij, totaal: ids.length });
}

// ===========================================================================
// MAILSJABLONEN
// ===========================================================================
const STIJL = `font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px`;

function welkomHtml(d, link) {
  return `<div style="${STIJL}">
    <p>Hoi${d.naam ? ' ' + d.naam.split(' ')[0] : ''},</p>
    <p>Je zit in de eerste ronde van Het Afvalprogramma voor Wielrenners. We beginnen op maandag 2 november.</p>
    <p>Dit is je eigen pagina. Bewaar deze mail, want de link is persoonlijk:</p>
    <p><a href="${link}" style="background:#FF6B1A;color:#0a0a0a;padding:14px 24px;text-decoration:none;font-weight:bold;display:inline-block">Naar mijn programma</a></p>
    <p><b>Wat je nu al doet:</b> vul op je pagina je gegevens in. Dan staat je plan klaar op het moment dat week 1 begint.</p>
    <p>Je schema in TrainingPeaks zet ik er handmatig in. Je krijgt daar apart bericht van.</p>
    <p>Tot maandag,<br>Michel</p>
  </div>`;
}

function herinneringHtml(d, week) {
  const link = `${PAGINA_URL}?t=${maakDeelnemerToken(d.id)}`;
  const start = (d.metingen || [])[0]?.gewicht;
  const laatst = (d.metingen || []).slice(-1)[0]?.gewicht;
  const verschil = (start != null && laatst != null)
    ? Math.round((laatst - start) * 10) / 10 : null;
  return `<div style="${STIJL}">
    <p>Hoi${d.naam ? ' ' + d.naam.split(' ')[0] : ''},</p>
    <p>Week ${week} van ${WEKEN}. Even op de weegschaal en invullen hoe je week ging, dan reken ik je plan voor de komende week door.</p>
    ${verschil != null && verschil < 0
      ? `<p>Tot nu toe ben je <b>${Math.abs(verschil)} kilo</b> lichter dan bij de start.</p>` : ''}
    <p><a href="${link}" style="background:#FF6B1A;color:#0a0a0a;padding:14px 24px;text-decoration:none;font-weight:bold;display:inline-block">Invullen, twee minuten</a></p>
    <p style="font-size:13px;color:#666">Weeg nuchter, na het toilet en voor het ontbijt. Eén dag met een kilo verschil zegt niets, de lijn over drie weken wel.</p>
    <p>Michel</p>
  </div>`;
}

function berichtHtml(d, kop, tekst) {
  return `<div style="${STIJL}">
    <p>Hoi${d.naam ? ' ' + d.naam.split(' ')[0] : ''},</p>
    <p>${tekst.replace(/\n/g, '<br>')}</p>
    <p>Michel</p>
    <p style="font-size:13px;color:#666">Je programmapagina: <a href="${PAGINA_URL}?t=${maakDeelnemerToken(d.id)}">open hem hier</a></p>
  </div>`;
}
