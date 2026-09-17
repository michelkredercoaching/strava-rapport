// /lib/pijn-signalen.js
// Gedeelde diagnose-logica voor de Power Profile-nurture-mails: welk pijnpunt
// (PIJN) en welk decoupling-signaal (BIJPIJN) hoort bij een analyse. Gebruikt
// door zowel lib/lever-rapport.js (na betaling, volledig rapport) als
// api/lead.js (bij afhaken, alleen de teaser-data die al binnenkwam). Eén bron
// van waarheid zodat de koper- en verlaten-journey dezelfde diagnose tonen.
//
// Verwacht een object met (waar beschikbaar): zones (dash-string "x-x-x-x-x-x"),
// vo2max (aantal VO2max-sessies), meetmethode ('vermogen'|'hartslag'),
// decoupling (%, vermogen-spoor), decouplingHr (%, hartslag-spoor).

// Pijnpunt uit de analyse (mirror van het rapport).
export function bepaalPijn(m) {
  const z = (m.zones || '').split('-').map(n => parseInt(n) || 0);
  const grijs = (z[2]||0) + (z[3]||0);   // Tempo + Sweetspot
  const laag  = (z[0]||0) + (z[1]||0);   // Herstel + Duur
  const kwal  = (z[4]||0) + (z[5]||0);   // FTP + VO2max
  const vo2   = Number(m.vo2max);
  if (!Number.isNaN(vo2) && vo2 === 0) return { pijn: 'interval', pct: kwal };
  if (grijs > 20)                      return { pijn: 'grijs',    pct: grijs };
  if (laag < 70)                       return { pijn: 'duur',     pct: laag };
  return { pijn: 'grijs', pct: grijs };
}

// Tweede, losstaand signaal voor de mails: aerobe decoupling. Gebruikt als
// extra herkenningsregel bovenop de hoofddiagnose (PIJN), of juist als
// sterk-punt-compliment als de basis goed is. Zelfde drempel als de PDF
// (<=5% sterk, >5% zwak), zie de AEROBE DECOUPLING-kaart in lever-rapport.js.
// Geeft niks terug (bijpijn blijft leeg) zonder betrouwbare meting.
export function bepaalDecouplingSignaal(m) {
  const isHR = m.meetmethode === 'hartslag';
  const ruw = isHR
    ? (m.decouplingHr != null && m.decouplingHr !== '' ? parseFloat(m.decouplingHr) : null)
    : (m.decoupling   != null && m.decoupling   !== '' ? parseFloat(m.decoupling)   : null);
  if (ruw === null || Number.isNaN(ruw)) return { bijpijn: '', decouplTxt: '' };
  const decouplTxt = `${String(ruw).replace('.', ',')}%`;
  return { bijpijn: ruw > 5 ? 'decoupling-zwak' : 'decoupling-sterk', decouplTxt };
}
