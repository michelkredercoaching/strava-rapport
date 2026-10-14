// Coach-correcties uitlezen: wat Michel aanpaste in de antwoorden van Vraag je coach.
// Gebruik: node scripts/coach-correcties.mjs [--json]
//         node scripts/coach-correcties.mjs --gaten [dagen]   -> waar de coach het niet wist (standaard 7 dagen)
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
if (process.argv.includes('--gaten')) {
  const dagen = Number(process.argv[process.argv.indexOf('--gaten') + 1]) || 7, sinds = Date.now() - dagen * 864e5;
  const re = /(weet ik (dat |het )?niet|ik weet (het )?niet|eerlijk gezegd weet ik|kan ik (je )?niet (met zekerheid )?(zien|zeggen)|heb ik geen (informatie|zicht|gegevens)|stuur michel (dan )?(even )?een whatsapp|vraag het (even )?aan michel)/i;
  const alle = new Map();
  for (const g of j.gaten || []) alle.set(g.id, g);
  for (const a of j.antwoorden) if (re.test(a.antwoord) && !/huisarts|fysio|\barts\b/i.test(a.antwoord)) alle.set(a.id, a);
  const l = [...alle.values()].filter((x) => Date.parse(x.op) >= sinds).sort((a, b) => (a.op < b.op ? 1 : -1));
  console.log(`${l.length} keer wist de coach het niet (laatste ${dagen} dagen)
`);
  for (const g of l) console.log(`=== ${String(g.op).slice(0, 16)} (${g.bron})
VRAAG: ${g.vraag}
COACH: ${g.antwoord}
`);
  process.exit(0);
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(j, null, 2)); process.exit(0); }
console.log(`${j.correcties.length} correcties, ${j.antwoorden.length} bewaarde antwoorden, ${j.nagekeken} nagekeken\n`);
for (const c of j.correcties) {
  console.log(`=== ${String(c.op).slice(0, 10)} (${c.bron})\nVRAAG: ${c.vraag}\nCOACH: ${c.origineel}\nMICHEL: ${c.correctie}\n`);
}
