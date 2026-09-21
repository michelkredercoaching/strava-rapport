// /lib/pijn-signalen.js
// Gedeelde diagnose-logica voor de Power Profile-nurture-mails: welk pijnpunt
// (PIJN), welk decoupling-signaal (BIJPIJN) en welk rennerstype (RENTYPE)
// hoort bij een analyse. Gebruikt door zowel lib/lever-rapport.js (na
// betaling, volledig rapport) als api/lead.js (bij afhaken — sinds 21-09-2026
// ontsleutelt lead.js daarvoor de bewaarde blob server-side via lib/gate.js,
// dus met de ECHTE cijfers, nooit via de browser-preview). Eén bron van
// waarheid zodat de koper- en verlaten-journey dezelfde diagnose tonen.
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

// Derde signaal: rennerstype uit de curve-vorm (hoe pieky 1 min t.o.v. FTP +
// klimvermogen in W/kg). Alleen zinvol op het vermogen-spoor. Gedeeld met
// lib/lever-rapport.js (PDF-actieplan + klantmail) zodat de koper-journey,
// de verlaten-journey en het rapport zelf nooit een ander rennerstype tonen.
export function bepaalRennerstype(ftp, piek1, wGew) {
  if (!piek1 || !ftp) return null;
  const explosiviteit = piek1 / ftp;
  const wkgVoorType = wGew ? ftp / wGew : null;
  if (explosiviteit >= 2.4) return { type: 'Sprinter', uitleg: 'Korte, explosieve pieken ver boven je drempel. Je kracht zit in de sprint.' };
  if (explosiviteit >= 1.9) return { type: 'Puncheur', uitleg: 'Sterk in korte, harde inspanningen boven je drempel. Ideaal voor aanvallen en korte hellingen.' };
  if (wkgVoorType && wkgVoorType >= 3.4) return { type: 'Klimmer', uitleg: 'Relatief weinig sprintkracht, maar veel vermogen per kilo. Je motor houdt het lang volhoudend zwaar.' };
  if (explosiviteit <= 1.5) return { type: 'Tijdrijder', uitleg: 'Een vlakke curve zonder grote pieken. Jij bent het sterkst op een constant, hoog tempo.' };
  return { type: 'Allrounder', uitleg: 'Geen uitgesproken piek of dal in je curve. Je kunt op meerdere manieren meedoen.' };
}

// Vierde signaal: 5 min t.o.v. 20 min, het directe "sterk op 5, zwak op 20"-paar
// uit de reels (of andersom bij een diesel-motor). Los van rennerstype (dat gaat
// over 1 min t.o.v. FTP) — een onafhankelijk, tweede curve-signaal. FTP zelf
// blijft buiten beeld, want FTP is deels AFGELEID van de 20-min piek
// (FTP-formule), dus die twee tegen elkaar afzetten zou circulair zijn.
export function bepaalCurveBadges(piek5, piek20) {
  const badges = {};
  if (piek5 && piek20) {
    const ratio520 = piek5 / piek20;
    if (ratio520 >= 1.15) { badges['5 min'] = 'STERK'; badges['20 min'] = 'ZWAK'; }
    else if (ratio520 <= 1.03) { badges['20 min'] = 'STERK'; }
  }
  return badges;
}
