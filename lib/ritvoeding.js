// lib/ritvoeding.js
// Ritvoeding in de MKC-app (09-10-2026): wat neem je mee voor deze rit?
// Michels eigen regels (lib/coach-kennis.js, blok voeding):
//   - tot ongeveer 75 minuten rustig: water is genoeg;
//   - langer of harder: koolhydraten, begin rond 60 g per uur, getraind 80 tot 90 g;
//   - drinken 500 tot 750 ml per uur, boven anderhalf uur of bij veel zweten met
//     elektrolyten; vroeg beginnen, regelmatig, niet wachten tot je honger hebt;
//   - geen dure spullen nodig: banaan, ontbijtkoek, wit brood met jam, rijstwafels,
//     sportdrank, gels.
// 15-10-2026: persoonlijk gemaakt.
//   - gewend: wat je darm nu aankan ('weinig' = rond 30 g, '60', '80' = 80 of meer).
//     Je krijgt nooit meer dan je gewend bent plus een klein stapje: zo train je je darm
//     op zonder maagklachten (Michel: begin op 60, train op naar 80 tot 90).
//   - schema: wanneer je wat eet en drinkt, elke 20 minuten.
//   - doelDag: de dag van je tocht, iets hoger mikken als je dat gewend bent, cafeïne.
//   - afvallen: op je rit niet bezuinigen ("snijd nooit op je kwaliteitsdag").
// Wordt in de browser geladen (import("/lib/ritvoeding.js")), dus zonder Node-imports.

const BIDON_ML = 750;
const SPORTDRANK_G = 40;    // koolhydraten per bidon sportdrank
const REEP_G = 40, GEL_G = 25, KOEK_G = 20;
// Hoeveel gram per uur je hooguit krijgt, naar wat je gewend bent.
const PLAFOND = { weinig: 40, '60': 70, '80': 90 };
const PLAFOND_ONBEKEND = 60;

const rond5 = (x) => Math.round(x / 5) * 5;
const tijd = (min) => Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');

// duur in uren, temp = gemiddelde temperatuur tijdens de rit, hard = harde training.
export function voedingAdvies({ duur = 2, temp = 15, hard = false, gewend = null, doelDag = false, doelNaam = '', afvallen = false, zweet = null } = {}) {
  duur = Math.max(0.5, Number(duur) || 2);
  temp = Number.isFinite(Number(temp)) ? Number(temp) : 15;
  if (!PLAFOND[gewend]) gewend = null;

  // Koolhydraten per uur: wat de rit vraagt...
  let nodig;
  if (duur <= 1.25) nodig = hard || doelDag ? 30 : 0;
  else if (duur <= 2.5) nodig = 60;
  else if (duur <= 4) nodig = 70;
  else nodig = 80;
  if ((hard || doelDag) && duur > 1.25) nodig = Math.min(90, nodig + 10);
  // ...maar nooit meer dan je darm gewend is.
  const plafond = gewend ? PLAFOND[gewend] : PLAFOND_ONBEKEND;
  const gPerUur = Math.min(nodig, plafond);
  const tekort = nodig - gPerUur;

  // Drinken per uur.
  let mlPerUur = temp >= 27 ? 900 : temp >= 20 ? 750 : temp >= 12 ? 600 : 500;
  if (hard) mlPerUur += 100;
  // Hooguit 800 ml per uur (15-10-2026, ACSM): meer drinken dan je zweet kan je natrium te laag maken.
  let heet = mlPerUur > 800; mlPerUur = Math.min(800, mlPerUur);
  // Eigen zweettest (15-10-2026): wegen voor en na een rit. Je zweet ongeveer 3% meer per graad
  // warmer dan bij je test, bij een harde rit 15% meer. Drink zo'n 75% van wat je verliest, dan
  // blijf je onder de 2% gewichtsverlies zonder te veel te drinken; hooguit een liter per uur.
  let zweetLpu = null;
  if (zweet && Number(zweet.lpu) > 0) {
    zweetLpu = Math.min(3, Math.max(0.2, Number(zweet.lpu) * (1 + 0.03 * (temp - (Number(zweet.temp) || 15))) * (hard ? 1.15 : 1)));
    mlPerUur = Math.round(Math.min(1000, Math.max(300, zweetLpu * 750)) / 50) * 50;
    heet = false;
  }
  const totaalMl = Math.round(mlPerUur * duur);
  const bidons = Math.max(1, Math.ceil(totaalMl / BIDON_ML));
  const elektrolyten = duur > 1.5 || temp >= 22;

  // Koolhydraten in totaal; eerste 20 minuten tellen niet mee.
  const totaalG = gPerUur ? rond5(gPerUur * Math.max(0, duur - 1 / 3)) : 0;

  // Hoe je het binnenkrijgt: eerst uit je bidons, de rest vast en een gel voor het eind.
  const items = [];
  const meeBidons = Math.min(bidons, 2);
  const bijvullen = bidons - meeBidons;
  let rest = totaalG, drankG = 0, bijDrank = 0, repen = 0, koek = 0, gel = 0;
  if (!totaalG) {
    items.push(meeBidons === 1 ? '1 bidon water' : `${meeBidons} bidons water`);
  } else {
    // Ook de bidons die je onderweg bijvult tellen mee als sportdrank (poeder in een zakje mee).
    const drankTot = Math.min(bidons, Math.ceil(totaalG / SPORTDRANK_G));
    const drankBidons = Math.min(meeBidons, drankTot);
    bijDrank = drankTot - drankBidons;
    const waterBidons = meeBidons - drankBidons;
    drankG = Math.min(rest, drankTot * SPORTDRANK_G);
    rest -= drankG;
    items.push(`${drankBidons === 1 ? '1 bidon' : drankBidons + ' bidons'} sportdrank${bijDrank ? ', plus poeder voor nog ' + (bijDrank === 1 ? '1 bidon' : bijDrank + ' bidons') : ''} (samen ${drankG} gram)`);
    if (waterBidons) items.push(waterBidons === 1 ? '1 bidon water' : `${waterBidons} bidons water`);
    if (rest > 0) {
      // Laatste uur bij een lange of harde rit: één gel, de rest repen of koek.
      gel = duur >= 2 || hard ? 1 : 0;
      rest -= gel * GEL_G;
      repen = Math.max(0, Math.floor(rest / REEP_G));
      rest -= repen * REEP_G;
      koek = rest > 5 ? Math.ceil(rest / KOEK_G) : 0;
      if (repen) items.push(`${repen === 1 ? '1 reep' : repen + ' repen'} (of per reep anderhalve banaan of 2 plakken ontbijtkoek)`);
      if (koek) items.push(`${koek === 1 ? '1 plak' : koek + ' plakken'} ontbijtkoek`);
      if (gel) items.push('1 gel voor het laatste uur');
    }
  }
  if (bijvullen > 0) items.push(`onderweg ${bijvullen === 1 ? 'nog 1 bidon' : 'nog ' + bijvullen + ' bidons'} bijvullen${bijDrank ? (bijDrank < bijvullen ? ', ' + bijDrank + ' met sportdrank' : ' met sportdrank') : ''}`);

  // Eetschema: elke 20 minuten een moment, vanaf 20 minuten na de start.
  const schema = [];
  const eind = Math.round(duur * 60);
  const momenten = [];
  for (let m = 20; m <= eind - 10; m += 20) momenten.push(m);
  if (momenten.length) {
    const slok = Math.round(mlPerUur / 3 / 50) * 50;
    // Vaste happen van ongeveer 20 gram: halve repen en plakken koek; de gel in het laatste uur.
    const happen = [];
    for (let i = 0; i < repen; i++) happen.push('halve reep', 'halve reep');
    for (let i = 0; i < koek; i++) happen.push('plak ontbijtkoek');
    const gelMoment = gel ? momenten.filter((m) => m >= eind - 60).slice(-2)[0] || momenten[momenten.length - 1] : null;
    const vrij = momenten.filter((m) => m !== gelMoment);
    const perMoment = {};
    happen.forEach((h, i) => {
      const m = vrij.length ? vrij[Math.min(vrij.length - 1, Math.floor(i * vrij.length / happen.length))] : momenten[0];
      (perMoment[m] = perMoment[m] || []).push(h);
    });
    for (const m of momenten) {
      const wat = [`${slok} ml uit je bidon`];
      if (perMoment[m]) { const h = perMoment[m]; const halve = h.filter((x) => x === 'halve reep').length; const l = (halve >= 2 ? ['reep'] : halve ? ['halve reep'] : []).concat(h.filter((x) => x !== 'halve reep')); wat.push(l.join(' en ')); }
      if (m === gelMoment) wat.push('gel');
      schema.push({ t: tijd(m), wat: wat.join(' + ') });
    }
  }

  // Wat je darm aankan en hoe je verder opbouwt.
  let opbouw = '';
  if (totaalG || tekort) {
    if (!gewend && tekort) opbouw = `Deze rit vraagt eigenlijk ${nodig} gram per uur. Ik reken met ${gPerUur}, omdat ik nog niet weet wat jij gewend bent. Geef het hieronder aan, dan reken ik precies voor jou.`;
    else if (!gewend) opbouw = 'Geef hieronder aan hoeveel je onderweg gewend bent te eten, dan houd ik daar rekening mee.';
    else if (tekort) opbouw = `Deze rit vraagt eigenlijk ${nodig} gram per uur, maar je bent ${gewend === 'weinig' ? 'weinig' : 'rond ' + gewend + ' gram'} gewend. Daarom reken ik met ${gPerUur}: meer ineens geeft vaak maagklachten. Bouw op je gewone ritten elke week zo'n 10 gram per uur op, dan zit je over een paar weken op ${nodig}.`;
    else if (gewend === 'weinig') opbouw = 'Je bent nog weinig eten gewend. Prima voor deze rit; wil je langer of harder, bouw dan elke week zo\'n 10 gram per uur op richting 60.';
  }

  // Tips in Michels woorden.
  const tips = [];
  if (!totaalG) tips.push('Korte rustige rit: water is genoeg. Je hebt anderhalf tot twee uur brandstof in je spieren.');
  else {
    tips.push('Begin na een minuut of twintig met eten en drinken, en neem daarna elke twintig minuten een paar slokken of happen. Wacht niet tot je honger hebt, dan ben je te laat. Zet een herinnering op je Garmin of Wahoo, dan vergeet je het niet.');
    if (gPerUur >= 70) tips.push('Kies bij zoveel gram per uur een mix van suikers (glucose en fructose), die neem je beter op. Veel sportdranken en gels hebben dat al.');
  }
  if (afvallen && (totaalG || hard)) tips.push('Ook als je wilt afvallen: bezuinig niet op je rit. Snijd nooit op je kwaliteitsdag, eet minder op je rustige dagen. Te weinig onderweg kost je de training en geeft juist honger vanavond.');
  if (doelDag && totaalG) tips.push('Tochtdag: eet alleen wat je op je trainingen hebt getest, niets nieuws vandaag. Een cafeïnegel of kop koffie in het laatste uur kan helpen, als je dat gewend bent.');
  if (elektrolyten && totaalG) tips.push(temp >= 22 ? 'Het is warm: doe elektrolyten of een snufje zout in je bidons, je zweet meer zout weg dan je denkt.' : 'Doe elektrolyten in je bidons, bij een rit van deze lengte verlies je zout.');
  if (zweetLpu) tips.push(`Uit je zweettest: vandaag zweet je ongeveer ${String(Math.round(zweetLpu * 10) / 10).replace('.', ',')} liter per uur. Drink zo'n ${mlPerUur} ml per uur, dan blijf je op peil zonder te veel te drinken.`);
  if (heet) tips.push('Warm en hard: drink op je dorst, maar niet meer dan zo\'n 800 ml per uur. Te veel water kan je zoutgehalte te laag maken. Weeg je eens voor en na een rit: elke kilo minder is ongeveer een liter zweet.');
  if (duur > 2.5 || doelDag) tips.push('Ontbijt twee tot drie uur voor de start, koolhydraatrijk en vertrouwd. Niets nieuws proberen op de dag zelf.');
  if (hard || duur >= 2) tips.push('Na afloop binnen het uur koolhydraten plus 20 tot 30 gram eiwit, dan herstel je sneller.');

  return {
    doelDag, doelNaam, zweetLpu: zweetLpu && Math.round(zweetLpu * 10) / 10, gPerUur, nodig, totaalG, mlPerUur, totaalMl, bidons, elektrolyten, items, tips, schema, opbouw, gewend,
    kort: totaalG ? `${gPerUur} g/u · ${bidons} bidon${bidons > 1 ? 's' : ''}` : `water · ${bidons} bidon${bidons > 1 ? 's' : ''}`
  };
}
