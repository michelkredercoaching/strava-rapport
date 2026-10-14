// Coach-correcties uitlezen: wat Michel aanpaste in de antwoorden van Vraag je coach.
// Gebruik: node scripts/coach-correcties.mjs [--json]
// Nodig in .env: TRECHTER_SLEUTEL (zelfde waarde als in Vercel), optioneel TRECHTER_URL.
// Geeft geen mailadressen terug, alleen vraag, origineel en Michels versie.
import fs from 'node:fs';
const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const uitEnv = (k, std = '') => process.env[k] || (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim() || std;
const SLEUTEL = uitEnv('TRECHTER_SLEUTEL');
const BASIS = uitEnv('TRECHTER_URL', 'https://rapport.michelkredercoaching.nl').replace(/\/api\/.*$/, '').replace(/\/$/, '');
if (!SLEUTEL) { console.error('TRECHTER_SLEUTEL ontbreekt in .env'); process.exit(1); }
const r = await fetch(BASIS + '/api/app?actie=correctiesexport', { headers: { 'x-sleutel': SLEUTEL } });
if (!r.ok) { console.error('Mislukt: HTTP ' + r.status); process.exit(1); }
const j = await r.json();
if (process.argv.includes('--json')) { console.log(JSON.stringify(j, null, 2)); process.exit(0); }
console.log(`${j.correcties.length} correcties, ${j.antwoorden.length} bewaarde antwoorden, ${j.nagekeken} nagekeken\n`);
for (const c of j.correcties) {
  console.log(`=== ${String(c.op).slice(0, 10)} (${c.bron})\nVRAAG: ${c.vraag}\nCOACH: ${c.origineel}\nMICHEL: ${c.correctie}\n`);
}
