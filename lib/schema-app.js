// lib/schema-app.js
// Het schema in de MKC-app (09-10-2026). De trainingen komen uit Michels
// TrainingPeaks-bibliotheek, één keer geëxporteerd naar data/schemas/<plan>.json
// (scratchpad export-plannen.mjs). De klant traint gewoon in TrainingPeaks;
// de app laat zien wat er vandaag op het schema staat, met Michels uitleg.
//
// Welk plan: niveau + lengte + meetmethode, bijvoorbeeld 'opbouw-12-w' of
// 'basis-8-hr'; het winterprogramma is 'winter-basis-w' / 'winter-opbouw-w'.
// Welke dag: dag 1 = de startdatum van de bestelling, plus een eigen
// verschuiving (de klant loopt een dag voor of achter).

import { readFileSync } from 'node:fs';
import path from 'node:path';

export const PLANNEN = ['basis', 'opbouw', 'piek'].flatMap((n) => [8, 12, 16].flatMap((w) => [`${n}-${w}-w`, `${n}-${w}-hr`]))
  .concat(['winter-basis-w', 'winter-opbouw-w']);

const cache = new Map();
export function laadPlan(naam) {
  if (!PLANNEN.includes(naam)) return null;
  if (cache.has(naam)) return cache.get(naam);
  try {
    const plan = JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'schemas', `${naam}.json`), 'utf8'));
    cache.set(naam, plan);
    return plan;
  } catch { return null; }
}

// Plan-naam uit wat de bestelling zegt.
export function planNaam({ soort, niveau, weken, meet }) {
  const n = String(niveau || '').toLowerCase();
  const nv = /piek|gevorderd|expert/.test(n) ? 'piek' : /opbouw|gemiddeld/.test(n) ? 'opbouw' : 'basis';
  if (soort === 'winter') return `winter-${nv === 'basis' ? 'basis' : 'opbouw'}-w`;
  const w = [8, 12, 16].includes(Number(weken)) ? Number(weken) : 12;
  const m = /hart/i.test(String(meet || '')) ? 'hr' : 'w';
  return `${nv}-${w}-${m}`;
}

// Vandaag in Nederland als YYYY-MM-DD.
export function vandaagNl(nu = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}
const dagenTussen = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const DAGNAMEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const plusDagen = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Wat de app laat zien. s = { plan, start: 'YYYY-MM-DD', verschuif, niveauNaam, ... }
// Recente Strava-analyse (besluit Michel 09-10-2026, tweede versie): het
// schema blijft zoals het is, maar bij de test in week 1 staat dat hij
// vrijwillig is. Wie hem niet doet rijdt een rustig rondje en begint
// donderdag met de eerste intervaltraining.
function workoutsVoor(plan, s) {
  const an = s.testOverslaan;
  if (!an) return plan.workouts;
  const test = plan.workouts.find((w) => w.dag <= 7 && /test/i.test(w.titel));
  if (!test) return plan.workouts;
  const ramp = /ramp/i.test(test.titel);
  const waarde = an.meet === 'hartslag' ? `je omslagpunt (${an.waarde} bpm)` : `je FTP (${an.waarde} W)`;
  const melding = `Je hebt een Strava-analyse gedaan, dus ${waarde} weten we al en je zones staan daarop. Deze ${ramp ? 'ramptest' : 'veldtest'} mag je doen als extra bevestiging. Geen zin of geen tijd? Rij dan vandaag een rustig rondje en begin donderdag met je eerste intervaltraining.`;
  return plan.workouts.map((w) => (w === test ? { ...w, melding } : w));
}

// Michel zet elk plan in TrainingPeaks op de eerstvolgende maandag (besluit 14-10-2026).
// Kiest een klant zondag 1 november, dan begint het plan maandag 2 november.
// Oude dossiers die al met de knoppen zijn rechtgezet (verschuif) houden hun eigen start.
export function planStart(s) {
  if (!s || !s.start || s.startExact || (Number(s.verschuif) && !s.maandag)) return s && s.start;
  const wd = new Date(s.start + 'T12:00:00Z').getUTCDay();
  return plusDagen(s.start, (8 - wd) % 7);
}
export function schemaBeeld(s, vandaag = vandaagNl()) {
  const basisPlan = s && laadPlan(s.plan);
  if (!basisPlan) return null;
  const plan = { ...basisPlan, workouts: workoutsVoor(basisPlan, s) };
  const totaal = plan.weken * 7;
  const start = planStart(s);
  const dagNr = dagenTussen(start, vandaag) + 1 - (Number(s.verschuif) || 0);
  const status = dagNr < 1 ? 'voor' : dagNr > totaal ? 'klaar' : 'loopt';
  const week = Math.min(plan.weken, Math.max(1, Math.ceil(dagNr / 7)));
  const kaal = (w) => w && { dag: w.dag, titel: w.titel.trim(), duur: w.duur, tss: w.tss, tekst: w.tekst, notitie: w.notitie, meet: w.meet, blokken: w.blokken, melding: w.melding || '' };
  // Kalenderdatum bij een plandag (voor de weekstrook).
  const datumVan = (dag) => plusDagen(start, dag - 1 + (Number(s.verschuif) || 0));
  const weekDagen = [];
  for (let d = (week - 1) * 7 + 1; d <= week * 7; d++) {
    const datum = datumVan(d);
    weekDagen.push({ dag: d, datum, dagnaam: DAGNAMEN[new Date(datum + 'T12:00:00Z').getUTCDay()], vandaag: d === dagNr, trainingen: plan.workouts.filter((w) => w.dag === d).map(kaal) });
  }
  const volgende = plan.workouts.find((w) => w.dag > dagNr);
  const weekUren = plan.workouts.filter((w) => Math.ceil(w.dag / 7) === week).reduce((t, w) => t + (w.duur || 0), 0);
  return {
    plan: s.plan, titel: s.titel || plan.titel, weken: plan.weken, niveau: s.niveauNaam || '', meet: /-hr$/.test(s.plan) ? 'hartslag' : 'vermogen',
    winter: /^winter/.test(s.plan), start, verschuif: Number(s.verschuif) || 0, analyse: s.testOverslaan || null,
    status, dagNr, week, weekUren: Math.round(weekUren * 10) / 10,
    vandaag: status === 'loopt' ? plan.workouts.filter((w) => w.dag === dagNr).map(kaal) : [],
    volgende: volgende ? { ...kaal(volgende), datum: datumVan(volgende.dag), overDagen: volgende.dag - dagNr } : null,
    weekDagen,
    // Alle weken in het kort (17-10-2026): titel en duur per training; de uitleg haalt de app per week op (schemaWeek).
    overzicht: Array.from({ length: plan.weken }, (_, i) => {
      const lijst = plan.workouts.filter((w) => Math.ceil(w.dag / 7) === i + 1);
      return { week: i + 1, start: datumVan(i * 7 + 1), uren: Math.round(lijst.reduce((t, w) => t + (w.duur || 0), 0) * 10) / 10,
        trainingen: lijst.map((w) => ({ dagnaam: DAGNAMEN[new Date(datumVan(w.dag) + 'T12:00:00Z').getUTCDay()], titel: w.titel.trim(), duur: w.duur })) };
    })
  };
}

// Eén week met de volledige uitleg (17-10-2026), voor het openklappen in de app.
export function schemaWeek(s, week) {
  const basisPlan = s && laadPlan(s.plan);
  if (!basisPlan) return null;
  const plan = { ...basisPlan, workouts: workoutsVoor(basisPlan, s) };
  const w = Math.max(1, Math.min(plan.weken, Number(week) || 1));
  const start = planStart(s), verschuif = Number(s.verschuif) || 0;
  const datumVan = (dag) => plusDagen(start, dag - 1 + verschuif);
  return { week: w, trainingen: plan.workouts.filter((x) => Math.ceil(x.dag / 7) === w).map((x) => ({
    datum: datumVan(x.dag), dagnaam: DAGNAMEN[new Date(datumVan(x.dag) + 'T12:00:00Z').getUTCDay()],
    titel: x.titel.trim(), duur: x.duur, tss: x.tss, tekst: String(x.tekst || '').trim(), notitie: String(x.notitie || '').trim(), melding: x.melding || ''
  })) };
}

// Korte samenvatting voor de coach-prompt.
export function schemaContext(b) {
  if (!b) return '';
  if (b.status === 'voor') return `Schema: ${b.titel}, ${b.weken} weken, start op ${b.start}. Eerste training: ${b.volgende ? b.volgende.titel : 'onbekend'}.`;
  if (b.status === 'klaar') return `Schema: ${b.titel} (${b.weken} weken) is afgerond.`;
  const vd = b.vandaag.length ? b.vandaag.map((w) => `${w.titel} (${uren(w.duur)})`).join(' en ') : 'rustdag';
  const wk = b.weekDagen.map((d) => `${d.dagnaam}: ${d.trainingen.length ? d.trainingen.map((w) => `${w.titel} ${uren(w.duur)}`).join(' + ') : 'rust'}`).join('; ');
  return `Schema: ${b.titel} op ${b.meet}, week ${b.week} van ${b.weken} (${b.weekUren} uur deze week). Vandaag: ${vd}. Deze week: ${wk}. De klant traint in TrainingPeaks; de app toont het schema ter uitleg.`;
}
export function uren(u) { if (!u) return ''; const m = Math.round(u * 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} u` : `${m} min`; }
