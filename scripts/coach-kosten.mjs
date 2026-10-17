// Wat kost de digitale coach? (17-10-2026)
// Leest per soort vraag het verbruik van deze maand (of: node scripts/coach-kosten.mjs 2026-10)
// en rekent het om naar dollars met de prijzen van Claude Opus 5.5.
// Nodig in .env: TRECHTER_SLEUTEL en TRECHTER_URL (zelfde als scripts/trechter.mjs).
import { readFileSync } from 'node:fs';

function env(naam) {
  if (process.env[naam]) return process.env[naam].trim();
  try {
    const m = readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split(/\r?\n/).map((r) => r.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).find((x) => x && x[1] === naam);
    if (m) return m[2].replace(/^["']|["']$/g, '').trim();
  } catch { /* .env hoeft niet te bestaan */ }
  return '';
}

// Dollar per miljoen tokens, Claude Opus 5.5. Cache schrijven: 1,25x (5 min) of 2x (1 uur); lezen 0,20.
const PRIJS = { ui: 4, cw5: 5, cw1h: 8, cr: 0.2, out: 20 };
const NAAM = { coach: 'Digitale coach', bandvraag: 'Bandencoach', inkorten: 'Antwoord inkorten', core: 'Core-coach', overig: 'Overig' };

const maand = process.argv[2] || new Date().toISOString().slice(0, 7);
const basis = new URL(env('TRECHTER_URL') || 'https://rapport.michelkredercoaching.nl/api/trechter').origin;
const r = await fetch(`${basis}/api/app?actie=aikosten&m=${maand}`, { headers: { 'x-sleutel': env('TRECHTER_SLEUTEL') } });
const j = await r.json().catch(() => ({}));
if (!j.ok) { console.error('Ophalen lukte niet (' + r.status + '). Staat TRECHTER_SLEUTEL in .env?'); process.exit(1); }

const dollar = (x) => '$' + x.toFixed(2);
let totaal = 0, vragen = 0;
console.log(`Coachkosten ${j.maand} (gemeten sinds 17-10-2026)\n`);
for (const [b, v] of Object.entries(j.bronnen)) {
  const kost = Object.entries(PRIJS).reduce((s, [f, p]) => s + (v[f] || 0) * p / 1e6, 0);
  const inv = (v.ui || 0) + (v.cw5 || 0) + (v.cw1h || 0) + (v.cr || 0);
  const hit = inv ? Math.round(100 * (v.cr || 0) / inv) : 0;
  totaal += kost; vragen += v.n || 0;
  console.log(`${(NAAM[b] || b).padEnd(18)} ${String(v.n || 0).padStart(5)} vragen  ${dollar(kost).padStart(8)}  = ${(100 * kost / Math.max(1, v.n || 0)).toFixed(1)} cent per vraag  (${hit}% uit de cache)`);
}
console.log(`\n${'Totaal'.padEnd(18)} ${String(vragen).padStart(5)} vragen  ${dollar(totaal).padStart(8)}`);
if (j.totaal.vragen > vragen) console.log(`\nDeze maand ${j.totaal.vragen} vragen in totaal; ${j.totaal.vragen - vragen} daarvan van vóór de meting (alleen grof geteld: ${j.totaal.in} tokens in, ${j.totaal.out} uit).`);
