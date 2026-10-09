// lib/ritvoeding.js
// Ritvoeding in de MKC-app (09-10-2026): wat neem je mee voor deze rit?
// Michels eigen regels (lib/coach-kennis.js, blok voeding):
//   - tot ongeveer 75 minuten rustig: water is genoeg;
//   - langer of harder: koolhydraten, begin rond 60 g per uur, getraind 80 tot 90 g;
//   - drinken 500 tot 750 ml per uur, boven anderhalf uur of bij veel zweten met
//     elektrolyten; vroeg beginnen, regelmatig, niet wachten tot je honger hebt;
//   - geen dure spullen nodig: banaan, ontbijtkoek, wit brood met jam, rijstwafels,
//     sportdrank, gels.
// Wordt in de browser geladen (import("/lib/ritvoeding.js")), dus zonder Node-imports.

const BIDON_ML = 750;
const SPORTDRANK_G = 40;    // koolhydraten per bidon sportdrank
const REEP_G = 40, GEL_G = 25, KOEK_G = 20;

const rond5 = (x) => Math.round(x / 5) * 5;

// duur in uren, temp = gemiddelde temperatuur tijdens de rit, hard = harde training.
export function voedingAdvies({ duur = 2, temp = 15, hard = false } = {}) {
  duur = Math.max(0.5, Number(duur) || 2);
  temp = Number.isFinite(Number(temp)) ? Number(temp) : 15;

  // Koolhydraten per uur.
  let gPerUur;
  if (duur <= 1.25) gPerUur = hard ? 30 : 0;
  else if (duur <= 2.5) gPerUur = 60;
  else if (duur <= 4) gPerUur = 70;
  else gPerUur = 80;
  if (hard && duur > 1.25) gPerUur = Math.min(90, gPerUur + 10);

  // Drinken per uur.
  let mlPerUur = temp >= 27 ? 900 : temp >= 20 ? 750 : temp >= 12 ? 600 : 500;
  if (hard) mlPerUur += 100;
  const totaalMl = Math.round(mlPerUur * duur);
  const bidons = Math.max(1, Math.ceil(totaalMl / BIDON_ML));
  const elektrolyten = duur > 1.5 || temp >= 22;

  // Koolhydraten in totaal; eerste 20 minuten tellen niet mee.
  const totaalG = gPerUur ? rond5(gPerUur * Math.max(0, duur - 1 / 3)) : 0;

  // Hoe je het binnenkrijgt: eerst uit je bidons, de rest vast en een gel voor het eind.
  const items = [];
  const meeBidons = Math.min(bidons, 2);
  const bijvullen = bidons - meeBidons;
  let rest = totaalG;
  if (!totaalG) {
    items.push(meeBidons === 1 ? '1 bidon water' : `${meeBidons} bidons water`);
  } else {
    const drankBidons = Math.min(meeBidons, Math.ceil(totaalG / SPORTDRANK_G));
    const waterBidons = meeBidons - drankBidons;
    const drankG = Math.min(rest, drankBidons * SPORTDRANK_G);
    rest -= drankG;
    items.push(`${drankBidons === 1 ? '1 bidon' : drankBidons + ' bidons'} sportdrank (samen ${drankG} gram)`);
    if (waterBidons) items.push(waterBidons === 1 ? '1 bidon water' : `${waterBidons} bidons water`);
    if (rest > 0) {
      // Laatste uur bij een lange of harde rit: één gel, de rest repen of koek.
      const gel = duur >= 2 || hard ? 1 : 0;
      rest -= gel * GEL_G;
      const repen = Math.max(0, Math.floor(rest / REEP_G));
      rest -= repen * REEP_G;
      const koek = rest > 5 ? Math.ceil(rest / KOEK_G) : 0;
      if (repen) items.push(`${repen === 1 ? '1 reep' : repen + ' repen'} (of een banaan of wit brood met jam per reep)`);
      if (koek) items.push(`${koek === 1 ? '1 plak' : koek + ' plakken'} ontbijtkoek`);
      if (gel) items.push('1 gel voor het laatste uur');
    }
  }
  if (bijvullen > 0) items.push(`onderweg ${bijvullen === 1 ? 'nog 1 bidon' : 'nog ' + bijvullen + ' bidons'} bijvullen`);

  // Tips in Michels woorden.
  const tips = [];
  if (!totaalG) tips.push('Korte rustige rit: water is genoeg. Je hebt anderhalf tot twee uur brandstof in je spieren.');
  else {
    tips.push('Begin na een minuut of twintig met eten en drinken, en neem daarna elk kwartier een paar slokken of happen. Wacht niet tot je honger hebt, dan ben je te laat.');
    if (gPerUur >= 70) tips.push(`${gPerUur} gram per uur is veel als je het niet gewend bent. Bouw het rustig op op je gewone ritten, dan wennen je darmen eraan.`);
  }
  if (elektrolyten && totaalG) tips.push(temp >= 22 ? 'Het is warm: doe elektrolyten of een snufje zout in je bidons, je zweet meer zout weg dan je denkt.' : 'Doe elektrolyten in je bidons, bij een rit van deze lengte verlies je zout.');
  if (duur > 2.5) tips.push('Ontbijt twee tot drie uur voor de start, koolhydraatrijk en vertrouwd. Niets nieuws proberen op de dag zelf.');
  if (hard || duur >= 2) tips.push('Na afloop binnen het uur koolhydraten plus 20 tot 30 gram eiwit, dan herstel je sneller.');

  return {
    gPerUur, totaalG, mlPerUur, totaalMl, bidons, elektrolyten, items, tips,
    kort: totaalG ? `${gPerUur} g/u · ${bidons} bidon${bidons > 1 ? 's' : ''}` : `water · ${bidons} bidon${bidons > 1 ? 's' : ''}`
  };
}
