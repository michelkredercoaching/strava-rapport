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

// ===========================================================================
// Keuzes per eetmoment
// ===========================================================================
// Per moment zie je er DRIE en kies je er ÉÉN. Dat is het verschil tussen
// "2,5 koolhydraatblokken" en iets waar je vanavond mee in de keuken staat.
//
// De opties noemen bewust geen hoeveelheden: de grammen staan bij het moment
// al vermeld, dus dezelfde optie is in week 1 een grotere portie dan in week
// 10 als het plan naar beneden is bijgesteld.
//
// Welke drie je ziet staat niet vast. Ze zijn getagd, en `kiesOpties` zet de
// opties bovenaan die passen bij wat de intake zegt (vegetarisch, geen
// zuivel, weinig kooktijd) en bij wat er de afgelopen weken gebeurde
// (stilstand, te snel, 's avonds snoepen). Een papieren plan kan dat niet.
//
// tags: eiwitrijk | verzadigend | snel | vegetarisch | zuivelvrij | warm
const OPTIES = {
  ontbijt: [
    { tekst: 'Havermout met melk, banaan en een schep eiwitpoeder', tags: ['eiwitrijk', 'verzadigend', 'vegetarisch'] },
    { tekst: 'Kwark of skyr met muesli en fruit',                   tags: ['eiwitrijk', 'snel', 'vegetarisch'] },
    { tekst: 'Drie eieren met volkoren brood en wat fruit',         tags: ['eiwitrijk', 'verzadigend', 'vegetarisch', 'zuivelvrij', 'warm'] },
    { tekst: 'Volkoren brood met pindakaas en een banaan',          tags: ['snel', 'vegetarisch', 'zuivelvrij'] },
    { tekst: 'Havermout met sojadrink, appel en noten',             tags: ['verzadigend', 'vegetarisch', 'zuivelvrij'] }
  ],
  rond_training: [
    { tekst: 'Vooraf een krentenbol of twee plakken ontbijtkoek',   tags: ['snel', 'vegetarisch', 'zuivelvrij'] },
    { tekst: 'Na de rit een shake met banaan en een paar boterhammen', tags: ['eiwitrijk', 'snel', 'vegetarisch'] },
    { tekst: 'Na de rit brood met kipfilet of een bakje kwark',     tags: ['eiwitrijk', 'snel'] },
    { tekst: 'Na de rit rijst met ei en groente',                   tags: ['eiwitrijk', 'verzadigend', 'vegetarisch', 'zuivelvrij', 'warm'] },
    { tekst: 'Vooraf een wit broodje met jam en een banaan',        tags: ['snel', 'vegetarisch', 'zuivelvrij'] },
    { tekst: 'Na de rit een broodje kipfilet of zalm met een bidon water en zout', tags: ['eiwitrijk', 'snel', 'zuivelvrij'] }
  ],
  lunch: [
    { tekst: 'Volkoren boterhammen met kip, ei of tonijn en rauwkost', tags: ['eiwitrijk', 'snel', 'zuivelvrij'] },
    { tekst: 'Twee wraps met kip of tonijn en veel groente',        tags: ['eiwitrijk', 'snel', 'zuivelvrij'] },
    { tekst: 'Restje warme maaltijd van gisteren',                  tags: ['verzadigend', 'snel', 'warm'] },
    { tekst: 'Rijst- of pastasalade met kikkererwten en groente',   tags: ['verzadigend', 'vegetarisch', 'zuivelvrij'] },
    { tekst: 'Grote kom soep met brood en een bakje kwark erbij',   tags: ['verzadigend', 'warm', 'vegetarisch'] },
    { tekst: 'Volkoren boterhammen met ei, hummus en rauwkost',     tags: ['snel', 'vegetarisch', 'zuivelvrij'] },
    { tekst: 'Wraps met falafel of hummus en veel groente',         tags: ['verzadigend', 'snel', 'vegetarisch', 'zuivelvrij'] }
  ],
  avond: [
    { tekst: 'Kip, vis of vlees met veel groente en rijst, pasta of aardappelen', tags: ['eiwitrijk', 'verzadigend', 'zuivelvrij', 'warm'] },
    { tekst: 'Roerbak met runderreepjes of kikkererwten en couscous', tags: ['eiwitrijk', 'snel', 'zuivelvrij', 'warm'] },
    { tekst: 'Gewoon wat er op tafel staat, met jouw portie zetmeel apart afgemeten', tags: ['snel'] },
    { tekst: 'Ovenschotel met veel groente, aardappel en kaas of kip', tags: ['verzadigend', 'warm'] },
    { tekst: 'Linzen- of bonenschotel met rijst en groente',        tags: ['verzadigend', 'vegetarisch', 'zuivelvrij', 'warm'] },
    { tekst: 'Pasta met tomatensaus, linzen en veel groente',       tags: ['verzadigend', 'snel', 'vegetarisch', 'zuivelvrij', 'warm'] },
    { tekst: 'Roerbak met tofu of kikkererwten en couscous',        tags: ['eiwitrijk', 'snel', 'vegetarisch', 'zuivelvrij', 'warm'] },
    { tekst: 'Groenteschotel uit de oven met aardappel en feta',    tags: ['verzadigend', 'vegetarisch', 'warm'] }
  ],
  tussendoor: [
    { tekst: 'Een bakje kwark of skyr met fruit',                   tags: ['eiwitrijk', 'verzadigend', 'snel', 'vegetarisch'] },
    { tekst: 'Fruit met een handje noten',                          tags: ['snel', 'vegetarisch', 'zuivelvrij'] },
    { tekst: 'Twee maiswafels of een boterham met kipfilet',        tags: ['eiwitrijk', 'snel', 'zuivelvrij'] },
    { tekst: 'Een eiwitreep of shake, als noodoptie onderweg',      tags: ['eiwitrijk', 'snel', 'vegetarisch'] },
    { tekst: 'Een boterham met pindakaas',                          tags: ['snel', 'vegetarisch', 'zuivelvrij'] },
    { tekst: 'Rauwkost met hummus',                                 tags: ['verzadigend', 'snel', 'vegetarisch', 'zuivelvrij'] }
  ]
};

// Welke drie opties krijgt déze deelnemer déze week te zien.
//
// profiel: { vegetarisch, geenZuivel, weinigTijd }   (uit de intake)
// situatie: 'stilstand' | 'tesnel' | 'avond' | 'normaal'  (uit de check-in)
//
// Harde filters eerst (wat iemand niet eet, laat je niet zien), daarna een
// voorkeur. De volgorde is bewust: bij stilstand wil je verzadiging en eiwit
// bovenaan, bij te snel afvallen juist de makkelijk weg te eten opties, en
// wie 's avonds snoept heeft overdag te weinig binnengekregen.
const VOORKEUR = {
  stilstand: ['verzadigend', 'eiwitrijk'],
  tesnel:    ['snel', 'warm'],
  avond:     ['verzadigend', 'eiwitrijk'],
  normaal:   []
};

export function kiesOpties(moment, profiel = {}, situatie = 'normaal', aantal = 3) {
  const pool = OPTIES[moment] || [];
  let kandidaten = pool.filter(o => {
    if (profiel.vegetarisch && !o.tags.includes('vegetarisch')) return false;
    if (profiel.geenZuivel && !o.tags.includes('zuivelvrij')) return false;
    if (profiel.weinigTijd && !o.tags.includes('snel')) return false;
    return true;
  });
  // Filter te streng afgesteld? Dan liever drie opties die net niet perfect
  // passen dan een leeg vakje. Alleen het dieetfilter blijft dan staan.
  if (kandidaten.length < aantal) {
    kandidaten = pool.filter(o => {
      if (profiel.vegetarisch && !o.tags.includes('vegetarisch')) return false;
      if (profiel.geenZuivel && !o.tags.includes('zuivelvrij')) return false;
      return true;
    });
  }
  const wens = VOORKEUR[situatie] || [];
  const score = o => wens.reduce((n, tag) => n + (o.tags.includes(tag) ? 1 : 0), 0);
  return [...kandidaten]
    .sort((a, b) => score(b) - score(a))
    .slice(0, aantal)
    .map(o => o.tekst);
}

export function voorbeelddag(dag, profiel = {}, situatie = 'normaal') {
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
      sleutel: moment,
      moment: MOMENTNAAM[moment],
      kh: Math.round(blokkenThuis * deel * 10) / 10,
      kcal: Math.round(kcalThuis * deel / 25) * 25,
      // Kies er ÉÉN uit, niet alledrie. Dat is de meest gestelde vraag
      // bij dit soort lijstjes, dus het staat ook op de pagina zelf.
      kies: kiesOpties(moment, profiel, situatie)
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

  // Voor en na de rit. Dit zijn de twee momenten waarop mensen in een
  // afvalprogramma gaan bezuinigen, en precies de twee waarop dat je training
  // en je herstel kost. LET OP: dit eten zit AL in je dagtotaal (het valt
  // onder ontbijt en "rond je training"), het komt er niet bovenop. Alleen
  // wat je ÓP de fiets eet wordt apart van het dagtotaal afgehaald.
  const lang = uren >= 2.5;
  const voor = {
    wanneer: '2 tot 3 uur voor vertrek',
    koolhydraten: lang ? '80 tot 120 gram' : '60 tot 90 gram',
    eiwit: '25 tot 35 gram',
    voorbeelden: [
      'Havermout met melk, banaan en een schep eiwitpoeder',
      'Twee krentenbollen met jam en een bakje kwark',
      'Brood met pindakaas en een banaan'
    ]
  };
  const na = {
    wanneer: 'binnen een uur na de rit',
    eiwit: '25 tot 40 gram',
    koolhydraten: lang ? '80 tot 120 gram' : '60 tot 90 gram',
    voorbeelden: [
      'Shake met banaan en een paar boterhammen',
      'Kwark met muesli, en daarna gewoon je avondeten',
      'Rijst met ei en groente'
    ],
    waarom: 'Dit is de maaltijd waarop je niet moet bezuinigen. Hier zit je herstel. Je tekort haal je op de dagen dat je niet of rustig rijdt, niet hier.'
  };

  return {
    totaal,
    perUur: gPerUur,
    voor,
    na,
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
// Gewoontes: één per week
// ===========================================================================
// De rekensom klopt wel, maar mensen vallen niet om op de rekensom. Ze vallen
// om op de avond. Dit zijn de gedragsregels die daarover gaan, één per week
// op de pagina, zodat het er twaalf weken lang eentje tegelijk is in plaats
// van een lijst die niemand leest.
//
// De eerste staat niet voor niets bovenaan: wie overdag genoeg eet, snoept
// 's avonds vanzelf minder. Het grootste deel van het ongeplande eten komt
// niet uit trek maar uit een tekort dat eerder op de dag is opgebouwd.
export const GEWOONTES = [
  {
    kop: 'Eet overdag genoeg, dan regelt de avond zichzelf',
    tekst: 'Bijna niemand verliest het op zijn avondeten. Je verliest het op wat er daarna nog bij komt. En dat komt zelden uit trek: het komt uit een gat dat je overdag hebt laten vallen. Vul je ontbijt, je lunch en je tussendoortje gewoon in zoals ze er staan, dan merk je dat de behoefte om door te eten vanzelf kleiner wordt.'
  },
  {
    kop: 'Eén snackmoment, en dat plan je',
    tekst: 'Niet niks, want dat houd je geen twaalf weken vol. Wel één keer, bewust, en niet vier keer achter elkaar omdat het al mis was. Twee koekjes bij de thee die je van tevoren hebt gepakt zijn iets anders dan een pak op schoot.'
  },
  {
    kop: 'Portioneer vooraf',
    tekst: 'Pak wat je gaat eten en zet de rest weg voordat je gaat zitten. Dit is geen wilskracht maar logistiek. Uit een zak eten eindigt bij iedereen hetzelfde, ook bij mensen die denken dat ze het wel kunnen inschatten.'
  },
  {
    kop: 'Spaar niet voor de avond',
    tekst: 'Overslaan of klein houden om later ruimte te hebben werkt niet. Je komt uitgehongerd aan tafel, je eet er ruim overheen, en je hebt je training er ook nog mee verzwakt. Het tekort staat al in je plan, op de dagen waar het niets kost.'
  },
  {
    kop: 'Je eiwit blijft staan, ook op een rustdag',
    tekst: 'Veel mensen laten juist op een rustdag de kip of de kwark weg omdat ze toch niets doen. Precies verkeerd om. Je eiwit beschermt je spieren tijdens het afvallen, en dat is de reden dat je watts overeind blijven. Dat getal is elke dag hetzelfde.'
  },
  {
    kop: 'Drink je calorieën niet',
    tekst: 'Een biertje, een glas wijn, een cappuccino met siroop: dat telt mee en het verzadigt niet. Dit is geen verbod. Het is alleen de goedkoopste plek om ruimte te vinden, want je mist er niets van op de fiets.'
  },
  {
    kop: 'Eén eiwitbron per moment, en wissel ze af',
    tekst: 'Drie keer per dag kwark werkt een week en daarna niet meer. Wissel tussen zuivel, ei, vlees, vis en peulvruchten. Variatie is hier geen gezondheidspraatje maar de reden dat je het in week tien nog steeds doet.'
  },
  {
    kop: 'Buiten de deur eten is geen weggegooide week',
    tekst: 'Een avond uit of een verjaardag kost je geen resultaat. Twee weken denken dat het toch al mislukt is, dat kost je resultaat. Eet wat er is, geniet ervan, en pak de dag erna gewoon je plan weer op. Je weekgemiddelde merkt er nauwelijks iets van.'
  },
  {
    kop: 'Zet je herstelmaaltijd klaar voordat je vertrekt',
    tekst: 'Na een lange rit heb je geen zin om te koken en dan eet je wat er het eerst binnen handbereik ligt. Zet voor je vertrekt je shake, je brood of je restje klaar. Dit is de maaltijd waarop je niet moet bezuinigen.'
  },
  {
    kop: 'Honger op je rustdag hoort erbij, honger op je trainingsdag niet',
    tekst: 'Een beetje trek op een dag dat je niet fietst is precies wat er hoort te gebeuren, daar komt je gewichtsverlies vandaan. Maar heb je honger op je intervaldag of tijdens een lange rit, dan klopt er iets niet. Zet dat bij je check-in, dan stel ik het bij.'
  },
  {
    kop: 'Blijf drinken, ook in de winter',
    tekst: 'Binnen op de trainer zweet je meer dan buiten in de kou, en dorst voelt verdacht veel als trek. Een bidon met wat zout erin tijdens je training scheelt je `s avonds een hoop gegraai in de kast.'
  },
  {
    kop: 'Verander niet alles tegelijk',
    tekst: 'Je hoeft deze twaalf weken maar twee dingen te doen: je plan volgen op de dagen dat het telt, en één keer per week invullen hoe het ging. Al het andere is ruis. Wie in week één ook nog stopt met koffie, alcohol en brood houdt het tot week drie vol.'
  }
];

// Welke gewoonte hoort bij deze week. Loopt netjes door bij een programma dat
// langer duurt dan de lijst.
export function gewoonteVanDeWeek(week) {
  const i = (Math.max(1, Number(week) || 1) - 1) % GEWOONTES.length;
  return { nummer: i + 1, van: GEWOONTES.length, ...GEWOONTES[i] };
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
