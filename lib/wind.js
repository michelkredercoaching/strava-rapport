// lib/wind.js
// Windadvies (09-10-2026): welke kant start je op? Begin tegen de wind in, dan
// heb je hem op de terugweg mee, als je moe bent. Gratis in de app, als lokkertje.
// Wordt in de browser geladen (import('/lib/wind.js')).

const RICHTINGEN = ['het noorden', 'het noordoosten', 'het oosten', 'het zuidoosten', 'het zuiden', 'het zuidwesten', 'het westen', 'het noordwesten'];
export function richtingNaam(graden) { return RICHTINGEN[Math.round((((Number(graden) % 360) + 360) % 360) / 45) % 8]; }

// uren: [{ wind (km/u), richting (graden, waar de wind vandaan komt) }] tijdens de rit.
export function windAdvies(uren) {
  const l = (uren || []).filter((u) => Number.isFinite(Number(u.richting)));
  if (!l.length) return null;
  const start = l[0], eind = l[l.length - 1];
  const kracht = Math.round(l.reduce((t, u) => t + (u.wind || 0), 0) / l.length);
  const max = Math.max(...l.map((u) => u.wind || 0));
  const draai = Math.abs(((eind.richting - start.richting + 540) % 360) - 180);
  const vanaf = richtingNaam(start.richting);
  if (kracht < 10) return { kracht, richting: start.richting, kort: 'weinig wind', tekst: `Weinig wind vandaag (${kracht} km/u). Kies je rondje vrij, de wind maakt nauwelijks verschil.` };
  let tekst = `De wind komt uit ${vanaf} (${kracht} km/u${max >= kracht + 10 ? `, vlagen tot ${max}` : ''}). Start richting ${vanaf}: dan heb je hem op de terugweg in je rug, als je moe bent.`;
  if (draai >= 60) tekst += ` Let op: de wind draait tijdens je rit naar ${richtingNaam(eind.richting)}. Maak de heenweg dan niet te lang.`;
  if (kracht >= 30) tekst += ' Harde wind: houd de heenweg kort en zoek beschutting, en kies liever geen hoge velgen, die vangen veel zijwind.';
  const kust = `Kun je die kant niet op, bijvoorbeeld omdat je aan de kust woont? Kies dan de richting die er het dichtst bij komt, zodat je de wind zoveel mogelijk op de heenweg tegen hebt. Kun je echt maar één kant op, maak de heenweg tegen de wind dan korter dan de terugweg.`;
  return { kracht, richting: start.richting, draait: draai >= 60, kort: `start richting ${vanaf.replace('het ', '')}`, tekst, kust };
}
