// /lib/core.js
// ÉÉN bron van waarheid voor het Core-programma voor wielrenners. Hier rekenen
// mee: de persoonlijke pagina (mijn-core.html via api/core.js), de mails en de
// verkooppagina. Inhoudelijke uitleg en de keuzes erachter staan in
// core-programma/PROGRAMMA.md. Wijzig je hier iets, draai dan
// `node scripts/core-check.mjs` en kijk of de voorbeeldplannen nog kloppen.

// ===========================================================================
// OEFENINGEN
// ===========================================================================
// Elke oefening heeft een id (= naam van de animatie), een naam, een cue, en
// `perKant: true` als hij links en rechts apart gedaan wordt.
export const OEFENINGEN = {
  // Warming-up en cooling-down
  'kat-koe':            { naam: 'Kat-koe', cue: 'Rond je rug langzaam bol en dan hol, op het ritme van je adem.' },
  'knie-borst':         { naam: 'Knie naar borst', cue: 'Op je rug, trek om en om een knie rustig naar je borst. Je onderrug blijft ontspannen.' },
  'draai-bovenrug':     { naam: 'Bovenrug draaien', cue: 'Op handen en knieën: reik met één arm onder je lijf door en draai hem dan open naar het plafond. Je ogen volgen je hand.', perKant: true },
  'curl-up':            { naam: 'Curl-up', cue: 'Handen onder je onderrug, één knie gebogen. Til hoofd en schouders een paar centimeter op, je onderrug blijft stil.' },
  'kin-intrekken':      { naam: 'Kin intrekken', cue: 'Op je rug, maak je nek lang: knik je kin rustig naar je borst zonder je hoofd op te tillen.' },
  'couch-stretch':      { naam: 'Couch-stretch', cue: 'Knie tegen de bank, voet omhoog, span je bil aan en duw je heup naar voren.', perKant: true },

  // Lijn 1: voorkant (anti-extensie)
  'deadbug-gebogen':    { naam: 'Dead bug', cue: 'Onderrug plat in de mat, strek rustig de tegenovergestelde arm en been.' },
  'deadbug-gestrekt':   { naam: 'Dead bug, benen gestrekt', cue: 'Zelfde beweging, maar je been gaat gestrekt naar beneden. Onderrug blijft plat.' },
  'hollow-hold':        { naam: 'Hollow hold', cue: 'Schouders en benen net van de grond, onderrug plat. Liever lager dan hol.' },
  'hollow-fietsen':     { naam: 'Hollow hold met fietsende benen', cue: 'Houd de hollow vast en trap langzaam met je benen alsof je fietst.' },

  // Lijn 2: plank
  'plank-knieen':       { naam: 'Plank op je knieën', cue: 'Ellebogen onder je schouders, lijn van knie tot hoofd, buik aangespannen.' },
  'plank':              { naam: 'Plank', cue: 'Lijn van hielen tot hoofd. Billen aan, niet doorzakken.' },
  'plank-schoudertik':  { naam: 'Plank met schoudertik', cue: 'Op je handen, tik afwisselend je schouder aan zonder dat je heup wiebelt.' },
  'plank-lang':         { naam: 'Lange plank', cue: 'Ellebogen een stukje voor je schouders. Zwaarder voor je buik, rug blijft recht.' },
  'body-saw':           { naam: 'Body saw', cue: 'Schuif in je plank langzaam naar achteren en terug. Voel je je onderrug, ga terug naar de lange plank.' },

  // Lijn 3: zijkant
  'zijplank-knieen':    { naam: 'Zijplank op je knieën', cue: 'Elleboog onder je schouder, heup omhoog tot een rechte lijn.', perKant: true },
  'zijplank':           { naam: 'Zijplank', cue: 'Op elleboog en voeten, heup hoog, lichaam in één lijn.', perKant: true },
  'zijplank-heupdip':   { naam: 'Zijplank met heupdip', cue: 'Laat je heup rustig zakken en duw hem weer hoog.', perKant: true },
  'zijplank-been':      { naam: 'Zijplank met been heffen', cue: 'Houd je zijplank en til je bovenste been rustig op en neer.', perKant: true },

  // Lijn 4: bil (heupstrekking)
  'bridge':             { naam: 'Glute bridge', cue: 'Duw door je hielen, heupen omhoog, knijp je billen aan.' },
  'bridge-mars':        { naam: 'Bridge met mars', cue: 'Heupen hoog en stil, til om en om een voet een stukje op.' },
  'bridge-eenbeen':     { naam: 'Bridge op één been', cue: 'Eén voet op de grond, andere knie naar je borst. Heup blijft recht.', perKant: true },
  'bridge-eenbeen-traag': { naam: 'Bridge op één been, traag zakken', cue: 'Omhoog in één tel, zakken in drie.', perKant: true },

  // Lijn 5: onderrug (neutrale rug, geen superman)
  'heupscharnier':      { naam: 'Heupscharnier', cue: 'Handen op je heupen, knieën licht gebogen. Buig vanuit je heup voorover met een rechte rug en kom omhoog door je billen aan te spannen.' },
  'fietshouding':       { naam: 'Fietshouding-houdgreep', cue: 'Buig voorover tot je fietshouding, rug recht, armen naar voren alsof je je stuur vasthebt. Vasthouden.' },
  'fietshouding-reiken':{ naam: 'Fietshouding met armen reiken', cue: 'In je fietshouding reik je om en om een arm ver naar voren. Rug blijft recht.' },
  'fietshouding-eenbeen': { naam: 'Fietshouding op één been', cue: 'Fietshouding op één been, het andere been gestrekt naar achteren.', perKant: true },

  // Lijn 6: anti-rotatie
  'birddog':            { naam: 'Bird dog', cue: 'Strek arm en tegenovergesteld been tot één lijn, je heup draait niet weg.' },
  'birddog-pauze':      { naam: 'Bird dog met pauze', cue: 'Zelfde beweging, houd drie tellen vast in de gestrekte stand.' },
  'birddog-elleboog':   { naam: 'Bird dog, elleboog naar knie', cue: 'Strek uit, breng dan elleboog en knie onder je buik naar elkaar toe.' },
  'bear-tik':           { naam: 'Bear plank met beentik', cue: 'Knieën net boven de grond, rug plat. Tik om en om een voet naar achteren.' },

  // Lijn 7: heup zijkant
  'zijlig-been':        { naam: 'Zijlig been heffen', cue: 'Op je zij, bovenste been gestrekt en iets naar achteren. Hak voorop omhoog.', perKant: true },
  'zijlig-been-hold':   { naam: 'Zijlig been heffen, 3 s vast', cue: 'Til op, houd drie tellen vast bovenin, langzaam terug.', perKant: true },
  'zijplank-knie-been': { naam: 'Zijplank op je knieën met been heffen', cue: 'Zijplank op je onderste knie, til je bovenste gestrekte been rustig op en neer.', perKant: true },
  'eenbeen-scharnier':  { naam: 'Heupscharnier op één been', cue: 'Op één been voorover kantelen, andere been naar achteren. Knie recht boven je voet.', perKant: true },

  // Lijn 8: fietsspecifiek
  'climber-traag':      { naam: 'Langzame mountain climber', cue: 'Plank op je handen, trek om en om een knie langzaam naar je borst.' },
};

// "Zo doe je hem" per oefening, in drie korte zinnen.
export const STAPPEN = {
  'curl-up': [
    'Lig op je rug, één knie gebogen, het andere been gestrekt. Handen onder je onderrug.',
    'Span je buik licht aan en til hoofd en schouders een paar centimeter op.',
    'Even vasthouden, rustig ademen, en weer zakken. Je onderrug beweegt niet.'
  ],
  'kin-intrekken': [
    'Lig op je rug met je knieën gebogen, hoofd op de mat.',
    'Maak je nek lang: knik je kin rustig richting je borst, je hoofd blijft liggen.',
    'Even vasthouden en ontspannen. Je voelt het achter in je nek.'
  ],
  'kat-koe': [
    'Op handen en knieën, handen onder je schouders.',
    'Adem uit en maak je rug bol, kin naar je borst.',
    'Adem in en maak je rug hol, kijk iets omhoog.'
  ],
  'knie-borst': [
    'Lig op je rug, benen gestrekt.',
    'Trek één knie met beide handen rustig naar je borst.',
    'Even vasthouden, terug en wissel.'
  ],
  'draai-bovenrug': [
    'Op handen en knieën, rug recht.',
    'Reik met één arm onder je lijf door naar de andere kant.',
    'Draai hem daarna open naar het plafond en kijk je hand na.'
  ],
  'couch-stretch': [
    'Knie tegen de bank of de muur, onderbeen omhoog ertegenaan.',
    'Andere voet plat voor je, romp rechtop.',
    'Knijp je bil aan en duw je heup rustig naar voren.'
  ],
  'deadbug-gebogen': [
    'Lig op je rug, armen recht omhoog, knieën 90 graden boven je heupen.',
    'Druk je onderrug plat in de mat.',
    'Strek één arm naar achteren en het andere been naar voren. Terug en wissel.'
  ],
  'deadbug-gestrekt': [
    'Zelfde start als de dead bug, maar je benen staan gestrekt omhoog.',
    'Laat één gestrekt been zakken tot net boven de grond, andere arm naar achteren.',
    'Je onderrug blijft plat. Komt hij los, laat het been minder ver zakken.'
  ],
  'hollow-hold': [
    'Lig op je rug, armen naar achteren gestrekt.',
    'Til schouders en benen net van de grond.',
    'Onderrug plat in de mat. Liever benen hoger dan een holle rug.'
  ],
  'hollow-fietsen': [
    'Ga in je hollow hold liggen.',
    'Trap langzaam met je benen, alsof je fietst.',
    'Je onderrug blijft plat, je schouders blijven van de grond.'
  ],
  'plank-knieen': [
    'Ellebogen onder je schouders, knieën op de grond.',
    'Maak een rechte lijn van knie tot hoofd.',
    'Span je buik aan en adem rustig door.'
  ],
  'plank': [
    'Op je onderarmen en tenen, ellebogen onder je schouders.',
    'Rechte lijn van hielen tot hoofd.',
    'Billen aan, buik aan, niet doorzakken.'
  ],
  'plank-schoudertik': [
    'Hoge plank op je handen, voeten iets uit elkaar.',
    'Tik om en om met een hand je andere schouder aan.',
    'Je heup blijft stil, hij wiebelt niet mee.'
  ],
  'plank-lang': [
    'Plank op je onderarmen, maar ellebogen een stuk voor je schouders.',
    'Rechte lijn van hielen tot hoofd.',
    'Voel je het in je rug, zet je ellebogen iets dichterbij.'
  ],
  'body-saw': [
    'Plank op je onderarmen.',
    'Schuif met je hele lijf langzaam naar achteren en terug.',
    'Voel je je onderrug, ga terug naar de lange plank.'
  ],
  'zijplank-knieen': [
    'Lig op je zij, elleboog onder je schouder, knieën gebogen.',
    'Til je heup op tot een rechte lijn van knie tot hoofd.',
    'Bovenste arm naar het plafond of je hand op je heup.'
  ],
  'zijplank': [
    'Lig op je zij, elleboog onder je schouder, voeten op elkaar.',
    'Til je heup op tot een rechte lijn van voet tot hoofd.',
    'Bovenste arm naar het plafond. Heup blijft hoog.'
  ],
  'zijplank-heupdip': [
    'Begin in je zijplank.',
    'Laat je heup rustig zakken tot net boven de grond.',
    'Duw hem weer hoog. Rustig tempo.'
  ],
  'zijplank-been': [
    'Begin in je zijplank.',
    'Til je bovenste been gestrekt op en laat het weer zakken.',
    'Je heup blijft hoog, hij zakt niet weg.'
  ],
  'zijplank-knie-been': [
    'Zijplank op je onderste knie, bovenste been gestrekt.',
    'Til het bovenste been op en laat het weer zakken.',
    'Hak voorop, tenen wijzen naar voren.'
  ],
  'bridge': [
    'Lig op je rug, knieën gebogen, voeten plat op heupbreedte.',
    'Duw door je hielen en til je heupen op.',
    'Knijp je billen aan bovenin en zak gecontroleerd terug.'
  ],
  'bridge-mars': [
    'Kom omhoog in je bridge.',
    'Til om en om een voet een stukje op.',
    'Je heupen blijven hoog en recht, ze zakken niet scheef.'
  ],
  'bridge-eenbeen': [
    'Eén voet op de grond, het andere been gestrekt in de lucht.',
    'Duw door je hak en til je heup op.',
    'Je heup blijft recht, hij kantelt niet naar één kant.'
  ],
  'bridge-eenbeen-traag': [
    'Bridge op één been.',
    'Omhoog in één tel.',
    'Zakken in drie tellen. Juist dat trage zakken maakt hem zwaar.'
  ],
  'heupscharnier': [
    'Sta op heupbreedte, handen op je heupen, knieën licht gebogen.',
    'Duw je billen naar achteren en buig voorover met een rechte rug. Je kijkt mee naar de grond.',
    'Kom omhoog door je billen aan te spannen. Je rug blijft de hele tijd recht, niet bol.'
  ],
  'fietshouding': [
    'Buig vanuit je heup voorover tot je fietshouding.',
    'Rug recht, armen naar voren alsof je je stuur vasthebt.',
    'Vasthouden. Schouders laag, nek lang.'
  ],
  'fietshouding-reiken': [
    'Ga in je fietshouding staan.',
    'Reik om en om een arm ver naar voren.',
    'Je rug blijft recht en stil.'
  ],
  'fietshouding-eenbeen': [
    'Fietshouding op één been.',
    'Het andere been gestrekt naar achteren.',
    'Vasthouden zonder dat je heup wegdraait.'
  ],
  'birddog': [
    'Op handen en knieën, rug plat.',
    'Strek één arm naar voren en het andere been naar achteren.',
    'Even vast, terug en wissel. Je heup draait niet weg.'
  ],
  'birddog-pauze': [
    'Zelfde als de bird dog.',
    'Houd de gestrekte stand drie tellen vast.',
    'Rustig terug en wissel.'
  ],
  'birddog-elleboog': [
    'Strek arm en tegenovergesteld been uit.',
    'Breng elleboog en knie onder je buik naar elkaar toe.',
    'Strek weer uit. Rustig, niet zwaaien.'
  ],
  'bear-tik': [
    'Op handen en tenen, knieën net boven de grond.',
    'Rug plat, heupen op schouderhoogte.',
    'Tik om en om een voet naar achteren zonder dat je heup beweegt.'
  ],
  'zijlig-been': [
    'Lig op je zij, onderste knie licht gebogen.',
    'Til je bovenste been gestrekt op, iets naar achteren.',
    'Hak voorop en rustig weer zakken.'
  ],
  'zijlig-been-hold': [
    'Lig op je zij.',
    'Til je bovenste been op en houd het drie tellen vast.',
    'Langzaam zakken.'
  ],
  'eenbeen-scharnier': [
    'Sta op één been, knie licht gebogen.',
    'Kantel voorover, het andere been gaat gestrekt naar achteren.',
    'Je knie blijft recht boven je voet. Rustig terug.'
  ],
  'climber-traag': [
    'Hoge plank op je handen.',
    'Trek om en om een knie langzaam naar je borst.',
    'Je heup blijft laag en stil, alsof er een glas water op je rug staat.'
  ]
};
for (const id of Object.keys(OEFENINGEN)) OEFENINGEN[id].stappen = STAPPEN[id] || [];

// Wat elke lijn je op de fiets oplevert.
export const WAAROM = {
  voorkant: 'Houdt je bekken stil terwijl je benen trappen.',
  plank: 'Laat je bovenlijf dragen zonder dat je onderrug inzakt.',
  zijkant: 'Voorkomt dat je heen en weer wiebelt op het zadel als je hard trapt.',
  bil: 'Je bil levert de kracht in de neerwaartse trap.',
  onderrug: 'Houdt je rug sterk in je fietshouding, ook in het laatste uur.',
  rotatie: 'Houdt je lijf in één lijn als je klimt of sprint uit het zadel.',
  heupzijkant: 'Houdt je knie recht boven je pedaal.',
  fiets: 'Traint je romp precies in de houding van de fiets.'
};

// Lijnen met hun niveaus. Index 0 bestaat alleen bij plank (op de knieën) en
// wordt alleen gebruikt als de intake de lijn een niveau terugzet.
export const LIJNEN = {
  voorkant:    { naam: 'Voorkant',      niveaus: ['deadbug-gebogen', 'deadbug-gebogen', 'deadbug-gestrekt', 'hollow-hold', 'hollow-fietsen'] },
  plank:       { naam: 'Plank',         niveaus: ['plank-knieen', 'plank', 'plank-schoudertik', 'plank-lang', 'body-saw'] },
  zijkant:     { naam: 'Zijkant',       niveaus: ['zijplank-knieen', 'zijplank-knieen', 'zijplank', 'zijplank-heupdip', 'zijplank-been'] },
  bil:         { naam: 'Bil',           niveaus: ['bridge', 'bridge', 'bridge-mars', 'bridge-eenbeen', 'bridge-eenbeen-traag'] },
  onderrug:    { naam: 'Onderrug',      niveaus: ['heupscharnier', 'heupscharnier', 'fietshouding', 'fietshouding-reiken', 'fietshouding-eenbeen'] },
  rotatie:     { naam: 'Anti-rotatie',  niveaus: ['birddog', 'birddog', 'birddog-pauze', 'birddog-elleboog', 'bear-tik'] },
  heupzijkant: { naam: 'Heup zijkant',  niveaus: ['zijlig-been', 'zijlig-been', 'zijlig-been-hold', 'zijplank-knie-been', 'eenbeen-scharnier'] },
  fiets:       { naam: 'Fietsspecifiek', niveaus: ['climber-traag', 'climber-traag', 'climber-traag', 'climber-traag', 'climber-traag'] },
};

// ===========================================================================
// WEKEN EN SESSIES
// ===========================================================================
export const WEKEN = [
  // fase 1 Fundament
  { week: 1,  fase: 1, werk: 30, rust: 30, rondes: 2 },
  { week: 2,  fase: 1, werk: 35, rust: 25, rondes: 2 },
  { week: 3,  fase: 1, werk: 40, rust: 20, rondes: 2 },
  // fase 2 Opbouw
  { week: 4,  fase: 2, werk: 30, rust: 30, rondes: 3 },
  { week: 5,  fase: 2, werk: 35, rust: 25, rondes: 3 },
  { week: 6,  fase: 2, werk: 40, rust: 20, rondes: 3 },
  // fase 3 Kracht
  { week: 7,  fase: 3, werk: 35, rust: 25, rondes: 3 },
  { week: 8,  fase: 3, werk: 40, rust: 20, rondes: 3 },
  { week: 9,  fase: 3, werk: 45, rust: 15, rondes: 3 },
  // fase 4 Op de fiets
  { week: 10, fase: 4, werk: 40, rust: 20, rondes: 3 },
  { week: 11, fase: 4, werk: 45, rust: 15, rondes: 3 },
  { week: 12, fase: 4, werk: 45, rust: 15, rondes: 3, finisher: true },
];
export const FASES = { 1: 'Fundament', 2: 'Opbouw', 3: 'Kracht', 4: 'Op de fiets' };

// ---- Doorlopend in blokken (07-10-2026, lidmaatschap MKC-app) ----
// Na week 12 gaat het programma door: week 13-24 is blok 2, 25-36 blok 3, enz.
// Elk blok heeft dezelfde vier fases, maar begint een niveau zwaarder. Zit een
// lijn al op het hoogste niveau, dan wordt het zwaarder via langer werken.
export const BLOK_WEKEN = 12;
export function blokVan(week) { return Math.floor((Math.max(1, week) - 1) / BLOK_WEKEN) + 1; }
export function weekInBlok(week) { return ((Math.max(1, week) - 1) % BLOK_WEKEN) + 1; }
export function weekRij(week) { const w = WEKEN[weekInBlok(week) - 1]; return { ...w, week, blok: blokVan(week), weekInBlok: weekInBlok(week) }; }
// Extra seconden werk en minder rust per blok: blok 2 +5/-5, blok 3 en verder +10/-5.
export function blokZwaarder(blok) { return { werk: Math.min(10, 5 * (blok - 1)), rust: blok > 1 ? 5 : 0 }; }
export const BLOKTIPS = {
  1: 'Nieuw blok. Dezelfde opbouw als je eerste 12 weken, maar elke oefening begint een stap zwaarder. Week 1 voelt daardoor als een herstart, en dat is precies de bedoeling.',
  4: 'Halverwege je eerste fase van dit blok: je romptest staat klaar. Vergelijk hem met het einde van je vorige blok.',
  12: 'Laatste week van dit blok. Na de finisher doe je je test, en volgende week begint het volgende blok weer een stap zwaarder.',
};

// Vier oefeningen per sessie, waarvan hooguit twee per kant. Meer past niet in
// 20 minuten zodra in fase 3 en 4 de bil en de onderrug ook per kant gaan.
// Bird dog en bridge trainen de rugstrekkers mee, dus de onderrug komt vaker
// aan bod dan alleen in sessie C.
// Drie indelingen, zodat iemand kan kiezen hoe vaak per week. Per week is het
// werk ongeveer gelijk (zo'n 12 oefenplekken), alleen anders verdeeld.
//   2x: 5 oefeningen per sessie, 20 tot 25 minuten
//   3x: 4 oefeningen per sessie, 15 tot 20 minuten (de standaard)
//   4x: 3 oefeningen per sessie, 10 tot 15 minuten (bijvoorbeeld voor een rit)
// De laatste sessie van de week krijgt in fase 4 de fietsspecifieke oefening.
export const INDELINGEN = {
  2: {
    A: { naam: 'Voorkant, bil en rotatie', lijnen: ['voorkant', 'plank', 'bil', 'heupzijkant', 'rotatie'] },
    B: { naam: 'Zijkant en rug',           lijnen: ['zijkant', 'onderrug', 'voorkant', 'bil', 'rotatie'] },
  },
  3: {
    A: { naam: 'Voorkant en bil',    lijnen: ['voorkant', 'plank', 'bil', 'heupzijkant'] },
    B: { naam: 'Zijkant en rotatie', lijnen: ['zijkant', 'rotatie', 'bil', 'voorkant'] },
    C: { naam: 'Rug en houding',     lijnen: ['onderrug', 'plank', 'zijkant', 'rotatie'] },
  },
  // 4x: hooguit één oefening per kant per sessie, anders past het niet in 15 minuten.
  4: {
    A: { naam: 'Voorkant en bil',      lijnen: ['voorkant', 'bil', 'rotatie'] },
    B: { naam: 'Zijkant en plank',     lijnen: ['zijkant', 'plank', 'voorkant'] },
    C: { naam: 'Rug en rotatie',       lijnen: ['onderrug', 'plank', 'rotatie'] },
    D: { naam: 'Heup en voorkant',     lijnen: ['heupzijkant', 'voorkant', 'rotatie'] },
  },
};
export function frequentie(intake) { return [2, 3, 4].includes(Number(intake?.frequentie)) ? Number(intake.frequentie) : 3; }
export function letters(intake) { return Object.keys(INDELINGEN[frequentie(intake)]); }
// Een week is rond bij: 2x allebei, 3x twee van de drie, 4x drie van de vier.
export function nodigVoorWeek(intake) { return { 2: 2, 3: 2, 4: 3 }[frequentie(intake)]; }
// Van kant wisselen kost 5 seconden, geen volle rustpauze.
export const WISSEL = 5;

const WARMING_UP = ['kat-koe', 'knie-borst', 'draai-bovenrug'];

// ===========================================================================
// INTAKE
// ===========================================================================
export const KLACHTEN = ['onderrug', 'nek', 'knie', 'heup', 'bekkenbodem'];
export const LEEFTIJDEN = ['onder40', '40-55', '55plus'];

// Startniveau uit de starttest (Rompscore 0-100). Niet geslacht of leeftijd
// bepaalt waar je begint, maar wat je romp nu echt aankan.
export function startniveau(intake) {
  const sc = Number(intake?.startScore);
  if (!Number.isFinite(sc) || intake?.startScore == null) return 'normaal';
  if (sc < 40) return 'rustig';
  if (sc > 75) return 'sterk';
  return 'normaal';
}

// Rode vlaggen: dan geen plan, eerst huisarts of fysio.
export function heeftRodeVlag(intake) {
  return !!(intake && intake.rodeVlag);
}

// Hoeveel niveaus een lijn achterloopt, en het hoogste niveau dat mag.
function aanpassing(intake, lijn, fase, blok = 1) {
  const k = new Set(intake.klachten || []);
  let terug = 0, max = 4;
  if (k.has('onderrug') && ['voorkant', 'plank', 'onderrug'].includes(lijn)) { terug = 1; if (lijn === 'plank') max = 3; }
  // Bekkenbodem of buikspieren (bijv. na een bevalling): geen oefeningen met
  // veel druk op de buik. Dead bug met gestrekte benen is het zwaarste voor de
  // voorkant, de lange plank het zwaarste voor de plank (geen body saw).
  if (k.has('bekkenbodem')) { if (lijn === 'voorkant') max = Math.min(max, 2); if (lijn === 'plank') max = Math.min(max, 3); }
  // 55+: geen body saw, de lange plank is de top.
  if (intake.leeftijd === '55plus' && lijn === 'plank') max = Math.min(max, 3);
  // Lage starttest: de eerste fase een niveau lichter.
  // Alleen in het eerste blok: daarna is de starttest al lang achterhaald.
  if (startniveau(intake) === 'rustig' && fase === 1 && blok === 1) terug = Math.max(terug, 1);
  if (k.has('nek') && ['plank', 'onderrug'].includes(lijn)) terug = Math.max(terug, 1);
  // Ging het vorige week slechter, dan doet iemand die week opnieuw met de
  // makkelijkere variant van elke oefening.
  if (intake.verlicht) terug += 1;
  return { terug, max };
}

// ===========================================================================
// HET PLAN
// ===========================================================================
// Eén sessie uitrekenen voor een week, sessieletter en intake.
export function sessie(weekNr, letter, intake = {}) {
  const w = weekRij(weekNr);
  const zwaarder = blokZwaarder(w.blok);
  const k = new Set(intake.klachten || []);
  const rugInRust = k.has('onderrug') && intake.rugErnst === 'rust';
  // Ervaren of een sterke starttest: zwaarder. Nooit bij rugklachten.
  const regelmatig = (intake.ervaring === 'regelmatig' || startniveau(intake) === 'sterk') && !k.has('onderrug');

  // Werk en rust.
  let werk = w.werk, rust = w.rust;
  if (k.has('onderrug') && w.fase <= 2) { werk -= 5; rust += 5; }
  // Ervaren: zelfde sessieduur, maar 5 s meer werk en 5 s minder rust.
  if (regelmatig) { werk += 5; rust = Math.max(10, rust - 5); }
  // Herhaalde week na "slechter": ook korter werken en langer rusten, want wie
  // al op de lichtste variant zit, merkt anders geen verschil.
  if (intake.verlicht) { werk = Math.max(20, werk - 5); rust += 5; }
  // Gevoel na de vorige sessie (08-10-2026): "te licht" = 5 s langer werken en
  // korter rusten, "te zwaar" = andersom. Geldt tot het volgende niveau.
  if (intake.bijstel > 0 && !intake.verlicht) { werk += 5; rust = Math.max(10, rust - 5); }
  if (intake.bijstel < 0) { werk = Math.max(20, werk - 5); rust += 5; }
  // Lage starttest: de eerste fase korter werken en langer rusten.
  if (startniveau(intake) === 'rustig' && w.fase === 1 && w.blok === 1 && !k.has('onderrug')) { werk -= 5; rust += 5; }
  // 55+: herstel duurt langer, dus altijd 5 seconden extra rust.
  if (intake.leeftijd === '55plus') rust += 5;
  // Blok 2 en verder: langer werken, iets kortere rust. Niet bij een herhaalde
  // week na "slechter" en niet bij rugklachten in rust.
  if (w.blok > 1 && !intake.verlicht && !rugInRust) { werk += zwaarder.werk; rust = Math.max(10, rust - zwaarder.rust); }
  // Periodisering naar je doel (12-10-2026). Soort rijden: criteriums korter en
  // feller, lange tochten en bergen langer vasthouden vanaf de krachtfase.
  const disc = DISCIPLINES[intake.discipline] ? intake.discipline : null;
  if (disc === 'crit') { werk = Math.min(werk, 25); rust = Math.max(rust, 35); }
  else if ((disc === 'toer' || disc === 'bergen') && w.fase >= 3 && !intake.verlicht) werk += 5;
  const rond5 = (x) => Math.max(15, Math.round(x / 5) * 5);
  // Rustweek: niveau 4 en 8 van elk blok 25% minder werk (valt samen met de romptest).
  const rustweek = !intake.doelModus && [4, 8].includes(w.weekInBlok);
  const rondes = rustweek ? Math.max(2, w.rondes - 1) : w.rondes;
  // Frisheid voor je doel: 15% minder twee weken ervoor, 20% de week ervoor.
  if (MODUS_FACTOR[intake.doelModus]) werk = rond5(werk * MODUS_FACTOR[intake.doelModus]);

  // Welke lijnen.
  const indeling = INDELINGEN[frequentie(intake)];
  const sessieDef = indeling[letter] || indeling.A;
  let lijnen = sessieDef.lijnen.slice();
  // Fase 4: in de laatste sessie van de week maakt de bird dog plaats voor de
  // fietsspecifieke oefening (staat er geen bird dog in, dan komt hij erbij).
  const laatste = Object.keys(indeling).pop();
  if (w.fase === 4 && letter === laatste) {
    const i = lijnen.indexOf('rotatie');
    if (i >= 0) lijnen[i] = 'fiets'; else lijnen.push('fiets');
  }
  // Soort rijden: de focuslijn in de laatste sessie van de week, vanaf de
  // krachtfase ook de tweede focuslijn in sessie 2.
  if (disc) {
    const alle = Object.keys(indeling), focus = DISCIPLINES[disc].focus;
    const ruilIn = (f) => {
      if (lijnen.includes(f) || (f === 'fiets' && w.fase < 3)) return;
      const ruil = ['voorkant', 'bil', 'plank', 'zijkant', 'heupzijkant', 'rotatie'].find((l) => lijnen.includes(l) && !focus.includes(l));
      if (ruil) lijnen[lijnen.indexOf(ruil)] = f;
    };
    if (letter === alle[0] || letter === alle[alle.length - 1]) ruilIn(focus[0]);
    if (w.fase >= 3 && alle.length > 1 && letter === alle[1]) ruilIn(focus[1]);
  }
  // Knie: heup zijkant in elke sessie. Hij vervangt een oefening die al in een
  // andere sessie van de week zit, zodat de sessie niet langer wordt.
  if (k.has('knie') && !lijnen.includes('heupzijkant')) {
    const ruil = ['bil', 'zijkant', 'plank', 'voorkant'].find((l) => lijnen.includes(l));
    if (ruil) lijnen[lijnen.indexOf(ruil)] = 'heupzijkant'; else lijnen.push('heupzijkant');
  }
  // Rug ook in rust: eerste twee weken alleen de vriendelijkste lijnen.
  if (rugInRust && weekNr <= 2) {
    lijnen = lijnen.filter((l) => ['voorkant', 'rotatie', 'zijkant', 'bil'].includes(l));
    if (!lijnen.includes('rotatie')) lijnen.push('rotatie');
  }

  const gebruikt = new Set();
  const oefeningen = lijnen.map((lijn) => {
    // Drie weken voor je doel: de varianten staan vast (geen nieuwe oefeningen).
    const vw = intake.bevrorenWeek && intake.bevrorenWeek < weekNr ? weekRij(intake.bevrorenWeek) : w;
    const { terug, max } = aanpassing(intake, lijn, vw.fase, vw.blok);
    // Elk volgend blok begint een niveau hoger (tot het maximum van de lijn).
    const niveau = Math.max(0, Math.min(max, vw.fase + (vw.blok - 1) - terug));
    const id = LIJNEN[lijn].niveaus[niveau];
    const o = { lijn, niveau, id, waarom: WAAROM[lijn], waaromDoel: disc ? (WAAROM_DOEL[disc][lijn] || null) : null, waaromKlacht: [...k].map((x) => WAAROM_KLACHT[x] && WAAROM_KLACHT[x][lijn]).find(Boolean) || null, ...OEFENINGEN[id] };
    // Disbalans: zwakke kant eerst en wat langer.
    // Kan iemand deze oefening niet doen (beperking uit de intake of zelf
    // vervangen), dan een gelijkwaardige oefening die wel kan.
    let ander = vervangerVoor(id, intake);
    // Geen dubbele oefening in één sessie: dan de volgende vervanger.
    if (ander && gebruikt.has(ander)) ander = (VERVANGERS[id] || []).find((x) => OEFENINGEN[x] && !kanNiet(x, intake.beperkingen || []) && !gebruikt.has(x)) || ander;
    if (ander) gebruikt.add(ander);
    if (ander) Object.assign(o, { id: ander, origId: id, vervangt: OEFENINGEN[id].naam, perKant: undefined, ...OEFENINGEN[ander] });
    const db = o.perKant && intake.disbalans && intake.disbalans[DISBALANS_PAAR[lijn]];
    if (db) { o.zwak = db.kant; o.extra = db.extra; }
    return o;
  });

  // Controle achteraf: een vervanger die al in de sessie zit, wordt de volgende vervanger.
  const tel = {}; oefeningen.forEach((o) => { tel[o.id] = (tel[o.id] || 0) + 1; });
  oefeningen.forEach((o) => {
    if (!o.vervangt || tel[o.id] < 2) return;
    const orig = Object.keys(OEFENINGEN).find((x) => OEFENINGEN[x].naam === o.vervangt);
    const alt = [...(VERVANGERS[orig] || []), ...RESERVE].find((x) => OEFENINGEN[x] && !kanNiet(x, intake.beperkingen || []) && !tel[x]);
    if (alt) { tel[o.id]--; tel[alt] = 1; delete o.zwak; delete o.extra; Object.assign(o, { id: alt, perKant: undefined, ...OEFENINGEN[alt] }); }
  });
  // 4x per week zijn korte sessies, vaak vlak voor een rit: kortere warming-up
  // (kat-koe en bovenrug draaien) en een kortere stretch na afloop.
  const kort = frequentie(intake) === 4;
  let warmingUp = kort ? ['kat-koe', 'draai-bovenrug'] : WARMING_UP.slice();
  // Klachtprotocollen (12-10-2026): rug = curl-up (uit het rugprotocol, samen met
  // zijplank en bird dog in je sessies), nek = kin intrekken en bovenrug draaien.
  if (k.has('onderrug')) warmingUp.push('curl-up');
  if (k.has('nek')) warmingUp.push('kin-intrekken');
  // Hooguit 4 in de warming-up: dan valt knie naar borst weg.
  if (warmingUp.length > 4) warmingUp = warmingUp.filter((x) => x !== 'knie-borst');
  warmingUp = [...new Set(warmingUp.map((x) => vervangerVoor(x, intake) || x))];
  let coolDown = { id: 'couch-stretch', perKant: (kort ? 20 : 30) + (k.has('heup') ? 15 : 0) };
  if (vervangerVoor('couch-stretch', intake)) coolDown = { id: vervangerVoor('couch-stretch', intake), perKant: coolDown.perKant };

  const finisher = !!(w.finisher && letter === 'C');   // week 12 van elk blok
  const plekken = oefeningen.reduce((n, o) => n + (o.perKant ? 2 : 1), 0);
  const rondeSec = oefeningen.reduce((n, o) => n + (o.perKant ? werk * 2 + WISSEL + (o.extra || 0) : werk) + rust, 0);
  const werkSec = plekken * werk * rondes + oefeningen.reduce((n, o) => n + (o.extra || 0), 0) * rondes + (finisher ? 60 : 0);
  // Na de allerlaatste oefening volgt geen rust meer, net als in de speler.
  const totaalSec = warmingUp.length * 40 + rondeSec * rondes - rust + coolDown.perKant * 2 + (finisher ? 120 : 0);

  return {
    week: weekNr, blok: w.blok, weekInBlok: w.weekInBlok, fase: w.fase, faseNaam: FASES[w.fase], letter, naam: lijnen.slice(0, 2).join() === sessieDef.lijnen.slice(0, 2).join() ? sessieDef.naam : `${LIJNLABEL[lijnen[0]]} en ${LIJNLABEL[lijnen[1]].toLowerCase()}`,
    werk, rust, rondes,
    warmingUp, oefeningen, coolDown,
    finisher,
    focus: disc ? FOCUS[disc][w.fase] : null, modus: intake.doelModus || null, rustweek,
    disbalans: intake.disbalans || null,
    werkSec, minuten: Math.round(totaalSec / 60),
  };
}

// Het hele plan: 12 weken x 3 sessies.
export function maakPlan(intake = {}) {
  if (heeftRodeVlag(intake)) return { geblokkeerd: true };
  const weken = WEKEN.map((w) => ({
    week: w.week, fase: w.fase, faseNaam: FASES[w.fase],
    sessies: letters(intake).map((l) => sessie(w.week, l, intake)),
  }));
  return { geblokkeerd: false, weken, tips: tips(intake) };
}

function tips(intake) {
  const k = new Set(intake.klachten || []);
  const t = [];
  if (k.has('onderrug')) t.push('Je onderrug bepaalt het tempo. Je begint een niveau lichter, en voelt het slechter na een week, dan herhalen we die week.');
  if (k.has('knie')) t.push('Knieklachten op de fiets komen vaak door een zwakke heup of een verkeerde zadelhoogte. De heupoefeningen zitten nu in elke sessie. Laat ook je zadelhoogte even checken.');
  if (k.has('nek')) t.push('Nek- en schouderklachten komen vaak uit een stijve bovenrug. Je doet het bovenrug draaien daarom twee keer in je warming-up.');
  if (k.has('bekkenbodem')) t.push('Je doet geen oefeningen die veel druk op je buik zetten. Adem uit op het zwaarste moment van elke oefening en pers nooit. Voel je druk naar beneden of verlies je urine, stop dan en laat het checken door een bekkenfysiotherapeut.');
  if (intake.leeftijd === '55plus') t.push('Je krijgt bij elke oefening iets meer rust, want herstel duurt met de jaren wat langer. Houd minstens een dag tussen je sessies.');
  if (startniveau(intake) === 'rustig') t.push('Je starttest laat zien dat je romp nog moet wennen. Daarom begin je de eerste drie weken lichter. Dat is geen achterstand: juist hier boek je de snelste winst.');
  if (startniveau(intake) === 'sterk') t.push('Sterke starttest. Je werkt daarom vanaf het begin iets langer per oefening, met kortere rust.');
  if (frequentie(intake) === 4) t.push('Je doet korte sessies van 10 tot 15 minuten. Vlak voor een rustige rit is prima, je romp staat dan aan. Doe ze liever niet vlak voor je zwaarste intervaltraining: een moe lijf in je intervallen wil je niet.');
  if (frequentie(intake) === 2) t.push('Je doet twee langere sessies per week. Zet er minstens twee dagen tussen, dan herstelt je romp goed.');
  if (k.has('heup')) t.push('Je couch-stretch duurt 45 seconden per kant in plaats van 30. Die stretch is voor jou het belangrijkste stuk van de sessie.');
  if (intake.kracht === '1x' || intake.kracht === '2x') t.push(`Je doet ook krachttraining in de sportschool${intake.kracht === '2x' ? ', twee keer per week' : ''}. Prima combinatie. Doe je core niet op dezelfde dag als een zware beentraining, en zet je sportschool nooit de dag voor je zwaarste intervaltraining. Je core-sessies zijn kort genoeg om op een rustige fietsdag te doen.`);
  const db = intake.disbalans;
  if (db) for (const [paar, x] of Object.entries(db)) t.push(`Je ${paar === 'zijkant' ? 'zijkant' : 'bil'} is ${x.pct}% zwakker ${x.kant.toLowerCase()}. In elke oefening per kant begin je daarom met ${x.kant.toLowerCase()}, en die kant werkt ${x.extra} seconden langer. Bij je volgende romptest zie je of het verschil kleiner wordt.`);
  return t;
}

// ===========================================================================
// WEKELIJKS BIJSTUREN
// ===========================================================================
// Na elke afgeronde week: hoe reageerde je lichaam? 'beter' | 'gelijk' |
// 'slechter'. Bij slechter herhalen we de week. Na twee keer slechter op rij
// zetten we een week terug en krijgt Michel een seintje.
export function volgendeWeek(huidig, reactie, keerSlechterOpRij = 0, keerZwaarOpRij = 0) {
  // "Te zwaar" (geen pijn, wel te veel): hetzelfde niveau nog een keer.
  // Twee keer op rij te zwaar = een stapje terug (09-10-2026).
  if (reactie === 'zwaar') return { week: keerZwaarOpRij >= 1 ? Math.max(1, huidig - 1) : huidig, seintje: false };
  if (reactie === 'slechter') {
    if (keerSlechterOpRij >= 1) return { week: Math.max(1, huidig - 1), seintje: true };
    return { week: huidig, seintje: false };
  }
  // "Te makkelijk": de app beweegt mee en je springt een niveau verder (08-10-2026).
  if (reactie === 'makkelijk') return { week: huidig + 2, seintje: false };
  // Geen plafond: de niveaus lopen door. Of iemand mag doorlopen, beslist
  // api/core.js (leden en begeleiding wel, eenmalige kopers stoppen bij niveau 12).
  return { week: huidig + 1, seintje: false };
}

// ===========================================================================
// ROMPTEST
// ===========================================================================
export const TESTWEKEN = [0, 4, 8, 12];
export const TESTS = [
  { id: 'plank',         naam: 'Plank op onderarmen',     doel: 120 },
  { id: 'zijplankL',     naam: 'Zijplank links',          doel: 60 },
  { id: 'zijplankR',     naam: 'Zijplank rechts',         doel: 60 },
  { id: 'bridgeL',       naam: 'Bridge op één been links',  doel: 45 },
  { id: 'bridgeR',       naam: 'Bridge op één been rechts', doel: 45 },
  { id: 'fietshouding',  naam: 'Fietshouding-houdgreep',  doel: 120 },
];

// Rompscore 0-100: gemiddeld percentage van de doelen, per test afgetopt op 100.
export function rompscore(uitslag) {
  const delen = TESTS.map((t) => Math.min(100, (Number(uitslag[t.id]) || 0) / t.doel * 100));
  return Math.round(delen.reduce((a, b) => a + b, 0) / delen.length);
}

// Verschil links/rechts als percentage van de sterkste kant. Boven 10% noemen
// we het, want dat zie je vaak terug in een scheve zit op de fiets.
export function balans(uitslag) {
  const paar = (l, r, naam) => {
    const a = Number(uitslag[l]) || 0, b = Number(uitslag[r]) || 0;
    const sterk = Math.max(a, b);
    if (!sterk) return null;
    const pct = Math.round(Math.abs(a - b) / sterk * 100);
    return { naam, pct, zwakker: a < b ? 'links' : 'rechts', opvallend: pct > 10 };
  };
  return [paar('zijplankL', 'zijplankR', 'Zijkant'), paar('bridgeL', 'bridgeR', 'Bil')].filter(Boolean);
}

// Disbalans-modus (09-10-2026): wat de app doet met het verschil links/rechts.
// Boven 10% krijgt de zwakke kant in elke oefening per kant extra werk en gaat
// hij eerst: 5 seconden bij 10 tot 20% verschil, 10 seconden daarboven. Zo
// trekt het verschil test na test bij. Zijkant-oefeningen volgen de zijplank,
// bil- en heupoefeningen de bridge op één been.
export const DISBALANS_PAAR = { zijkant: 'zijkant', bil: 'bil', heupzijkant: 'bil' };
export function disbalansUit(uitslag) {
  if (!uitslag) return null;
  const uit = {};
  for (const b of balans(uitslag)) {
    if (!b.opvallend) continue;
    uit[b.naam === 'Zijkant' ? 'zijkant' : 'bil'] = { kant: b.zwakker === 'links' ? 'Links' : 'Rechts', pct: b.pct, extra: b.pct > 20 ? 10 : 5 };
  }
  return Object.keys(uit).length ? uit : null;
}

// ===========================================================================
// RUGKLACHTENMETER
// ===========================================================================
// Gevraagd bij de start en na het afronden van week 2, 4, 6, 8, 10 en 12.
export const METERWEKEN = [0, 2, 4, 6, 8, 10, 12];

// ===========================================================================
// MOMENTEN: wanneer test, wanneer meter
// ===========================================================================
// "afgerond" = de laatste week die iemand heeft afgesloten (0 = nog niets).
// De romptest hoort bij week 0 (vóór de start) en na week 4, 8 en 12.
export function testNodig(afgerond, gedaneTests) {
  // Elke 4 weken, doorlopend: 0, 4, 8, 12, 16, ...
  const moment = Math.floor(Math.max(0, afgerond) / 4) * 4;
  return gedaneTests.includes(moment) ? null : moment;
}
export function meterNodig(afgerond, gedaneMeters) {
  // Elke 2 weken, doorlopend.
  const moment = Math.floor(Math.max(0, afgerond) / 2) * 2;
  return gedaneMeters.includes(moment) ? null : moment;
}

// Een week is rond bij 2 van de 3 sessies. Strenger maakt het kapot: wie één
// keer mist en dan op slot zit, haakt af.
// Bij de standaard (3x per week). Per deelnemer: nodigVoorWeek(intake).
export const SESSIES_VOOR_WEEK = 2;

// ===========================================================================
// FASES EN BADGES
// ===========================================================================
export const BADGES = [
  { fase: 1, naam: 'Fundament', tekst: 'De basis staat. Je weet nu hoe je je romp aanspant zonder je adem in te houden.' },
  { fase: 2, naam: 'Opbouw', tekst: 'Drie rondes zonder te wankelen. Je romp houdt het nu langer vol dan je denkt.' },
  { fase: 3, naam: 'Kracht', tekst: 'De zware varianten zitten erin. Dit is waar je stabiliteit op de fiets vandaan komt.' },
  { fase: 4, naam: 'Op de fiets', tekst: 'Alle 12 weken rond. Je romp is klaar voor de laatste kilometers.' },
];
// Een fase is verdiend als de laatste week ervan is afgerond.
export function verdiendeBadges(afgerond) {
  return BADGES.filter((b) => afgerond >= b.fase * 3);
}

// ===========================================================================
// WEEKTIPS
// ===========================================================================
export const WEEKTIPS = {
  1: 'Adem door tijdens elke oefening. Houd je je adem in, dan span je je romp niet aan maar zet je hem vast. Tel hardop als het moet.',
  2: 'Kwaliteit boven tijd. Zakt je heup in de plank, stop dan de seconden en zet hem opnieuw goed neer. Vijf goede seconden zijn meer waard dan twintig slordige.',
  3: 'Plan je sessies op de dagen van je rustige ritten, niet op de dag van je zware training. Een vermoeide romp na een sessie is precies wat je niet wilt in je intervallen.',
  4: 'Nieuwe fase, zwaardere varianten. Het mag nu even tegenvallen. Dat is het teken dat de prikkel goed zit.',
  5: 'Let op je armen op de fiets: rijd je met je ellebogen op slot, dan vangt je onderrug elke klap op. Ontspan je armen, dan doet je romp het werk.',
  6: 'Halverwege. Kijk eens naar je laatste lange rit: zakte je de laatste uur nog zo in elkaar als vroeger? Dat is waar je dit voor doet.',
  7: 'Kracht betekent: langzaam. Hoe trager je de bridge en de bird dog doet, hoe zwaarder het wordt. Snelheid is valsspelen.',
  8: 'Je bent nu sterker aan de ene kant dan aan de andere, iedereen is dat. Begin elke oefening per kant met je zwakke kant.',
  9: 'Voel je dat je stabieler op het zadel zit bij hard trappen? Dat is je zijkant. Daar komt je vermogen van de pedaal naar de grond.',
  10: 'De laatste fase gaat over je fietshouding. Doe de fietshouding-houdgreep eens voor de spiegel: rug recht, schouders laag, nek lang.',
  11: 'Zet de houding van de oefening over naar de fiets. Span op een klim je buik licht aan zoals in de bear plank, dan blijft je bekken stil.',
  12: 'Laatste week. Na de finisher doe je je eindtest. Vergelijk hem met week 0 en kijk wat 12 weken doen.',
};

// ===========================================================================
// DOEL EN BESTE STARTDATUM
// ===========================================================================
const DAG = 24 * 3600 * 1000;
// Week 12 moet vlak vóór het doel vallen: dan ben je op je sterkst op de dag
// zelf. We rekenen 12 weken plus een paar dagen marge terug.
export function besteStart(doelDatum, vandaag = new Date()) {
  const doel = new Date(doelDatum);
  if (isNaN(doel)) return null;
  const ideaal = new Date(doel.getTime() - (12 * 7 + 4) * DAG);
  // Naar de maandag ervoor.
  const dag = (ideaal.getDay() + 6) % 7;
  ideaal.setDate(ideaal.getDate() - dag);
  const dagenTotDoel = Math.ceil((doel - vandaag) / DAG);
  const nuBeginnen = ideaal <= vandaag;
  return {
    startDatum: ideaal.toISOString().slice(0, 10),
    dagenTotDoel,
    wekenTotDoel: Math.floor(dagenTotDoel / 7),
    nuBeginnen,
    // Begin je nu terwijl het doel binnen 12 weken valt, dan haal je niet alle
    // weken. Dat zeggen we eerlijk.
    haalbareWeken: nuBeginnen ? Math.max(0, Math.min(12, Math.floor(dagenTotDoel / 7))) : 12,
  };
}

// Tip die bij het doel hoort. In de laatste week voor het doel: lichter.
// Uitgezet op verzoek van Michel (05-10-2026): bij een doel alleen aftellen,
// geen advies. De functie blijft bestaan maar geeft niets meer terug.
export function doelTip(doel, vandaag = new Date()) {
  return null;
  if (!doel || !doel.datum) return null;
  const dagen = Math.ceil((new Date(doel.datum) - vandaag) / DAG);
  if (dagen < 0) return null;
  if (dagen <= 7) return `Nog ${dagen} ${dagen === 1 ? 'dag' : 'dagen'} tot ${doel.naam}. Doe deze week alleen sessie 1, en sla de laatste twee dagen voor je doel helemaal over. Je romp moet fris aan de start staan.`;
  if (dagen <= 21) return `Nog ${Math.ceil(dagen / 7)} weken tot ${doel.naam}. Gewoon doorgaan, maar geen nieuwe oefeningen meer proberen.`;
  return null;
}

// ===========================================================================
// PERIODISERING NAAR JE DOEL (12-10-2026, besluit Michel)
// ===========================================================================
// Soort rijden bepaalt waar de nadruk ligt. Wordt gekozen bij de intake, of
// afgeleid uit de naam van je tocht.
export const DISCIPLINES = {
  toer:     { naam: 'Lange toertocht of granfondo', kort: 'lange tocht', focus: ['onderrug', 'fiets'] },
  bergen:   { naam: 'Bergen en lange klimmen',      kort: 'bergtocht',  focus: ['rotatie', 'fiets'] },
  kasseien: { naam: 'Kasseien en klassiekers',      kort: 'kasseien',   focus: ['zijkant', 'plank'] },
  gravel:   { naam: 'Gravel',                       kort: 'gravelrit',  focus: ['rotatie', 'heupzijkant'] },
  crit:     { naam: 'Criteriums en wedstrijden',    kort: 'wedstrijd',  focus: ['rotatie', 'plank'] },
};
export function disciplineVan(naam = '') {
  const n = String(naam).toLowerCase();
  if (/gravel|traka|unbound|rift|gralloch|santa vall|big sugar|migration|sbt|waffle|mid south|houffa|one fifty|marly|grav/.test(n)) return 'gravel';
  if (/criterium|wedstrijd|koers|crit\b/.test(n)) return 'crit';
  if (/vlaanderen|roubaix|omloop|flanders|wevelgem|kassei|ename|chouffe/.test(n)) return 'kasseien';
  if (/marmotte|tzaler|ventoux|dolomit|tape|stelvio|alpe|haute route|ballons|tour du als|klimmen|quebranta|transalp|dreil|stations|mallorca|nove colli|fausto|vosges|bastogne/.test(n)) return 'bergen';
  return 'toer';
}

// Waar sta je ten opzichte van je doel? Bepaalt frisheid, opener en herstel.
//   opener     de dag zelf: 5 minuten activatie
//   herstel    1 tot 3 dagen erna: alleen mobiliteit
//   rust       laatste 2 dagen ervoor: geen core
//   fris1      de week ervoor: 20% minder, hooguit 2 sessies
//   fris2      2 weken ervoor: 15% minder
//   geennieuw  3 weken ervoor: geen nieuwe oefeningen meer
export function doelModus(dagenTotDoel) {
  if (dagenTotDoel == null || !Number.isFinite(dagenTotDoel)) return null;
  if (dagenTotDoel === 0) return 'opener';
  if (dagenTotDoel < 0) return dagenTotDoel >= -3 ? 'herstel' : null;
  if (dagenTotDoel <= 2) return 'rust';
  if (dagenTotDoel <= 7) return 'fris1';
  if (dagenTotDoel <= 14) return 'fris2';
  if (dagenTotDoel <= 21) return 'geennieuw';
  return null;
}
export const MODUS_FACTOR = { fris1: 0.8, fris2: 0.85 };
export const MODUS_UITLEG = {
  geennieuw: 'Nog 3 weken: vanaf nu geen nieuwe oefeningen meer. Je maakt sterk wat je al kunt, zodat je lijf nergens door verrast wordt.',
  fris2: 'Nog 2 weken: je sessies zijn 15% korter. Je houdt je kracht vast, maar je bouwt alvast frisheid op.',
  fris1: 'De laatste week: je sessies zijn 20% korter en je doet er hooguit 2. Je romp moet fris aan de start staan, niet moe.',
  rust: 'De laatste 2 dagen: geen core. Rust is nu je training. Op de dag zelf staat er een korte opener klaar.',
  opener: 'Vandaag is het zover. Doe vlak voor je vertrek deze opener van 5 minuten: hij zet je romp aan zonder hem moe te maken.',
  herstel: 'Na je tocht: drie dagen alleen mobiliteit. Daarna pak je de draad weer op.',
};

// Wat je doet per fase, en waarom (bij een nieuwe fase in beeld).
export const FASE_UITLEG = {
  1: { titel: 'Fundament', tekst: 'Je leert je romp stil houden terwijl je armen en benen bewegen. Dat is precies wat er op de fiets gebeurt: je benen trappen, je bekken blijft rustig. Dit merk je als eerste: minder wiebelen op het zadel.' },
  2: { titel: 'Opbouw', tekst: 'Meer rondes en langer werken. Je romp leert het langer vol te houden, zodat je ook na twee uur nog goed in je houding zit.' },
  3: { titel: 'Kracht', tekst: 'Zwaardere varianten en kortere rust. Nu wordt je romp echt sterk, en dat merk je bij klimmen en aanzetten: je kracht gaat in de pedalen in plaats van in wiebelen.' },
  4: { titel: 'Op de fiets', tekst: 'Oefeningen in je fietshouding en tegen draaien in, zoals bij klimmen uit het zadel en sprinten. Hier vertaal je alles naar de fiets.' },
};

// Focus van de sessie per soort rijden en fase.
export const FOCUS = {
  toer:     { 1: 'een stil bekken, ook na uren trappen', 2: 'je houding volhouden in het laatste uur', 3: 'een sterke onderrug voor lange dagen in het zadel', 4: 'je fietshouding vasthouden tot de finish' },
  bergen:   { 1: 'stil zitten op het zadel als je klimt', 2: 'lang aanzetten zonder in te zakken', 3: 'kracht om uit het zadel te klimmen zonder te wiebelen', 4: 'je romp in één lijn op de steilste stukken' },
  kasseien: { 1: 'een stevige romp tegen trillingen', 2: 'stil blijven op ruwe stroken', 3: 'kracht in je zijkant voor kasseien en wind', 4: 'je lijf als één blok over de stenen' },
  gravel:   { 1: 'balans op ongelijke ondergrond', 2: 'je romp stil terwijl je stuur beweegt', 3: 'kracht in je heup en zijkant voor losse grond', 4: 'controle in bochten en op losse stroken' },
  crit:     { 1: 'een stabiele basis voor harde inspanningen', 2: 'snel aanspannen bij elke versnelling', 3: 'explosief stabiel bij aanzetten en sprinten', 4: 'sprinten uit het zadel zonder kracht te verliezen' },
};

// Waarom deze oefening, voor jouw soort rijden.
export const WAAROM_DOEL = {
  toer:     { voorkant: 'Na uren trappen zakt je bekken als je voorkant moe is. Dit houdt hem stil.', onderrug: 'Je onderrug draagt je bovenlijf de hele dag. Sterker = geen zeurende rug na 150 km.', fiets: 'Je traint precies de houding die je urenlang vasthoudt.', plank: 'Je armen en schouders hoeven minder te dragen, dus minder vermoeidheid in je nek.' },
  bergen:   { rotatie: 'Bij klimmen uit het zadel wil je lijf draaien. Dit houdt je in één lijn, zodat alle kracht naar de pedalen gaat.', fiets: 'Op de steile stukken zit je voorovergebogen en trek je aan je stuur. Dit traint precies dat.', bil: 'Je bil levert de kracht op de lange klimmen.', zijkant: 'Voorkomt dat je heen en weer gaat als je zwaar trapt op een klim.' },
  kasseien: { zijkant: 'Op de kasseien schudt alles. Een sterke zijkant houdt je recht op de fiets.', plank: 'Je romp vangt de trillingen op, niet je armen en je onderrug.', rotatie: 'Houdt je stabiel als je fiets onder je wegschiet.' },
  gravel:   { rotatie: 'Op losse grond beweegt je stuur alle kanten op. Dit houdt je romp rustig.', heupzijkant: 'Een sterke heup houdt je knie recht op een ongelijke ondergrond.', zijkant: 'Balans in de bochten en op losse stroken.' },
  crit:     { rotatie: 'Bij elke sprint uit het zadel trek je aan je stuur. Dit voorkomt dat je kracht weglekt.', plank: 'Snel aanspannen bij elke versnelling uit de bocht.', bil: 'De kracht voor je aanzet komt uit je bil.' },
};
// Waarom deze oefening, voor jouw klacht.
export const WAAROM_KLACHT = {
  onderrug: { voorkant: 'Ontlast je onderrug: je voorkant neemt het werk over.', onderrug: 'Bouwt je onderrug rustig op in een veilige, neutrale stand.', rotatie: 'Een van de rugvriendelijkste oefeningen die er is.', zijkant: 'Een sterke zijkant ontlast je onderrug op lange ritten.', bil: 'Sterke billen nemen werk over van je onderrug.' },
  nek:      { plank: 'Een stevige romp betekent minder leunen op je armen, en dus minder druk op je nek.', rotatie: 'Houdt je schouders laag en ontspannen.' },
  knie:     { heupzijkant: 'Houdt je knie recht boven je pedaal. Een zwakke heup is de meest voorkomende oorzaak van knieklachten op de fiets.', bil: 'Sterke billen nemen druk weg van je knie.' },
  heup:     { bil: 'Een sterke bil maakt je heup stabieler.', heupzijkant: 'Traint precies de spieren die je heup op zijn plek houden.' },
};

// Fietstip per moment (alleen voor wie geen schema of coaching heeft).
export const FIETSTIPS = {
  1: 'Bouw je duurritten rustig op: elke week een kwartier langer, op een tempo waarop je nog kunt praten.',
  2: 'Eén keer per week een lange rit, de rest kort en rustig. Je romp en je benen worden zo samen sterker.',
  3: 'Doe één keer per week een paar blokken van 10 minuten stevig, zoals een lange klim. Dan merk je je sterkere romp het best.',
  4: 'Oefen een keer de klimmen of het tempo van je tocht. Zo weet je lijf op de dag zelf wat er komt.',
  geennieuw: 'Nog 3 weken: je laatste lange rit, op ongeveer 2/3 van de afstand van je tocht. Daarna wordt het minder.',
  fris2: 'Nog 2 weken: rij minder, maar houd een paar korte, stevige stukken van 1 tot 2 minuten. Zo blijf je scherp.',
  fris1: 'De laatste week: korte ritten, met twee dagen voor je tocht een paar korte versnellingen. Check de dag ervoor in de app je bandenspanning, kleding en voeding.',
  rust: 'Rust of een heel rustig rondje van een half uur. Leg je spullen klaar en eet extra koolhydraten.',
  opener: 'Begin rustig, de eerste 20 minuten op gevoel. Eet elk uur, ook als je nog geen honger hebt.',
  herstel: 'Een rustig rondje mag, maar geen inspanning. Je lijf herstelt nu van je tocht.',
};

// Korte extra sessies: opener (dag zelf) en mobiliteit (na de tocht of bij pijn).
export function extraSessie(soort, intake = {}) {
  const opener = soort === 'opener';
  const ids = opener ? ['birddog', 'bridge', 'plank'] : ['birddog', 'bridge'];
  const oefeningen = ids.map((id) => ({ lijn: id, niveau: 0, id, ...OEFENINGEN[id], waarom: opener ? 'Zet je romp aan voor de start, zonder hem moe te maken.' : 'Rustig bewegen helpt je herstel.' }));
  const werk = opener ? 20 : 30, rust = opener ? 20 : 30;
  const warmingUp = opener ? ['kat-koe', 'draai-bovenrug'] : ['kat-koe', 'knie-borst', 'draai-bovenrug'];
  const coolDown = { id: 'couch-stretch', perKant: opener ? 20 : 40 };
  const totaal = warmingUp.length * 40 + oefeningen.length * (werk + rust) - rust + coolDown.perKant * 2;
  return { week: 0, letter: opener ? 'O' : 'M', extra: soort, naam: opener ? 'Opener voor de start' : 'Mobiliteit en herstel', werk, rust, rondes: 1, warmingUp, oefeningen, coolDown, finisher: false, werkSec: oefeningen.length * werk, minuten: Math.max(4, Math.round(totaal / 60)) };
}

// ===========================================================================
// KAN IK NIET: BEPERKINGEN EN VERVANGERS (12-10-2026)
// ===========================================================================
export const LIJNLABEL = { voorkant: 'Voorkant', plank: 'Plank', zijkant: 'Zijkant', bil: 'Bil', onderrug: 'Rug', rotatie: 'Rotatie', heupzijkant: 'Heup', fiets: 'Fietshouding' };
// Wat een houding van je vraagt. Uit de intake: wat lukt niet?
export const BEPERKINGEN = {
  knielen:    'Knielen of op je knieën steunen',
  polsen:     'Steunen op je handen (polsen)',
  schouders:  'Steunen op je ellebogen of schouders',
  rugligging: 'Plat op je rug liggen',
  staan:      'Voorover buigen of op één been staan',
};
const VRAAGT = {
  'kat-koe': ['knielen', 'polsen'], 'draai-bovenrug': ['knielen', 'polsen'], 'knie-borst': ['rugligging'], 'couch-stretch': ['knielen'],
  'curl-up': ['rugligging'], 'kin-intrekken': ['rugligging'],
  'deadbug-gebogen': ['rugligging'], 'deadbug-gestrekt': ['rugligging'], 'hollow-hold': ['rugligging'], 'hollow-fietsen': ['rugligging'],
  'plank-knieen': ['knielen', 'schouders'], 'plank': ['schouders'], 'plank-schoudertik': ['polsen'], 'plank-lang': ['schouders'], 'body-saw': ['schouders'],
  'zijplank-knieen': ['knielen', 'schouders'], 'zijplank': ['schouders'], 'zijplank-heupdip': ['schouders'], 'zijplank-been': ['schouders'], 'zijplank-knie-been': ['knielen', 'schouders'],
  'bridge': ['rugligging'], 'bridge-mars': ['rugligging'], 'bridge-eenbeen': ['rugligging'], 'bridge-eenbeen-traag': ['rugligging'],
  'heupscharnier': ['staan'], 'fietshouding': ['staan'], 'fietshouding-reiken': ['staan'], 'fietshouding-eenbeen': ['staan'],
  'birddog': ['knielen', 'polsen'], 'birddog-pauze': ['knielen', 'polsen'], 'birddog-elleboog': ['knielen', 'polsen'], 'bear-tik': ['knielen', 'polsen'],
  'zijlig-been': [], 'zijlig-been-hold': [], 'eenbeen-scharnier': ['staan'], 'climber-traag': ['polsen'],
};
// Gelijkwaardige vervangers, beste eerst (zelfde spiergroep, zelfde functie op de fiets).
export const VERVANGERS = {
  'kat-koe': ['knie-borst', 'zijlig-been'], 'draai-bovenrug': ['knie-borst', 'zijlig-been'], 'knie-borst': ['kat-koe', 'zijlig-been'], 'couch-stretch': ['knie-borst', 'zijlig-been'],
  'curl-up': ['birddog', 'zijlig-been-hold'], 'kin-intrekken': ['draai-bovenrug', 'zijlig-been'],
  'deadbug-gebogen': ['birddog', 'plank-knieen', 'zijlig-been'], 'deadbug-gestrekt': ['birddog-pauze', 'plank', 'zijlig-been-hold'], 'hollow-hold': ['plank', 'plank-knieen', 'zijlig-been-hold'], 'hollow-fietsen': ['plank-lang', 'plank', 'zijlig-been-hold'],
  'plank-knieen': ['deadbug-gebogen', 'zijlig-been'], 'plank': ['deadbug-gestrekt', 'plank-knieen', 'zijlig-been-hold'], 'plank-schoudertik': ['plank', 'deadbug-gestrekt', 'zijlig-been-hold'], 'plank-lang': ['hollow-hold', 'deadbug-gestrekt', 'zijlig-been-hold'], 'body-saw': ['hollow-fietsen', 'hollow-hold', 'zijlig-been-hold'],
  'zijplank-knieen': ['zijlig-been', 'zijlig-been-hold'], 'zijplank': ['zijlig-been-hold', 'zijplank-knieen'], 'zijplank-heupdip': ['zijlig-been-hold', 'zijplank'], 'zijplank-been': ['zijlig-been-hold', 'zijplank-knie-been'], 'zijplank-knie-been': ['zijlig-been-hold', 'zijlig-been'],
  'bridge': ['heupscharnier', 'zijlig-been'], 'bridge-mars': ['heupscharnier', 'zijlig-been-hold'], 'bridge-eenbeen': ['fietshouding', 'zijlig-been-hold'], 'bridge-eenbeen-traag': ['fietshouding-reiken', 'zijlig-been-hold'],
  'heupscharnier': ['bridge', 'birddog'], 'fietshouding': ['bridge-mars', 'birddog-pauze'], 'fietshouding-reiken': ['bridge-eenbeen', 'birddog-elleboog'], 'fietshouding-eenbeen': ['bridge-eenbeen-traag', 'birddog-elleboog'],
  'birddog': ['deadbug-gebogen', 'zijlig-been'], 'birddog-pauze': ['deadbug-gestrekt', 'zijlig-been-hold'], 'birddog-elleboog': ['deadbug-gestrekt', 'zijlig-been-hold'], 'bear-tik': ['deadbug-gestrekt', 'hollow-hold', 'zijlig-been-hold'],
  'zijlig-been': ['bridge', 'heupscharnier'], 'zijlig-been-hold': ['bridge-mars', 'zijlig-been'], 'eenbeen-scharnier': ['zijlig-been-hold', 'bridge-eenbeen'], 'climber-traag': ['deadbug-gestrekt', 'birddog-pauze', 'zijlig-been-hold'],
};
// Als alle vervangers al in de sessie zitten: deze veilige oefeningen voor romp en bil.
const RESERVE = ['zijlig-been-hold', 'zijlig-been', 'heupscharnier', 'curl-up', 'bridge', 'deadbug-gebogen', 'fietshouding'];
export function kanNiet(id, beperkingen = []) { return (VRAAGT[id] || []).some((b) => beperkingen.includes(b)); }
// Zelf gekozen vervanging gaat voor; anders alleen als een beperking het verbiedt.
export function vervangerVoor(id, intake = {}) {
  const bep = intake.beperkingen || [], eigen = intake.vervang && intake.vervang[id];
  if (eigen && OEFENINGEN[eigen] && !kanNiet(eigen, bep)) return eigen;
  if (!kanNiet(id, bep)) return null;
  return (VERVANGERS[id] || []).find((x) => OEFENINGEN[x] && !kanNiet(x, bep)) || null;
}
// Voor de knop "Kan ik niet": de beste vervanger die nog niet in gebruik is.
export function vervangerKeuze(id, intake = {}) {
  const bep = intake.beperkingen || [];
  return (VERVANGERS[id] || []).find((x) => OEFENINGEN[x] && !kanNiet(x, bep) && x !== id) || null;
}
