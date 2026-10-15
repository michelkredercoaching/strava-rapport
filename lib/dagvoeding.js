// lib/dagvoeding.js
// Eten vandaag (15-10-2026): eet naar het werk van vandaag. Zware dag meer koolhydraten,
// rustdag minder; eiwit elke dag gelijk. Zelfde principe als de voedingsapps van de profploegen,
// maar zonder bijhouden: de app weet wat je vandaag doet (schema) of je tikt het aan.
// Getallen: koolhydraten in gram per kilo per dag (ACSM/IOC-richtlijnen: licht 3-5, matig 5-7,
// zwaar 6-10, heel zwaar 8-12; voor amateurs aan de onderkant gekozen), eiwit Michels regel 1,6 tot 1,8 g/kg (afvallen ongeveer 2),
// verdeeld over 4 momenten van 20 tot 40 gram. Na een training binnen het uur koolhydraten
// plus 20 tot 30 gram eiwit (lib/coach-kennis.js).
// Wordt in de browser geladen (import("/lib/dagvoeding.js")), dus zonder Node-imports.

export const DAG_SOORTEN = {
  rust:  { naam: 'Rustdag', kh: 3, bord: 'een kwart van je bord koolhydraten, de helft groente, een kwart eiwit' },
  licht: { naam: 'Rustig, tot een uur', kh: 4, bord: 'een kwart van je bord koolhydraten, de helft groente, een kwart eiwit' },
  matig: { naam: 'Duurrit, 1 tot 3 uur', kh: 5, bord: 'een derde koolhydraten, een derde groente, een derde eiwit' },
  zwaar: { naam: 'Harde training', kh: 6, bord: 'de helft van je bord koolhydraten, een kwart groente, een kwart eiwit' },
  lang:  { naam: 'Lange rit, 3 uur of meer', kh: 8, bord: 'de helft van je bord koolhydraten, een kwart groente, een kwart eiwit' }
};

// Soort dag uit een training (duur in uren, tss). IF = wortel(TSS / (uren x 100)).
export function soortUitTraining(trainingen) {
  const l = (trainingen || []).filter((t) => t && (t.duur || t.tss));
  if (!l.length) return 'rust';
  const duur = l.reduce((t, w) => t + (Number(w.duur) || 0), 0);
  const tss = l.reduce((t, w) => t + (Number(w.tss) || 0), 0);
  const IF = duur > 0 && tss > 0 ? Math.sqrt(tss / (duur * 100)) : 0.65;
  if (duur >= 3 || tss >= 180) return 'lang';
  if (IF >= 0.8 || tss >= 100) return 'zwaar';
  if (duur < 1.25 && IF < 0.75) return 'licht';
  return 'matig';
}

const rond5 = (x) => Math.round(x / 5) * 5;
const rond10 = (x) => Math.round(x / 10) * 10;

function ontbijt(kh) {
  if (kh < 50) return '2 boterhammen met ei of kaas en een bakje skyr';
  if (kh < 85) return `havermout (${rond10(kh * 0.7)} gram) met een banaan en kwark`;
  return `havermout (${rond10(Math.min(100, kh * 0.6))} gram) met banaan, honing en kwark, en een boterham met jam`;
}
function lunch(kh) {
  if (kh < 50) return '2 boterhammen met kip, hüttenkäse of hummus, en groente erbij';
  if (kh < 85) return '3 tot 4 boterhammen met beleg met eiwit (kip, ei, kaas) en een stuk fruit';
  return '4 boterhammen met beleg met eiwit, een krentenbol en een stuk fruit';
}
function diner(kh) {
  const pasta = rond10(kh / 0.72), aardappel = Math.round(kh / 0.17 / 50) * 50;
  return `ongeveer ${pasta} gram pasta of rijst (ongekookt) of ${aardappel} gram aardappelen, met 120 tot 150 gram kip, vis, vlees of een vervanger, en een flinke portie groente`;
}
function tussendoor(kh) {
  if (kh < 25) return 'kwark of skyr met wat fruit';
  if (kh < 50) return 'een banaan en een bakje kwark';
  return 'een krentenbol of twee rijstwafels met honing, plus kwark of een eiwitshake';
}

// gewicht in kg, soort = sleutel uit DAG_SOORTEN, training = { duur } (voor wat je onderweg eet),
// morgen = soort van morgen (of null), afvallen = doel afvallen.
export function dagVoeding({ gewicht, soort = 'rust', training = null, morgen = null, afvallen = false } = {}) {
  gewicht = Number(gewicht);
  if (!(gewicht >= 40 && gewicht <= 150)) return null;
  const s = DAG_SOORTEN[soort] ? soort : 'rust';
  const kwaliteit = s === 'zwaar' || s === 'lang';
  // Afvallen: minderen op rustige dagen, nooit op je kwaliteitsdag (Michel).
  let khKg = DAG_SOORTEN[s].kh;
  if (afvallen && (s === 'rust' || s === 'licht')) khKg -= 0.5;
  const morgenZwaar = morgen === 'zwaar' || morgen === 'lang';
  const khTotaal = rond5(khKg * gewicht);
  const eiwitKg = afvallen ? 2 : 1.7;
  const eiwit = rond5(eiwitKg * gewicht);
  const perMoment = rond5(eiwit / 4);

  // Wat je op de fiets eet telt mee (ritvoeding: rond 60 g per uur vanaf 20 minuten).
  const duur = training && Number(training.duur) || 0;
  const onderweg = duur > 1.25 ? Math.min(khTotaal * 0.45, rond5(60 * (duur - 1 / 3))) : 0;
  const rest = khTotaal - onderweg;
  const verdeling = morgenZwaar ? { o: 0.22, l: 0.23, d: 0.38, t: 0.17 } : { o: 0.25, l: 0.25, d: 0.30, t: 0.20 };
  // Normale porties: wat boven een gewone maaltijd uitkomt gaat naar een extra moment.
  const MAX = { o: 110, l: 110, d: 130, t: 80 };
  let over = 0;
  const m = {};
  for (const k of ['o', 'l', 'd', 't']) { const v = rond5(rest * verdeling[k]); m[k] = Math.min(v, MAX[k]); over += v - m[k]; }
  const maaltijden = [
    { naam: 'Ontbijt', kh: m.o, eiwit: perMoment, wat: ontbijt(m.o) },
    { naam: 'Lunch', kh: m.l, eiwit: perMoment, wat: lunch(m.l) },
    { naam: duur ? 'Na je training' : 'Tussendoor', kh: m.t, eiwit: perMoment, wat: duur ? 'binnen het uur: ' + tussendoor(m.t) : tussendoor(m.t) },
    { naam: 'Avondeten', kh: m.d, eiwit: perMoment, wat: diner(m.d) }
  ];
  if (over >= 20) maaltijden.splice(3, 0, { naam: 'Extra tussendoor', kh: rond5(over), eiwit: 0, wat: over < 50 ? 'een krentenbol of twee rijstwafels met jam' : 'een krentenbol en een banaan, of een kom yoghurt met muesli en fruit' });

  const tips = [];
  if (kwaliteit) tips.push('Kwaliteitsdag: eet je vol. Te weinig koolhydraten vandaag kost je de training, en daar word je niet sneller van.');
  if (s === 'rust') tips.push('Rustdag: minder koolhydraten, maar je eiwit blijft gelijk. Dat herstelt je spieren van de dagen ervoor.');
  if (duur && !kwaliteit && s !== 'rust') tips.push('Train je in de ochtend, eet dan 2 tot 3 uur ervoor je ontbijt. Vroeg op pad? Een banaan of boterham met jam een half uur vooraf is ook goed.');
  if (kwaliteit) tips.push('Eet 2 tot 3 uur voor je training een koolhydraatrijke maaltijd, en ga niet nuchter op pad voor intervallen.');
  if (morgenZwaar) tips.push('Morgen een ' + (morgen === 'lang' ? 'lange rit' : 'zware training') + ': eet vanavond wat extra koolhydraten, dan begin je met volle tanks.');
  if (afvallen && kwaliteit) tips.push('Ook nu je wilt afvallen: niet bezuinigen vandaag. Je tekort haal je op je rustige dagen.');
  else if (afvallen) tips.push('Wil je afvallen, dan is dit de dag om iets minder koolhydraten te eten. Houd je eiwit hoog, dan houd je je spieren en minder trek.');
  tips.push('Drink verspreid over de dag, ook als je niet traint: je urine hoort lichtgeel te zijn.');

  return {
    soort: s, naam: DAG_SOORTEN[s].naam, khKg, khTotaal, onderweg, eiwit, eiwitKg, perMoment,
    bord: DAG_SOORTEN[s].bord, maaltijden, tips
  };
}
