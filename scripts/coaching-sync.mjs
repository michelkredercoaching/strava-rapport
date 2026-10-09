// scripts/coaching-sync.mjs
// Maandelijkse check (09-10-2026): wie zit er in coaching volgens TrainingPeaks
// (groepen Basic* = flex, Premium* = premium) en klopt dat met wie de MKC-app
// via coaching heeft? Toont nieuwe klanten (toegang geven) en gestopte klanten
// (toegang intrekken). Doen via de app: Beheer > Leden > Geef toegang.
// Verlengen hoeft niet: de server schuift coaching-toegang zelf door.
//
//   node scripts/coaching-sync.mjs              -> alleen vergelijken
//   node scripts/coaching-sync.mjs --bijwerken  -> daarna de stand opslaan
//
// De stand staat lokaal in coaching-sync-stand.json (niet naar GitHub).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = 'C:/Users/miche/Downloads/mkc-manager/';
const cfg = JSON.parse(readFileSync('C:/Users/miche/AppData/Roaming/Claude/claude_desktop_config.json', 'utf8'));
const zoek = (o) => { if (!o || typeof o !== 'object') return null; if (o.TP_AUTH_COOKIE) return o.TP_AUTH_COOKIE; for (const v of Object.values(o)) { const r = zoek(v); if (r) return r; } return null; };
process.env.TP_AUTH_COOKIE = zoek(cfg);
const auth = await import(pathToFileURL(ROOT + 'tp-coach-mcp/dist/auth.js').href);
const kop = await auth.authHeaders();
const uid = await auth.getUserId();
const get = async (p) => { const r = await fetch('https://tpapi.trainingpeaks.com' + p, { headers: kop }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };

const tags = await get('/coaches/v2/coaches/3062378/tags');
const groep = {};
for (const t of tags) { const soort = /^premium/i.test(t.name) ? 'premium' : /^basic/i.test(t.name) ? 'flex' : null; if (soort) for (const a of t.athleteIds) groep[a] = soort; }
let atleten;
try { atleten = await get(`/users/v3/users/${uid}/athletes`); }
catch { const u = (await get('/users/v3/user')).user || {}; atleten = u.athletes || u.athleteAccess || []; }
const nu = [];
for (const a of atleten) {
  const id = a.athleteId || a.userId || a.personId || a.id;
  if (!groep[id]) continue;
  nu.push({ athleteId: id, soort: groep[id], naam: [a.firstName, a.lastName].filter(Boolean).join(' '), email: String(a.email || '').toLowerCase() });
}
for (const x of nu.filter((x) => !x.email)) {
  try { const u = await get(`/fitness/v1/athletes/${x.athleteId}/settings`); x.email = String(u.email || u.athlete?.email || '').toLowerCase(); } catch {}
}

const standPad = ROOT + 'coaching-sync-stand.json';
const stand = JSON.parse(readFileSync(standPad, 'utf8'));
const had = new Map(stand.klanten.map((k) => [k.email, k]));
// negeer: in TP-groep maar bewust geen app (bijv. stopt binnenkort).
const negeer = new Set(stand.negeer || []);
const heeft = new Map(nu.filter((x) => x.email && !negeer.has(x.email)).map((x) => [x.email, x]));
const nieuw = [...heeft.values()].filter((x) => !had.has(x.email));
const weg = [...had.values()].filter((x) => !heeft.has(x.email));
const anders = [...heeft.values()].filter((x) => had.has(x.email) && had.get(x.email).soort !== x.soort);

console.log(`Coaching volgens TrainingPeaks: ${nu.length} (stand van ${stand.bijgewerkt}: ${stand.klanten.length})`);
console.log(`\nNIEUW, toegang geven (${nieuw.length}):`); nieuw.forEach((x) => console.log(`  ${x.naam} <${x.email}> -> Coaching ${x.soort === 'premium' ? 'Premium' : 'Flexibel'}`));
console.log(`\nGESTOPT, toegang intrekken (${weg.length}):`); weg.forEach((x) => console.log(`  ${x.naam} <${x.email}>`));
if (anders.length) { console.log(`\nANDER PAKKET (${anders.length}):`); anders.forEach((x) => console.log(`  ${x.naam} <${x.email}> -> nu ${x.soort}`)); }
const zonder = nu.filter((x) => !x.email);
if (zonder.length) { console.log(`\nZonder mailadres in TP (${zonder.length}):`); zonder.forEach((x) => console.log(`  ${x.naam} (athleteId ${x.athleteId})`)); }

if (process.argv.includes('--bijwerken')) {
  writeFileSync(standPad, JSON.stringify({ bijgewerkt: new Date().toISOString().slice(0, 10), negeer: [...negeer], klanten: [...heeft.values()].map(({ email, naam, soort }) => ({ email, naam, soort })) }, null, 1));
  console.log('\nStand opgeslagen.');
}
