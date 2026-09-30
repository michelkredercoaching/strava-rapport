// /lib/porties.js
// Vertaalt de getallen uit lib/voeding.js naar echt eten.
//
// Waarom bouwstenen en geen menu's: een weekmenu houdt niemand twaalf weken
// vol en het past nooit bij hoe iemand al eet. Blokken wel. Je leert één keer
// wat een koolhydraatblok is en daarna kun je elke dag zelf samenstellen,
// ook in een restaurant of bij je schoonmoeder.
//
// LET OP: de voedingswaarden hieronder zijn afgeronde standaardwaarden voor
// veelgebruikte producten. Michel controleert ze vóór publicatie. Ze hoeven
// niet tot op de gram te kloppen; ze moeten kloppen op portieniveau.

export const BLOK = {
  koolhydraat: 30,   // gram koolhydraten per blok
  eiwit: 25,         // gram eiwit per portie
  vet: 10            // gram vet per portie
};

// categorie: kh | eiwit | vet | fiets
// De portie is wat iemand normaal pakt, niet 100 gram, want niemand denkt in
// 100 gram.
export const PRODUCTEN = [
  // --- Koolhydraten ---
  { naam: 'Havermout',            portie: '60 g (5 el)',      cat: 'kh',    kh: 36, eiwit: 8,  vet: 4 },
  { naam: 'Volkoren brood',       portie: '2 sneetjes',       cat: 'kh',    kh: 30, eiwit: 7,  vet: 2 },
  { naam: 'Rijst',                portie: '60 g droog',       cat: 'kh',    kh: 46, eiwit: 4,  vet: 1 },
  { naam: 'Pasta',                portie: '75 g droog',       cat: 'kh',    kh: 52, eiwit: 9,  vet: 1 },
  { naam: 'Aardappel',            portie: '250 g (4 stuks)',  cat: 'kh',    kh: 38, eiwit: 5,  vet: 0 },
  { naam: 'Banaan',               portie: '1 grote',          cat: 'kh',    kh: 27, eiwit: 1,  vet: 0 },
  { naam: 'Krentenbol',           portie: '1 stuk',           cat: 'kh',    kh: 30, eiwit: 4,  vet: 2 },
  { naam: 'Ontbijtkoek',          portie: '2 plakken',        cat: 'kh',    kh: 32, eiwit: 2,  vet: 1 },
  { naam: 'Couscous of bulgur',   portie: '60 g droog',       cat: 'kh',    kh: 42, eiwit: 7,  vet: 1 },
  { naam: 'Wrap',                 portie: '2 stuks',          cat: 'kh',    kh: 44, eiwit: 7,  vet: 5 },

  // --- Eiwit ---
  { naam: 'Magere kwark',         portie: '250 g',            cat: 'eiwit', kh: 10, eiwit: 25, vet: 1 },
  { naam: 'Skyr',                 portie: '200 g',            cat: 'eiwit', kh: 8,  eiwit: 22, vet: 0 },
  { naam: 'Kipfilet',             portie: '120 g',            cat: 'eiwit', kh: 0,  eiwit: 27, vet: 2 },
  { naam: 'Zalm',                 portie: '120 g',            cat: 'eiwit', kh: 0,  eiwit: 24, vet: 16 },
  { naam: 'Tonijn uit blik',      portie: '1 blikje (150 g)', cat: 'eiwit', kh: 0,  eiwit: 26, vet: 1 },
  { naam: 'Eieren',               portie: '3 stuks',          cat: 'eiwit', kh: 0,  eiwit: 19, vet: 15 },
  { naam: 'Magere runderreepjes', portie: '120 g',            cat: 'eiwit', kh: 0,  eiwit: 26, vet: 5 },
  { naam: 'Griekse yoghurt 2%',   portie: '250 g',            cat: 'eiwit', kh: 10, eiwit: 22, vet: 5 },
  { naam: 'Eiwitshake',           portie: '1 schep (30 g)',   cat: 'eiwit', kh: 2,  eiwit: 24, vet: 1 },
  { naam: 'Kikkererwten',         portie: '200 g uit blik',   cat: 'eiwit', kh: 26, eiwit: 15, vet: 5 },

  // --- Vet ---
  { naam: 'Olijfolie',            portie: '1 el',             cat: 'vet',   kh: 0,  eiwit: 0,  vet: 14 },
  { naam: 'Pindakaas',            portie: '1 el (15 g)',      cat: 'vet',   kh: 2,  eiwit: 4,  vet: 8 },
  { naam: 'Noten',                portie: 'handje (25 g)',    cat: 'vet',   kh: 3,  eiwit: 5,  vet: 15 },
  { naam: 'Avocado',              portie: 'halve',            cat: 'vet',   kh: 2,  eiwit: 2,  vet: 15 },
  { naam: 'Kaas 30+',             portie: '2 plakken',        cat: 'vet',   kh: 0,  eiwit: 12, vet: 12 },

  // --- Op de fiets ---
  { naam: 'Sportdrank',           portie: 'bidon 500 ml',     cat: 'fiets', kh: 30, eiwit: 0,  vet: 0 },
  { naam: 'Energiereep',          portie: '1 reep',           cat: 'fiets', kh: 25, eiwit: 2,  vet: 3 },
  { naam: 'Gel',                  portie: '1 gel',            cat: 'fiets', kh: 22, eiwit: 0,  vet: 0 },
  { naam: 'Banaan',               portie: '1 grote',          cat: 'fiets', kh: 27, eiwit: 1,  vet: 0 },
  { naam: 'Wit broodje met jam',  portie: '1 stuk',           cat: 'fiets', kh: 35, eiwit: 4,  vet: 2 },
  { naam: 'Ontbijtkoek',          portie: '2 plakken',        cat: 'fiets', kh: 32, eiwit: 2,  vet: 1 }
];

// ===========================================================================
// Een dag vertalen naar blokken
// ===========================================================================
// In: de dag uit berekenPlan (kcal, koolhydraten, eiwit, vet)
// Uit: hoeveel blokken van elk, plus wat dat betekent in producten.
export function vertaalDag(dag) {
  const khBlokken = Math.round(dag.koolhydraten / BLOK.koolhydraat);
  const eiwitPorties = Math.round(dag.eiwit / BLOK.eiwit);
  const vetPorties = Math.round(dag.vet / BLOK.vet);
  return {
    kcal: dag.kcal,
    khBlokken,
    eiwitPorties,
    vetPorties,
    uitleg: [
      `${khBlokken} koolhydraatblokken van ${BLOK.koolhydraat} gram`,
      `${eiwitPorties} eiwitporties van ${BLOK.eiwit} gram`,
      `${vetPorties} vetporties van ${BLOK.vet} gram`
    ]
  };
}

// ===========================================================================
// Een voorbeelddag, opgebouwd uit de blokken
// ===========================================================================
// Geen voorschrift maar een ijkpunt: zo ziet jouw dag eruit als je hem simpel
// invult. De verdeling volgt de trainingsdag: meer rond de training.
const VERDELING = {
  rust:     { ontbijt: 0.25, lunch: 0.30, avond: 0.30, tussendoor: 0.15 },
  training: { ontbijt: 0.25, rond_training: 0.20, lunch: 0.22, avond: 0.25, tussendoor: 0.08 }
};

export function voorbeelddag(dag) {
  const b = vertaalDag(dag);
  const isTraining = dag.type && dag.type !== 'rust';

  // Wat je ÓP de fiets eet zit al in het dagtotaal. Dat halen we er eerst af,
  // anders verdelen we die grammen een tweede keer over de maaltijden en eet
  // iemand op een lange dag honderden grammen te veel.
  const ritKh = isTraining && dag.uren && dag.koolhydratenPerUur
    ? Math.round(dag.uren * dag.koolhydratenPerUur) : 0;
  const ritKcal = ritKh * 4;
  const khThuis = Math.max(0, dag.koolhydraten - ritKh);
  const kcalThuis = Math.max(0, dag.kcal - ritKcal);
  const blokkenThuis = Math.round(khThuis / BLOK.koolhydraat);

  const verdeling = isTraining ? VERDELING.training : VERDELING.rust;
  const momenten = [];
  for (const [moment, deel] of Object.entries(verdeling)) {
    momenten.push({
      moment: MOMENTNAAM[moment],
      kh: Math.round(blokkenThuis * deel * 10) / 10,
      kcal: Math.round(kcalThuis * deel / 25) * 25
    });
  }
  return { ...b, isTraining, ritKh, khThuis, kcalThuis, blokkenThuis, momenten };
}

const MOMENTNAAM = {
  ontbijt: 'Ontbijt',
  rond_training: 'Rond je training',
  lunch: 'Lunch',
  avond: 'Avondeten',
  tussendoor: 'Tussendoor'
};

// ===========================================================================
// Eten op de fiets
// ===========================================================================
// In: uren en gram koolhydraten per uur uit het plan.
// Uit: het totaal, plus twee concrete manieren om daaraan te komen.
export function ritVoeding({ uren, gPerUur }) {
  if (!uren || !gPerUur) return null;
  const totaal = Math.round(uren * gPerUur);
  const fiets = PRODUCTEN.filter(p => p.cat === 'fiets');
  const bidon = fiets.find(p => p.naam === 'Sportdrank');
  const reep = fiets.find(p => p.naam === 'Energiereep');
  const gel = fiets.find(p => p.naam === 'Gel');
  const banaan = fiets.find(p => p.naam === 'Banaan');

  // Manier 1: drinken plus repen. Manier 2: gewoon eten uit de keuken.
  const bidons = Math.max(1, Math.round(uren));
  const restNa = Math.max(0, totaal - bidons * bidon.kh);
  const repen = Math.round(restNa / reep.kh);

  const uitKeuken = Math.ceil(totaal / 33);  // broodje of ontbijtkoek, ~33 g

  return {
    totaal,
    perUur: gPerUur,
    manieren: [
      { naam: 'Met sportdrank',
        onderdelen: [`${bidons} bidon${bidons > 1 ? 's' : ''} sportdrank`,
                     repen > 0 ? `${repen} reep${repen > 1 ? 'jes' : ''} of gel` : null].filter(Boolean) },
      { naam: 'Uit je eigen keuken',
        onderdelen: [`${uitKeuken} portie${uitKeuken > 1 ? 's' : ''} ontbijtkoek, krentenbol of banaan`,
                     'water met een snuf zout'] }
    ],
    let_op: gPerUur >= 80
      ? 'Boven de 80 gram per uur moet je darmen dit geleerd hebben. Bouw op in de weken ervoor, probeer dit niet voor het eerst in een lange rit.'
      : null
  };
}

// ===========================================================================
// Wat kan ik ruilen
// ===========================================================================
// Per categorie de producten met hoeveel blokken die portie oplevert. Dit is
// de tabel die op de pagina staat en straks ook op de Afvalkaart.
export function ruiltabel(cat) {
  return PRODUCTEN.filter(p => p.cat === cat).map(p => ({
    naam: p.naam,
    portie: p.portie,
    kh: p.kh, eiwit: p.eiwit, vet: p.vet,
    blokken: cat === 'eiwit' ? Math.round((p.eiwit / BLOK.eiwit) * 10) / 10
           : cat === 'vet'   ? Math.round((p.vet / BLOK.vet) * 10) / 10
           :                   Math.round((p.kh / BLOK.koolhydraat) * 10) / 10
  }));
}
