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
import { zetLidmaatschap, wisCore } from './core.js';
import { wisPersoon } from '../lib/app-opruimen.js';
import { maakMollieFactuur } from '../lib/mollie-factuur.js';
import { planNaam, laadPlan } from '../lib/schema-app.js';
import { browserContext, stuurPurchase } from '../lib/meta-capi.js';
import { appMelding } from '../lib/app-melding.js';
import { overzicht as gebruikOverzicht } from '../lib/stat.js';
import zlib from 'node:zlib';

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
  await redis(['SADD', 'lid:alle', email]);
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
// ---- Na lid worden (09-10-2026): welkom, win-back, weekoverzicht, back-up ----
const knopHtml = (url, tekst) => `<p style="margin:22px 0 26px"><a href="${url}" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">${tekst}</a></p>`;
// WhatsApp-link met een kant-en-klaar berichtje en de persoonlijke link erin.
const waLink = (code) => 'https://wa.me/?text=' + encodeURIComponent(`Ik train met de MKC-app van Michel Kreder: bandenspanning, kleding en voeding voor elke rit, core-oefeningen en een eigen coach. Via mijn link krijgen we allebei 50% korting op een maand: ${APP_URL}?vriend=${code}`);
async function welkomMail(email, lid, naar) {
  const voornaam = String(lid.naam || '').split(' ')[0];
  const code = vriendCode(email);
  await redis(['SET', `lid:vriend:${code}`, email]);
  return jaarMail(naar || email, (naar ? '[Voorbeeld] ' : '') + (voornaam ? `Welkom in de MKC-app, ${voornaam}` : 'Welkom in de MKC-app'), mailHuls(`<p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
    <p>Wat leuk dat je erbij bent. Vanaf nu heb je alles op één plek: je bandenspanning, kleding en ritvoeding voor elke rit, de Core-app en je eigen coach die je vragen beantwoordt.</p>
    <p>Drie dingen die ik je deze week zou aanraden:</p>
    <p><b>Zet de app op je beginscherm.</b> Open de app op je telefoon, tik op delen en kies Zet op beginscherm. Dan heb je hem altijd bij de hand, en krijg je je ochtendbericht met het weer van je rit.</p>
    <p><b>Vul je fietsen en gewicht in</b> bij Vandaag rijden. Dan zie je voor elke rit wat je pompt, wat je aantrekt en wat je meeneemt.</p>
    <p><b>Start de Core-app.</b> Korte sessies van een kwartier, een paar keer per week. Je merkt het het eerst op lange ritten, in je onderrug en je nek.</p>
    ${knopHtml(APP_URL, 'Open de app')}
    <p>Fiets je samen met anderen? Nodig een vriend of vriendin uit. Die krijgt de eerste maand voor €9,50, en jij 50% korting op je volgende maand.</p>
    <p><a href="${waLink(code)}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:700">Nodig uit via WhatsApp</a></p>
    <p>Loop je ergens tegenaan of heb je een vraag? Stel hem aan de coach in de app, of mail me gewoon terug.</p>`));
}
// Oud-leden terughalen: 14 dagen na het einde één persoonlijke mail, afgestemd op
// hun opzegreden. Winterstop krijgt hem in het voorjaar (maart of april).
const WINBACK_REGEL = {
  'te-duur': 'Je gaf aan dat het te duur was. Daarom mag je terugkomen voor €9,50 voor je eerste maand. Daarna €19 per maand, en altijd opzegbaar.',
  'te-weinig': 'Je gaf aan dat je de app te weinig gebruikte. Een tip als je terugkomt: zet het ochtendbericht aan. Dan krijg je elke ochtend vanzelf je bandenspanning en kleding voor je rit, zonder dat je eraan hoeft te denken.',
  winterstop: 'Het voorjaar komt eraan en de eerste lange ritten staan weer op de planning. Een mooi moment om weer in te stappen.',
  'mist-iets': 'Je gaf aan dat je iets miste. Vertel me gerust wat je zocht, mail me gewoon terug. Ik bouw de app elke maand verder uit.'
};
async function winbackRonde() {
  const l = await redis(['SMEMBERS', 'lid:alle']);
  let n = 0; const maand = new Date().getMonth();
  for (const email of (l.ok && l.result) || []) {
    const lid = await haalLid(email);
    if (!lid || lid.winbackGemaild || lid.verwijderdOp || !lid.betaaldOoit || lid.subscriptionId || !lid.tot) continue;
    if (!['opgezegd', 'verlopen', 'achterstand'].includes(lid.status)) continue;
    const dagenWeg = (Date.now() - Date.parse(lid.tot)) / 86400000;
    if (dagenWeg < 14 || dagenWeg > 200) continue;
    const reden = (lid.opzegReden && lid.opzegReden.reden) || '';
    if (reden === 'winterstop' && !(maand === 2 || maand === 3)) continue;
    if (reden !== 'winterstop' && dagenWeg > 30) continue;
    const voornaam = String(lid.naam || '').split(' ')[0];
    lid.winbackTot = new Date(Date.now() + 30 * 86400000).toISOString();
    const ok = await jaarMail(email, 'Ik mis je in de MKC-app', winbackHtml(voornaam, reden));
    if (ok) { lid.winbackGemaild = new Date().toISOString(); await bewaarLid(email, lid); n++; }
  }
  return n;
}
// Voorbeeldmails naar Michel zelf (Beheer), om de teksten te bekijken.
function winbackHtml(voornaam, reden) {
  return mailHuls(`<p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
      <p>Je lidmaatschap van de MKC-app is een tijdje geleden gestopt. Je fietsen, je ritten en je Core-voortgang staan nog gewoon voor je klaar.</p>
      ${WINBACK_REGEL[reden] ? `<p>${WINBACK_REGEL[reden]}</p>` : ''}
      <p>Kom je terug, dan is je eerste maand €9,50 in plaats van €19. Dat aanbod staat 30 dagen voor je klaar.</p>
      ${knopHtml(APP_URL + '#lid', 'Kom terug voor €9,50')}
      <p style="color:#555;font-size:14px">Geen interesse? Dan hoor je hierover niets meer van me.</p>`);
}
async function routeVoorbeeld(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email || !BEHEER_LID.includes(email)) return res.status(403).json({ ok: false });
  const naar = 'michel.kredercoaching@gmail.com';
  const a = await welkomMail(email, { naam: 'Michel Kreder' }, naar);
  const b = await jaarMail(naar, '[Voorbeeld] Ik mis je in de MKC-app (reden: te duur)', winbackHtml('Michel', 'te-duur'));
  return res.status(200).json({ ok: a && b });
}

// Weekoverzicht voor Michel, maandagochtend.
async function routeWeekoverzicht(req, res) {
  const cron = process.env.CRON_SECRET || '';
  if (!cron || String(req.headers?.authorization || '') !== `Bearer ${cron}`) return res.status(401).json({ ok: false });
  const week = Date.now() - 7 * 86400000, binnen = (x) => x && Date.parse(x) > week;
  const l = await redis(['SMEMBERS', 'lid:alle']);
  const nieuw = [], weg = [], mislukt = [], terug = [];
  for (const email of (l.ok && l.result) || []) {
    const lid = await haalLid(email); if (!lid) continue;
    if (binnen(lid.sinds) && lid.bron === 'betaald') nieuw.push(`${lid.naam || email} (${planVan(lid.plan) === 'jaar' ? 'jaar' : 'maand'}${lid.vriendVan ? ', via een maat' : ''})`);
    if (binnen(lid.opgezegdOp)) weg.push(`${lid.naam || email}: ${OPZEG_NAMEN_MAIL[(lid.opzegReden && lid.opzegReden.reden) || 'geen'] || 'geen reden'}${lid.opzegReden && lid.opzegReden.toelichting ? ' (&ldquo;' + lid.opzegReden.toelichting + '&rdquo;)' : ''}`);
    if (lid.mislukt && binnen(lid.mislukt.op)) mislukt.push(lid.naam || email);
    if (binnen(lid.winbackGemaild)) terug.push(lid.naam || email);
  }
  const ov = await ledenOverzicht();
  const g = await gebruikOverzicht(7);
  const gem = Math.round(g.dagen.reduce((t, d) => t + d.actief, 0) / Math.max(1, g.dagen.length));
  const top = g.namen.map(([k, naam]) => [naam, g.dagen.reduce((t, d) => t + ((d.per[k] && d.per[k].keer) || 0), 0)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const lijst = (titel, xs) => `<h3 style="margin:18px 0 4px;font-size:16px">${titel} (${xs.length})</h3>${xs.length ? '<ul style="margin:0;padding-left:18px">' + xs.map((x) => `<li>${x}</li>`).join('') + '</ul>' : '<p style="margin:0;color:#777">Geen.</p>'}`;
  const tel = ov.tel || {};
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:600px">
    <h2 style="margin:0 0 6px">De MKC-app deze week</h2>
    <p style="margin:0"><b>€${ov.mrr} per maand</b> aan lidmaatschappen &middot; ${(tel['betaald-maand'] || 0) + (tel['betaald-jaar'] || 0)} betalende leden (${tel['betaald-maand'] || 0} per maand, ${tel['betaald-jaar'] || 0} per jaar) &middot; ${(tel['coaching-flex'] || 0) + (tel['coaching-premium'] || 0)} via coaching &middot; ${tel.schema || 0} via een schema</p>
    ${lijst('Nieuwe leden', nieuw)}${lijst('Opgezegd', weg)}${lijst('Betaling mislukt', mislukt)}${lijst('Terugkom-mail gestuurd', terug)}
    <h3 style="margin:18px 0 4px;font-size:16px">Gebruik</h3>
    <p style="margin:0">Gemiddeld ${gem} mensen per dag in de app.</p>
    ${top.length ? '<ul style="margin:4px 0 0;padding-left:18px">' + top.map(([n, k]) => `<li>${n}: ${k}x</li>`).join('') + '</ul>' : ''}
    <p style="margin-top:20px;color:#777;font-size:13px">Alles in detail: Beheer in de app.</p></div>`;
  await jaarMail('michel.kredercoaching@gmail.com', `MKC-app week: ${nieuw.length} nieuw, ${weg.length} opgezegd, €${ov.mrr}/mnd`, html);
  return res.status(200).json({ ok: true, nieuw: nieuw.length, weg: weg.length });
}
const OPZEG_NAMEN_MAIL = { 'te-duur': 'te duur', 'te-weinig': 'gebruikt het te weinig', winterstop: 'even geen tijd of winterstop', 'mist-iets': 'mist iets', anders: 'iets anders', geen: 'geen reden' };
// Wekelijkse back-up van de ledengegevens als bijlage naar Michel (zondagnacht).
// Lidmaatschappen, schema-koppelingen en de sets. Geen Core-dossiers: daar staan
// gezondheidsgegevens in, die gaan niet per mail. Betalingen staan ook in Mollie.
async function routeBackup(req, res) {
  const cron = process.env.CRON_SECRET || '';
  if (!cron || String(req.headers?.authorization || '') !== `Bearer ${cron}`) return res.status(401).json({ ok: false });
  const sets = {};
  for (const k of ['lid:alle', 'lid:coaching', 'lid:schema', 'lid:handmatig', 'lid:cadeau']) { const r = await redis(['SMEMBERS', k]); sets[k] = (r.ok && r.result) || []; }
  const leden = {}, schemas = {};
  for (const email of sets['lid:alle']) {
    const r = await redis(['GET', `lid:${email}`]); if (r.ok && r.result) { try { leden[email] = JSON.parse(r.result); } catch {} }
    const s = await redis(['GET', `schema:${email}`]); if (s.ok && s.result) { try { schemas[email] = JSON.parse(s.result); } catch {} }
  }
  const datum = new Date().toISOString().slice(0, 10);
  const inhoud = zlib.gzipSync(Buffer.from(JSON.stringify({ gemaakt: new Date().toISOString(), sets, leden, schemas })));
  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ ok: false });
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Michel Kreder <michel@michelkredercoaching.nl>', to: 'michel.kredercoaching@gmail.com', subject: `Back-up MKC-app leden ${datum}`,
      html: `<p style="font-family:Arial,sans-serif">Wekelijkse back-up van de MKC-app: ${Object.keys(leden).length} leden en ${Object.keys(schemas).length} schema's. Bewaar deze mail; bij een probleem zet Claude alles hiermee terug. Core-voortgang zit er bewust niet in (gezondheidsgegevens).</p>`,
      attachments: [{ filename: `mkc-app-backup-${datum}.json.gz`, content: inhoud.toString('base64') }] }), signal: AbortSignal.timeout(15000) });
  return res.status(200).json({ ok: r.ok, leden: Object.keys(leden).length, kb: Math.round(inhoud.length / 1024) });
}

// ---- Leden extra (09-10-2026): pauze, verwijderen, facturen, maat uitnodigen ----
export const OPZEG_REDENEN = ['te-duur', 'te-weinig', 'winterstop', 'mist-iets', 'anders'];
const VRIEND_BEDRAG = '9.50', VRIEND_MAX = 12;
function vriendCode(email) { return crypto.createHmac('sha256', SECRET || 'mkc').update('vriend|' + email).digest('hex').slice(0, 8); }
async function lidUitToken(req, res, t) {
  const email = leesAppToken(String(t || ''));
  if (!email) { res.status(401).json({ ok: false, fout: 'Log opnieuw in.' }); return null; }
  return email;
}
// Pauze in plaats van opzeggen: één keer een maand gratis, daarna loopt het door.
async function routePauze(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = await lidUitToken(req, res, body.t); if (!email) return;
  const lid = await haalLid(email);
  if (!lid || !lidBeeld(lid).pauzeKan) return res.status(400).json({ ok: false, fout: 'Pauzeren kan nu niet.' });
  const nieuw = plusMaanden(new Date(incassoOp(lid)), 1);
  const s = await mollie(`/customers/${lid.customerId}/subscriptions/${lid.subscriptionId}`, { method: 'PATCH', body: JSON.stringify({ startDate: dag(nieuw) }) });
  if (!s.ok) { await meldIntern(`PAUZE MISLUKT - ${email}`, `Abonnement ${lid.subscriptionId} kon niet een maand opschuiven: ${JSON.stringify(s.j).slice(0, 300)}`); return res.status(502).json({ ok: false, fout: 'Pauzeren lukte niet. Ik kijk ernaar.' }); }
  lid.tot = plusDagen(nieuw, SPELING_DAGEN).toISOString(); lid.pauzeGehad = new Date().toISOString();
  await redis(['HINCRBY', 'lid:opzegredenen', 'pauze-gekozen', 1]);
  await bewaarLid(email, lid);
  await zetLidmaatschap({ email, naam: lid.naam, tot: lid.tot, stil: true });
  return res.status(200).json({ ok: true, lid: lidBeeld(lid) });
}
// Account verwijderen op verzoek: abonnement stoppen, appgegevens en Core weg.
// Lidmaatschap- en factuurgegevens blijven (wettelijke bewaarplicht).
async function routeVerwijder(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = await lidUitToken(req, res, body.t); if (!email) return;
  if (body.bevestig !== true) return res.status(400).json({ ok: false });
  const lid = await haalLid(email);
  if (lid && lid.subscriptionId) await mollie(`/customers/${lid.customerId}/subscriptions/${lid.subscriptionId}`, { method: 'DELETE' });
  await wisPersoon(email);
  await wisCore(email);
  if (lid) { lid.status = 'verwijderd'; lid.subscriptionId = null; lid.tot = new Date().toISOString(); lid.verwijderdOp = lid.tot; await bewaarLid(email, lid); }
  await redis(['SREM', 'lid:coaching', email]);
  await mcTag(email, 'mkc-lid', false); await mcTag(email, 'mkc-app', false);
  await meldIntern(`ACCOUNT VERWIJDERD - ${email}`, `${email} heeft zijn account in de MKC-app verwijderd. Appgegevens en Core zijn gewist, een lopend abonnement is gestopt. Facturen en lidmaatschapsgegevens blijven bewaard. Staat hij ook in TrainingPeaks of Mailchimp en wil hij daar weg, dan doe je dat met de hand.`);
  return res.status(200).json({ ok: true });
}
async function routeFacturen(req, res) {
  const email = await lidUitToken(req, res, req.query?.t); if (!email) return;
  const lid = await haalLid(email);
  return res.status(200).json({ ok: true, facturen: ((lid && lid.facturen) || []).map(({ id, nr, bedrag, op, omschrijving }) => ({ id, nr, bedrag, op, omschrijving })) });
}
async function routeFactuurPdf(req, res) {
  const email = await lidUitToken(req, res, req.query?.t); if (!email) return;
  const lid = await haalLid(email);
  const f = ((lid && lid.facturen) || []).find((x) => x.id === String(req.query?.id || ''));
  if (!f) return res.status(404).json({ ok: false, fout: 'Factuur niet gevonden.' });
  const r = await fetch(`https://api.mollie.com/v2/sales-invoices/${f.id}`, { headers: { Authorization: `Bearer ${MOLLIE_KEY}`, Accept: 'application/pdf' } });
  if (!r.ok) return res.status(502).json({ ok: false, fout: 'De factuur ophalen lukte niet.' });
  const buf = Buffer.from(await r.arrayBuffer());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Factuur-${(f.nr || f.id).replace(/[^A-Za-z0-9-]/g, '')}.pdf"`);
  return res.status(200).send(buf);
}
// Maat uitnodigen: persoonlijke link. De maat betaalt de eerste maand de helft,
// het lid krijgt een maand gratis zodra die maat betaald heeft (max 12 per jaar).
async function routeVriend(req, res) {
  const email = await lidUitToken(req, res, req.query?.t); if (!email) return;
  const lid = await haalLid(email);
  if (!lid || !lidBeeld(lid).vriendKan) return res.status(400).json({ ok: false, fout: 'Uitnodigen kan als je lid bent.' });
  const code = vriendCode(email);
  await redis(['SET', `lid:vriend:${code}`, email]);
  return res.status(200).json({ ok: true, code, url: `${APP_URL}?vriend=${code}`, whatsapp: waLink(code), beloningen: lid.vriendBeloningen || 0 });
}
async function beloonVriend(code, maatEmail, maatNaam) {
  const v = await redis(['GET', `lid:vriend:${code}`]);
  const email = v.ok && v.result; if (!email || email === maatEmail) return;
  const lid = await haalLid(email); if (!lid) return;
  const jaar = new Date().getFullYear();
  if (lid.vriendJaar !== jaar) { lid.vriendJaar = jaar; lid.vriendBeloningen = 0; }
  if ((lid.vriendBeloningen || 0) >= VRIEND_MAX) return;
  // Beide 50% (besluit Michel 09-10-2026): maandlid betaalt zijn volgende maand
  // €9,50 (abonnement tijdelijk omlaag, na die incasso weer €19). Jaarlid of
  // zonder abonnement: 15 dagen erbij, dezelfde waarde.
  let tekstBeloning;
  if (lid.subscriptionId && lid.status === 'actief' && planVan(lid.plan) === 'maand') {
    lid.kortingTegoed = (lid.kortingTegoed || 0) + 1;
    if (!lid.kortingActief) {
      const s = await mollie(`/customers/${lid.customerId}/subscriptions/${lid.subscriptionId}`, { method: 'PATCH', body: JSON.stringify({ amount: { currency: 'EUR', value: VRIEND_BEDRAG } }) });
      if (!s.ok) { await meldIntern(`MAAT-BELONING MISLUKT - ${email}`, `50% voor ${email} (maat ${maatEmail}) lukte niet in Mollie: ${JSON.stringify(s.j).slice(0, 300)}. Zet de volgende incasso met de hand op €9,50.`); return; }
      lid.kortingActief = true;
    }
    tekstBeloning = 'Je volgende maand kost de helft: €9,50.';
  } else if (lid.tot && Date.parse(lid.tot) > Date.now()) {
    lid.tot = plusDagen(lid.tot, 15).toISOString();
    tekstBeloning = 'Je krijgt er een halve maand bij.';
  } else return;
  lid.vriendBeloningen = (lid.vriendBeloningen || 0) + 1;
  await bewaarLid(email, lid);
  await zetLidmaatschap({ email, naam: lid.naam, tot: lid.tot, stil: true });
  const vn = String(maatNaam || '').split(' ')[0] || 'Je maat';
  await appMelding(email, { soort: 'vriend', titel: '50% korting voor jou', tekst: `${vn} is lid geworden via jouw link. ${tekstBeloning}`, link: '/app#lid' });
}

// ---- Jaarlid: na een jaar zelf kiezen (09-10-2026) -----------------------------
// Zoals in de voorwaarden: een maand voor de verlenging krijgt een jaarlid
// bericht en kiest nog een jaar (€149) of per maand verder (€19). Kiest hij
// niets, dan zetten we het abonnement 7 dagen voor de verlenging om naar per
// maand (maandelijks opzegbaar). De incassodatum blijft hetzelfde.
const KEUZE_VANAF = 30, KEUZE_STANDAARD = 7;
const incassoOp = (lid) => lid.tot ? Date.parse(lid.tot) - SPELING_DAGEN * 86400000 : null;
function jaarKeuzeBeeld(lid) {
  if (planVan(lid.plan) !== 'jaar' || !lid.subscriptionId || lid.status !== 'actief') return {};
  const dagen = (incassoOp(lid) - Date.now()) / 86400000;
  if (!(dagen <= KEUZE_VANAF && dagen > 0)) return {};
  return { jaarKeuze: { open: true, gekozen: lid.jaarKeuze === lid.tot ? 'jaar' : null, op: dag(incassoOp(lid)) } };
}
async function naarMaand(lid, email) {
  const s = await mollie(`/customers/${lid.customerId}/subscriptions/${lid.subscriptionId}`, { method: 'PATCH', body: JSON.stringify({
    amount: { currency: 'EUR', value: PLANNEN.maand.bedrag }, interval: PLANNEN.maand.interval, description: OMSCHRIJVING,
    startDate: dag(Math.max(incassoOp(lid), Date.now() + 86400000)), metadata: { email, plan: 'maand' } }) });
  if (!s.ok) { await meldIntern(`JAARLID OMZETTEN MISLUKT - ${email}`, `Het jaarabonnement ${lid.subscriptionId} van ${email} kon niet naar per maand: ${JSON.stringify(s.j).slice(0, 300)}. Zet het handmatig om in Mollie (€19, 1 month).`); return false; }
  lid.plan = 'maand'; lid.jaarKeuze = null;
  return true;
}
async function jaarMail(email, onderwerp, html) {
  const key = process.env.RESEND_API_KEY; if (!key) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Michel Kreder <michel@michelkredercoaching.nl>', to: email, subject: onderwerp, html }), signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch { return false; }
}
const mailHuls = (binnen) => `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:560px">${binnen}<p>Sportieve groet,<br>Michel</p></div>`;
async function jaarKeuzeRonde() {
  const l = await redis(['SMEMBERS', 'lid:alle']);
  let gevraagd = 0, omgezet = 0;
  for (const email of (l.ok && l.result) || []) {
    const lid = await haalLid(email);
    if (!lid || planVan(lid.plan) !== 'jaar' || !lid.subscriptionId || lid.status !== 'actief' || !lid.tot) continue;
    const dagen = (incassoOp(lid) - Date.now()) / 86400000;
    if (dagen <= 0 || dagen > KEUZE_VANAF) continue;
    const voornaam = String(lid.naam || '').split(' ')[0], datum = new Date(incassoOp(lid)).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
    if (dagen > KEUZE_STANDAARD && lid.jaarVraagVoor !== lid.tot && lid.jaarKeuze !== lid.tot) {
      await jaarMail(email, 'Je jaar in de MKC-app zit er bijna op', mailHuls(`<p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
        <p>Over een maand zit je eerste jaar in de MKC-app erop. Fijn dat je erbij bent. Nu mag je zelf kiezen hoe je verdergaat.</p>
        <p><b>Nog een jaar</b> voor €149, dan blijf je het voordeligst uit. Of <b>per maand verder</b> voor €19, dan kun je elke maand opzeggen.</p>
        <p style="margin:22px 0 26px"><a href="${APP_URL}#lid" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">Kies in de app</a></p>
        <p style="color:#555;font-size:14px">Kies je niets, dan ga je vanaf ${datum} gewoon per maand verder. Alles wat je deed blijft staan.</p>`));
      await appMelding(email, { soort: 'lid', titel: 'Kies hoe je verdergaat', tekst: `Je jaar zit er op ${datum} op. Nog een jaar voor €149 of per maand verder voor €19? Kies onder Mijn lidmaatschap.`, link: '/app#lid' });
      lid.jaarVraagVoor = lid.tot; await bewaarLid(email, lid); gevraagd++;
    } else if (dagen <= KEUZE_STANDAARD && lid.jaarKeuze !== lid.tot) {
      if (await naarMaand(lid, email)) {
        await bewaarLid(email, lid); omgezet++;
        await jaarMail(email, 'Je gaat per maand verder in de MKC-app', mailHuls(`<p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
          <p>Je hebt geen keuze gemaakt voor na je eerste jaar, dus je gaat vanaf ${datum} per maand verder voor €19. Je kunt elke maand opzeggen in de app.</p>
          <p style="color:#555;font-size:14px">Toch liever nog een jaar? Mail me even terug, dan zet ik het voor je om.</p>`));
      }
    }
  }
  return { gevraagd, omgezet };
}
async function routeJaarKeuze(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await leesBody(req);
  const email = leesAppToken(String(body.t || ''));
  if (!email) return res.status(401).json({ ok: false, fout: 'Log opnieuw in.' });
  const lid = await haalLid(email);
  if (!lid || !jaarKeuzeBeeld(lid).jaarKeuze) return res.status(400).json({ ok: false, fout: 'Er valt nu niets te kiezen.' });
  if (body.keuze === 'jaar') lid.jaarKeuze = lid.tot;
  else if (body.keuze === 'maand') { if (!(await naarMaand(lid, email))) return res.status(502).json({ ok: false, fout: 'Omzetten lukte niet. Ik kijk ernaar en laat het je weten.' }); }
  else return res.status(400).json({ ok: false });
  await bewaarLid(email, lid);
  return res.status(200).json({ ok: true, lid: lidBeeld(lid) });
}

function lidBeeld(lid) {
  if (!lid) return { status: 'geen' };
  const open = lid.tot && Date.now() < Date.parse(lid.tot);
  const plan = planVan(lid.plan);
  return { status: lid.status, tot: lid.tot ? dag(lid.tot) : null, open: !!open, sinds: lid.sinds ? dag(lid.sinds) : null, plan, bedrag: PLANNEN[plan].bedrag, handmatig: !!lid.handmatig && !lid.subscriptionId, ...jaarKeuzeBeeld(lid), pauzeKan: planVan(lid.plan) === 'maand' && !!lid.subscriptionId && lid.status === 'actief' && !lid.pauzeGehad, facturen: (lid.facturen || []).length, terugAanbod: !!(lid.winbackTot && Date.parse(lid.winbackTot) > Date.now()), vriendKan: !!lid.subscriptionId && lid.status === 'actief', bron: lid.bron === 'coaching' && !lid.subscriptionId ? 'coaching' : lid.bron === 'schema' && !lid.subscriptionId && !lid.handmatig ? (lid.cadeauMaand ? 'cadeau' : 'schema') : 'betaald', coaching: lid.coaching || null };
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
    if (actie === 'jaarkeuze') return await routeJaarKeuze(req, res);
    if (actie === 'pauze') return await routePauze(req, res);
    if (actie === 'weekoverzicht') return await routeWeekoverzicht(req, res);
    if (actie === 'voorbeeld') return await routeVoorbeeld(req, res);
    if (actie === 'backup') return await routeBackup(req, res);
    if (actie === 'verwijder') return await routeVerwijder(req, res);
    if (actie === 'facturen') return await routeFacturen(req, res);
    if (actie === 'factuur') return await routeFactuurPdf(req, res);
    if (actie === 'vriend') return await routeVriend(req, res);
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
  // Akkoord met directe toegang (afstand bedenktijd) en voorwaarden, verplicht
  // en vastgelegd met tijdstip (09-10-2026).
  if (body.akkoord !== true) return res.status(400).json({ ok: false, fout: 'Vink eerst aan dat je direct toegang wil en akkoord gaat met de voorwaarden.' });
  lid.akkoord = { op: new Date().toISOString(), versie: 'voorwaarden-2026-10-09' };
  // Factuurgegevens (09-10-2026), bewaard voor alle facturen van dit lid.
  const fb = body.factuur && typeof body.factuur === 'object' ? body.factuur : null;
  if (fb) { const k = (x, n) => String(x || '').replace(/[<>]/g, '').trim().slice(0, n); lid.factuur = { naam: k(fb.naam, 80), land: fb.land === 'BE' ? 'BE' : 'NL', postcode: k(fb.postcode, 10), huisnummer: k(fb.huisnummer, 12), straat: k(fb.straat, 80), plaats: k(fb.plaats, 60) }; if (lid.factuur.naam) lid.naam = lid.factuur.naam; }
  const automatisch = await incassoKlaar();
  // Mislukte incasso bijwerken (09-10-2026): nieuwe machtiging, en in de webhook
  // stopt het oude abonnement en loopt het nieuwe door op de oude datum.
  const herstel = lid.status === 'achterstand' && !!lid.subscriptionId && automatisch;
  // Via een maat (09-10-2026): eerste maand voor de helft, alleen per maand en
  // alleen voor wie nog nooit betaald lid was.
  let vriendVan = null;
  const vc = String(body.vriend || '').replace(/[^a-z0-9]/gi, '').slice(0, 12);
  if (vc && !herstel && automatisch && planVan(body.plan) === 'maand' && !lid.betaaldOoit && lid.bron !== 'betaald') {
    const v = await redis(['GET', `lid:vriend:${vc}`]);
    if (v.ok && v.result && v.result !== email) vriendVan = vc;
  }

  // Terugkomen na een win-back-mail: eerste maand ook €9,50 (30 dagen geldig).
  const terug = !herstel && !vriendVan && automatisch && planVan(body.plan) === 'maand' && lid.winbackTot && Date.parse(lid.winbackTot) > Date.now();

  // Eén Mollie-klant per mailadres, hergebruiken bij opnieuw lid worden.
  if (!lid.customerId) {
    const k = await mollie('/customers', { method: 'POST', body: JSON.stringify({ name: String(body.naam || '').slice(0, 80) || email, email, metadata: { bron: 'mkc-app' } }) });
    if (!k.ok) return res.status(502).json({ ok: false, fout: 'Betalen lukt nu even niet. Probeer het zo nog eens.' });
    lid.customerId = k.j.id;
    lid.naam = String(body.naam || '').slice(0, 80);
    lid.status = lid.status || 'nieuw';
    await bewaarLid(email, lid);
  }

  await bewaarLid(email, lid);   // akkoord altijd vastleggen
  const plan = herstel ? planVan(lid.plan) : planVan(body.plan);
  const p = await mollie('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: { currency: 'EUR', value: vriendVan || terug ? VRIEND_BEDRAG : PLANNEN[plan].bedrag },
      description: herstel ? `${OMSCHRIJVING}, betaling bijwerken` : vriendVan ? `${OMSCHRIJVING}, eerste maand (via een maat)` : automatisch
        ? (plan === 'jaar' ? `${OMSCHRIJVING}, eerste jaar` : `${OMSCHRIJVING}, eerste maand`)
        : (plan === 'jaar' ? `${OMSCHRIJVING}, 1 jaar` : `${OMSCHRIJVING}, 1 maand`),
      customerId: lid.customerId,
      sequenceType: automatisch ? 'first' : 'oneoff',
      // Login mee terug: wie in de app op zijn beginscherm begon, komt na de bank
      // vaak in Safari uit, en die heeft eigen opslag (zie api/app.js).
      redirectUrl: `${APP_URL}?lid=terug&t=${encodeURIComponent(String(body.t))}`,
      webhookUrl: WEBHOOK_URL,
      metadata: { email, soort: herstel ? 'lid-herstel' : automatisch ? 'lid-eerste' : 'lid-periode', plan, akkoord: lid.akkoord.op, ...(vriendVan ? { vriend: vriendVan } : {}), ...(terug ? { terug: true } : {}) }
    })
  });
  if (!p.ok) return res.status(502).json({ ok: false, fout: 'Betalen lukt nu even niet. Probeer het zo nog eens.' });
  // Toestemming en klik-ID voor Meta vastleggen; de webhook stuurt de Purchase.
  try { await redis(['SET', `lid:meta:${p.j.id}`, JSON.stringify(browserContext(req, body.fbclid, { meting: body.meting, fbp: body.fbp, fbc: body.fbc })), 'EX', '2592000']); } catch (e) {}
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
    const soort = (p.metadata && p.metadata.soort) || '';
    lid.betaaldOoit = true;

    if (p.sequenceType === 'first') {
      // Eerste periode binnen: abonnement aanmaken, eerste incasso na een maand of een jaar.
      const plan = planVan(p.metadata && p.metadata.plan);
      lid.plan = plan;
      // Herstel na mislukte incasso: oude abonnement stoppen, de betaalde periode
      // begint op de datum van de mislukte incasso (zelfde ritme als voorheen).
      if (soort === 'lid-herstel' && lid.subscriptionId) await mollie(`/customers/${lid.customerId}/subscriptions/${lid.subscriptionId}`, { method: 'DELETE' });
      // Nog app via een schema? Dan begint de betaalde periode pas daarna.
      const vanaf = soort === 'lid-herstel' && lid.mislukt && lid.mislukt.periodeStart ? new Date(lid.mislukt.periodeStart) : lid.bron === 'schema' && lid.tot && Date.parse(lid.tot) > Date.now() ? new Date(lid.tot) : new Date(betaaldOp);
      lid.mislukt = null;
      if (p.metadata && p.metadata.vriend && !lid.vriendVan) { lid.vriendVan = p.metadata.vriend; await beloonVriend(p.metadata.vriend, lidEmail, lid.naam); }
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
      lid.jaarVraagVoor = null;
      if (lid.kortingActief && p.amount && p.amount.value === VRIEND_BEDRAG) {
        lid.kortingTegoed = Math.max(0, (lid.kortingTegoed || 1) - 1);
        if (!lid.kortingTegoed && lid.subscriptionId) {
          const s = await mollie(`/customers/${lid.customerId}/subscriptions/${lid.subscriptionId}`, { method: 'PATCH', body: JSON.stringify({ amount: { currency: 'EUR', value: PLANNEN.maand.bedrag } }) });
          if (s.ok) lid.kortingActief = false; else await meldIntern(`KORTING TERUGZETTEN MISLUKT - ${lidEmail}`, `Abonnement ${lid.subscriptionId} staat nog op €9,50. Zet het in Mollie terug op €19.`);
        }
      }
    }
    await bewaarLid(lidEmail, lid);
    await zetLidmaatschap({ email: lidEmail, naam: lid.naam, tot: lid.tot });
    await mcTag(lidEmail, 'mkc-lid');
    // Welkomstmail van Michel (09-10-2026), één keer per lid.
    if ((soort === 'lid-eerste' || soort === 'lid-periode') && !lid.welkomGemaild) {
      if (await welkomMail(lidEmail, lid)) { lid.welkomGemaild = new Date().toISOString(); lid.winbackTot = null; await bewaarLid(lidEmail, lid); }
    }
    // Nieuwe aankoop (geen verlenging): Purchase naar Meta, event_id = betaal-id.
    if ((p.sequenceType === 'first' && soort !== 'lid-herstel') || soort === 'lid-periode') {
      const m = await redis(['GET', `lid:meta:${id}`]);
      let ctx = null; try { ctx = m.ok && m.result ? JSON.parse(m.result) : null; } catch (e) {}
      await stuurPurchase({ ctx, email: lidEmail, naam: lid.naam, waarde: p.amount && p.amount.value, eventId: id, product: 'MKC-app lidmaatschap (' + planVan(p.metadata && p.metadata.plan) + ')', bronUrl: APP_URL });
    }
    // Factuur via Mollie Invoicing, zelfde route en schakelaar als de analyse
    // (MOLLIE_FACTUUR=aan). Fail-safe: de toegang staat al open, een factuurfout
    // mag niets blokkeren. Geen adres bekend: Mollie krijgt de placeholder uit
    // lib/mollie-factuur.js, prima voor een vereenvoudigde factuur onder €100.
    if ((process.env.MOLLIE_FACTUUR || '').toLowerCase() === 'aan') {
      try {
        const maand = new Date(betaaldOp).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
        const periode = planVan(lid.plan) === 'jaar' ? `jaar vanaf ${new Date(betaaldOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}` : maand;
        const f = await maakMollieFactuur({ naam: (lid.factuur && lid.factuur.naam) || lid.naam || lidEmail.split('@')[0], postcode: lid.factuur && lid.factuur.postcode, huisnummer: lid.factuur && lid.factuur.huisnummer, land: lid.factuur && lid.factuur.land, straat: lid.factuur && lid.factuur.straat, plaats: lid.factuur && lid.factuur.plaats, email: lidEmail, bedrag: (p.amount && p.amount.value) || PLANNEN[planVan(lid.plan)].bedrag, betaalId: id, omschrijving: `${OMSCHRIJVING}, ${periode}` });
        if (f.ok && f.id) { lid.facturen = [{ id: f.id, nr: f.nummer || '', bedrag: (p.amount && p.amount.value) || '', op: betaaldOp.slice(0, 10), omschrijving: periode }, ...(lid.facturen || [])].slice(0, 60); await bewaarLid(lidEmail, lid); }
        if (!f.ok) { console.error('Factuur lidmaatschap mislukt:', lidEmail, id, f.fout); await meldIntern(`FACTUUR MISLUKT - lidmaatschap - ${lidEmail}`, `Automatische factuur voor ${id} (${lidEmail}) mislukte: ${f.fout || 'onbekende fout'}. De toegang staat wel open. Maak de factuur even handmatig aan in Mollie.`); }
      } catch (e) { console.error('Factuur lidmaatschap fout:', e); }
    }
    return res.status(200).send('ok');
  }

  if (['failed', 'expired', 'canceled'].includes(p.status) && p.sequenceType === 'recurring') {
    // Incasso mislukt: lid blijft tot de einddatum (met speling) toegang houden.
    // Eén bericht per mislukte betaling, met een knop om bij te werken.
    lid.status = 'achterstand';
    if (!lid.mislukt || lid.mislukt.betaling !== id) {
      const io = incassoOp(lid);
      lid.mislukt = { betaling: id, op: new Date().toISOString(), periodeStart: new Date(io && io < Date.now() + 86400000 ? io : Date.now()).toISOString() };
      const voornaam = String(lid.naam || '').split(' ')[0];
      const datum = lid.tot ? new Date(lid.tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : 'binnenkort';
      await jaarMail(lidEmail, 'Je betaling voor de MKC-app is niet gelukt', mailHuls(`<p>${voornaam ? 'Hoi ' + voornaam : 'Hoi'},</p>
        <p>De automatische betaling voor je MKC-app is niet gelukt. Dat gebeurt soms, bijvoorbeeld bij een nieuw rekeningnummer of als er net te weinig op stond.</p>
        <p>Je app blijft gewoon open tot ${datum}. Werk je betaling even bij, dan loopt alles door zoals je gewend bent.</p>
        <p style="margin:22px 0 26px"><a href="${APP_URL}#lid" style="background:#ff6b1a;color:#0a0a0a;padding:14px 26px;border-radius:4px;text-decoration:none;font-weight:700">Werk mijn betaling bij</a></p>`));
      await appMelding(lidEmail, { soort: 'lid', titel: 'Je betaling is niet gelukt', tekst: `Werk je betaling bij onder Mijn lidmaatschap, dan loopt alles door. Je app blijft open tot ${datum}.`, link: '/app#lid' });
    }
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
  // Reden van opzeggen (09-10-2026), geteld voor Michels beheer.
  const reden = OPZEG_REDENEN.includes(body.reden) ? body.reden : 'geen';
  lid.opzegReden = { reden, toelichting: String(body.toelichting || '').replace(/[<>]/g, '').slice(0, 300), op: lid.opgezegdOp };
  await redis(['HINCRBY', 'lid:opzegredenen', reden, 1]);
  if (lid.opzegReden.toelichting) await redis(['LPUSH', 'lid:opzegtoelichting', JSON.stringify({ email, reden, tekst: lid.opzegReden.toelichting, op: lid.opgezegdOp })]), await redis(['LTRIM', 'lid:opzegtoelichting', '0', '99']);
  // Toegang loopt tot de betaalde datum, zonder de speling van een mislukte incasso.
  if (lid.tot) lid.tot = plusDagen(lid.tot, -SPELING_DAGEN).toISOString();
  await bewaarLid(email, lid);
  await zetLidmaatschap({ email, naam: lid.naam, tot: lid.tot });
  await mcTag(email, 'mkc-lid', false);
  return res.status(200).json({ ok: true, lid: lidBeeld(lid) });
}

// Leden zonder incasso: 5 dagen voor de einddatum een mail met een knop om te
// verlengen (de app opent dan het lidblok). Eén keer per periode.
// Coaching-klanten houden de app zolang ze in coaching zitten: loopt hun
// toegang binnen 14 dagen af, dan schuift hij 90 dagen door. Stopt iemand,
// dan trekt Michel de toegang in via Beheer > Leden (haalt hem uit lid:coaching).
async function coachingVerlengen() {
  const l = await redis(['SMEMBERS', 'lid:coaching']);
  let n = 0;
  for (const email of (l.ok && l.result) || []) {
    const lid = await haalLid(email);
    if (!lid || lid.bron !== 'coaching' || lid.subscriptionId || !lid.tot) continue;
    if (Date.parse(lid.tot) - Date.now() > 14 * 86400000) continue;
    lid.tot = new Date(Math.max(Date.now(), Date.parse(lid.tot)) + 90 * 86400000).toISOString(); lid.status = 'actief';
    await bewaarLid(email, lid);
    await zetLidmaatschap({ email, naam: lid.naam, tot: lid.tot, stil: true });
    n++;
  }
  return n;
}
async function routeHerinner(req, res) {
  const cron = process.env.CRON_SECRET || '';
  if (!cron || String(req.headers?.authorization || '') !== `Bearer ${cron}`) return res.status(401).json({ ok: false });
  const lijst = await redis(['SMEMBERS', 'lid:handmatig']);
  let gemaild = await schemaEindeMails();
  const verlengd = await coachingVerlengen();
  const jaar = await jaarKeuzeRonde();
  const terugmails = await winbackRonde();
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
  return res.status(200).json({ ok: true, gemaild, verlengd, jaar, terugmails });
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

// ---- Beheer: ledenoverzicht, zoeken en toegang geven (09-10-2026) ------------
// Alleen aan te roepen vanuit api/app.js na de beheercheck.
const nlDatum = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(d);
function soortVan(lid) {
  const open = lid.tot && Date.parse(lid.tot) > Date.now();
  if (!open) return 'verlopen';
  if (lid.bron === 'coaching' && !lid.subscriptionId) return lid.coaching === 'premium' ? 'coaching-premium' : 'coaching-flex';
  if (lid.bron === 'schema' && !lid.subscriptionId && !lid.handmatig) return lid.cadeauMaand ? 'gratis-maand' : 'schema';
  if (lid.status === 'opgezegd') return 'opgezegd';
  if (lid.status === 'achterstand') return 'achterstand';
  return planVan(lid.plan) === 'jaar' ? 'betaald-jaar' : 'betaald-maand';
}
async function alleLedenEmails() {
  const sets = ['lid:alle', 'lid:schema', 'lid:coaching', 'lid:cadeau', 'lid:handmatig'];
  const uit = new Set();
  for (const k of sets) { const r = await redis(['SMEMBERS', k]); for (const e of (r.ok && r.result) || []) uit.add(e); }
  return [...uit];
}
export async function ledenOverzicht() {
  const emails = await alleLedenEmails();
  const leden = [];
  for (let i = 0; i < emails.length; i += 25) {
    const stuk = await Promise.all(emails.slice(i, i + 25).map(async (e) => ({ email: e, lid: await haalLid(e) })));
    for (const x of stuk) if (x.lid) leden.push(x);
  }
  const tel = {};
  const vandaag = nlDatum();
  let nieuwVandaag = 0, mrr = 0;
  for (const { lid } of leden) {
    const k = soortVan(lid); tel[k] = (tel[k] || 0) + 1;
    if (k === 'betaald-maand') mrr += 19;
    if (k === 'betaald-jaar') mrr += 149 / 12;
    if ((k === 'betaald-maand' || k === 'betaald-jaar') && lid.sinds && nlDatum(new Date(lid.sinds)) === vandaag) nieuwVandaag++;
  }
  const recent = leden.filter(({ lid }) => lid.sinds).sort((a, b) => String(b.lid.sinds).localeCompare(String(a.lid.sinds))).slice(0, 12)
    .map(({ email, lid }) => ({ email, naam: lid.naam || '', soort: soortVan(lid), sinds: lid.sinds ? nlDatum(new Date(lid.sinds)) : '', tot: lid.tot ? nlDatum(new Date(lid.tot)) : '' }));
  const rh = await redis(['HGETALL', 'lid:opzegredenen']);
  const redenen = {}; const arr = (rh.ok && rh.result) || [];
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) redenen[arr[i]] = Number(arr[i + 1]) || 0; else Object.assign(redenen, arr);
  const tl = await redis(['LRANGE', 'lid:opzegtoelichting', '0', '9']);
  const toelichting = ((tl.ok && tl.result) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  return { totaal: leden.length, tel, nieuwVandaag, mrr: Math.round(mrr), recent, redenen, toelichting };
}
export async function lidZoek(email) {
  email = String(email || '').trim().toLowerCase();
  const lid = await haalLid(email);
  const sch = await haalSchema(email);
  return lid || sch ? {
    email, naam: (lid && lid.naam) || '', soort: lid ? soortVan(lid) : 'geen',
    tot: lid && lid.tot ? nlDatum(new Date(lid.tot)) : '', sinds: lid && lid.sinds ? nlDatum(new Date(lid.sinds)) : '',
    abonnement: !!(lid && lid.subscriptionId), akkoord: lid && lid.akkoord ? lid.akkoord.op.slice(0, 10) : '',
    schema: sch && sch.huidig ? { titel: sch.huidig.titel, start: sch.huidig.start, plan: sch.huidig.plan } : null
  } : { email, soort: 'geen' };
}
// soort: coaching-flex | coaching-premium | schema | gratis | intrekken
export async function geefToegang({ email, naam = '', soort, tot, plan, start }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, fout: 'Geen geldig mailadres.' };
  const lid = (await haalLid(email)) || {};
  if (soort === 'intrekken') {
    if (lid.subscriptionId) return { ok: false, fout: 'Dit lid heeft een lopend abonnement. Zeg dat eerst op (de klant zelf in de app, of in Mollie).' };
    lid.tot = new Date().toISOString(); lid.status = 'verlopen';
    if (lid.bron === 'coaching') lid.bron = 'verlopen';
    await redis(['SREM', 'lid:coaching', email]);
    await bewaarLid(email, lid);
    await zetLidmaatschap({ email, naam: lid.naam, tot: lid.tot, stil: true });
    return { ok: true, lid: await lidZoek(email) };
  }
  let totIso = /^\d{4}-\d{2}-\d{2}$/.test(String(tot || '')) ? new Date(tot + 'T20:00:00Z').toISOString() : null;
  if (soort === 'schema') {
    const planNaamGeldig = plan && laadPlan(plan) ? plan : null;
    if (!planNaamGeldig) return { ok: false, fout: 'Kies een schema.' };
    const st = /^\d{4}-\d{2}-\d{2}$/.test(String(start || '')) ? start : nlDatum();
    const weken = laadPlan(planNaamGeldig).weken;
    const nv = planNaamGeldig.split('-')[0];
    const niveauNaam = planNaamGeldig.startsWith('winter') ? planNaamGeldig.split('-')[1].replace(/^./, (c) => c.toUpperCase()) : nv.replace(/^./, (c) => c.toUpperCase());
    const titel = planNaamGeldig.startsWith('winter') ? 'Indoor Winterprogramma ' + niveauNaam : niveauNaam + ' ' + weken + ' weken';
    const oud = await haalSchema(email);
    const huidig = { plan: planNaamGeldig, soort: planNaamGeldig.startsWith('winter') ? 'winter' : 'schema', weken, niveauNaam, titel, start: st, verschuif: 0, order: 'beheer', sinds: new Date().toISOString() };
    await redis(['SET', `schema:${email}`, JSON.stringify({ huidig, eerder: oud ? [oud.huidig, ...(oud.eerder || [])].filter(Boolean).slice(0, 10) : [] })]);
    totIso = totIso || new Date(Math.max(Date.now(), Date.parse(st + 'T00:00:00Z')) + (weken * 7 + SCHEMA_EXTRA_DAGEN) * 86400000).toISOString();
    if (!lid.subscriptionId) { lid.bron = 'schema'; lid.cadeauMaand = false; }
    await redis(['SADD', 'lid:schema', email]);
  } else if (soort === 'coaching-flex' || soort === 'coaching-premium') {
    totIso = totIso || new Date(Date.now() + 90 * 86400000).toISOString();
    lid.coaching = soort === 'coaching-premium' ? 'premium' : 'flex';
    if (!lid.subscriptionId) lid.bron = 'coaching';
    await redis(['SADD', 'lid:coaching', email]);
  } else if (soort === 'gratis') {
    totIso = totIso || new Date(Date.now() + 30 * 86400000).toISOString();
    if (!lid.subscriptionId) { lid.bron = 'schema'; lid.cadeauMaand = true; }
  } else return { ok: false, fout: 'Onbekende soort.' };
  if (!lid.subscriptionId) { lid.tot = totIso; lid.status = 'actief'; }
  lid.sinds = lid.sinds || new Date().toISOString();
  lid.naam = lid.naam || String(naam).slice(0, 80);
  lid.plan = lid.plan || 'maand';
  await bewaarLid(email, lid);
  await zetLidmaatschap({ email, naam: lid.naam, tot: lid.tot, stil: true });
  await mcTag(email, 'mkc-lid');
  return { ok: true, lid: await lidZoek(email) };
}

export { lidOpen, lidBeeld, haalLid, incassoKlaar, haalSchema };
