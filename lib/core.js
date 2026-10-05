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
  'scharnier-stok':     { naam: 'Heupscharnier met stok', cue: 'Stok langs je rug op hoofd, bovenrug en bekken. Buig vanuit je heup, de stok blijft overal raken.' },
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

// Lijnen met hun niveaus. Index 0 bestaat alleen bij plank (op de knieën) en
// wordt alleen gebruikt als de intake de lijn een niveau terugzet.
export const LIJNEN = {
  voorkant:    { naam: 'Voorkant',      niveaus: ['deadbug-gebogen', 'deadbug-gebogen', 'deadbug-gestrekt', 'hollow-hold', 'hollow-fietsen'] },
  plank:       { naam: 'Plank',         niveaus: ['plank-knieen', 'plank', 'plank-schoudertik', 'plank-lang', 'body-saw'] },
  zijkant:     { naam: 'Zijkant',       niveaus: ['zijplank-knieen', 'zijplank-knieen', 'zijplank', 'zijplank-heupdip', 'zijplank-been'] },
  bil:         { naam: 'Bil',           niveaus: ['bridge', 'bridge', 'bridge-mars', 'bridge-eenbeen', 'bridge-eenbeen-traag'] },
  onderrug:    { naam: 'Onderrug',      niveaus: ['scharnier-stok', 'scharnier-stok', 'fietshouding', 'fietshouding-reiken', 'fietshouding-eenbeen'] },
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

// Vier oefeningen per sessie, waarvan hooguit twee per kant. Meer past niet in
// 20 minuten zodra in fase 3 en 4 de bil en de onderrug ook per kant gaan.
// Bird dog en bridge trainen de rugstrekkers mee, dus de onderrug komt vaker
// aan bod dan alleen in sessie C.
const SESSIES = {
  A: { naam: 'Voorkant en bil',    lijnen: ['voorkant', 'plank', 'bil', 'heupzijkant'] },
  B: { naam: 'Zijkant en rotatie', lijnen: ['zijkant', 'rotatie', 'bil', 'voorkant'] },
  C: { naam: 'Rug en houding',     lijnen: ['onderrug', 'plank', 'zijkant', 'rotatie'] },
};
// Van kant wisselen kost 5 seconden, geen volle rustpauze.
export const WISSEL = 5;

const WARMING_UP = ['kat-koe', 'knie-borst', 'draai-bovenrug'];

// ===========================================================================
// INTAKE
// ===========================================================================
export const KLACHTEN = ['onderrug', 'nek', 'knie', 'heup'];

// Rode vlaggen: dan geen plan, eerst huisarts of fysio.
export function heeftRodeVlag(intake) {
  return !!(intake && intake.rodeVlag);
}

// Hoeveel niveaus een lijn achterloopt, en het hoogste niveau dat mag.
function aanpassing(intake, lijn) {
  const k = new Set(intake.klachten || []);
  let terug = 0, max = 4;
  if (k.has('onderrug') && ['voorkant', 'plank', 'onderrug'].includes(lijn)) { terug = 1; if (lijn === 'plank') max = 3; }
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
  const w = WEKEN[weekNr - 1];
  const k = new Set(intake.klachten || []);
  const rugInRust = k.has('onderrug') && intake.rugErnst === 'rust';
  const regelmatig = intake.ervaring === 'regelmatig' && !k.has('onderrug');

  // Werk en rust.
  let werk = w.werk, rust = w.rust;
  if (k.has('onderrug') && w.fase <= 2) { werk -= 5; rust += 5; }
  // Ervaren: zelfde sessieduur, maar 5 s meer werk en 5 s minder rust.
  if (regelmatig) { werk += 5; rust = Math.max(10, rust - 5); }
  // Herhaalde week na "slechter": ook korter werken en langer rusten, want wie
  // al op de lichtste variant zit, merkt anders geen verschil.
  if (intake.verlicht) { werk = Math.max(20, werk - 5); rust += 5; }

  // Welke lijnen.
  let lijnen = SESSIES[letter].lijnen.slice();
  // Fase 4: in sessie C maakt de bird dog plaats voor de fietsspecifieke oefening.
  if (w.fase === 4 && letter === 'C') lijnen[lijnen.indexOf('rotatie')] = 'fiets';
  // Knie: heup zijkant in elke sessie. Hij vervangt de oefening die het minst
  // bijdraagt aan de knie, zodat de sessie niet langer wordt.
  // B: de bil zit al in A. C: de zijplank zit al in B, en traint de heup
  // zijkant ook mee. Zo blijven het er hooguit twee per kant.
  if (k.has('knie')) {
    if (letter === 'B') lijnen[lijnen.indexOf('bil')] = 'heupzijkant';
    if (letter === 'C') lijnen[lijnen.indexOf('zijkant')] = 'heupzijkant';
  }
  // Rug ook in rust: eerste twee weken alleen de vriendelijkste lijnen.
  if (rugInRust && weekNr <= 2) {
    lijnen = lijnen.filter((l) => ['voorkant', 'rotatie', 'zijkant', 'bil'].includes(l));
    if (!lijnen.includes('rotatie')) lijnen.push('rotatie');
  }

  const oefeningen = lijnen.map((lijn) => {
    const { terug, max } = aanpassing(intake, lijn);
    const niveau = Math.max(0, Math.min(max, w.fase - terug));
    const id = LIJNEN[lijn].niveaus[niveau];
    return { lijn, niveau, id, ...OEFENINGEN[id] };
  });

  const warmingUp = WARMING_UP.slice();
  if (k.has('nek')) warmingUp.push('draai-bovenrug');
  const coolDown = { id: 'couch-stretch', perKant: 30 + (k.has('heup') ? 15 : 0) };

  const finisher = !!(w.finisher && letter === 'C');
  const plekken = oefeningen.reduce((n, o) => n + (o.perKant ? 2 : 1), 0);
  const rondeSec = oefeningen.reduce((n, o) => n + (o.perKant ? werk * 2 + WISSEL : werk) + rust, 0);
  const werkSec = plekken * werk * w.rondes + (finisher ? 60 : 0);
  // Na de allerlaatste oefening volgt geen rust meer, net als in de speler.
  const totaalSec = warmingUp.length * 40 + rondeSec * w.rondes - rust + coolDown.perKant * 2 + (finisher ? 120 : 0);

  return {
    week: weekNr, fase: w.fase, faseNaam: FASES[w.fase], letter, naam: SESSIES[letter].naam,
    werk, rust, rondes: w.rondes,
    warmingUp, oefeningen, coolDown,
    finisher,
    werkSec, minuten: Math.round(totaalSec / 60),
  };
}

// Het hele plan: 12 weken x 3 sessies.
export function maakPlan(intake = {}) {
  if (heeftRodeVlag(intake)) return { geblokkeerd: true };
  const weken = WEKEN.map((w) => ({
    week: w.week, fase: w.fase, faseNaam: FASES[w.fase],
    sessies: ['A', 'B', 'C'].map((l) => sessie(w.week, l, intake)),
  }));
  return { geblokkeerd: false, weken, tips: tips(intake) };
}

function tips(intake) {
  const k = new Set(intake.klachten || []);
  const t = [];
  if (k.has('onderrug')) t.push('Je onderrug bepaalt het tempo. Je begint een niveau lichter, en voelt het slechter na een week, dan herhalen we die week.');
  if (k.has('knie')) t.push('Knieklachten op de fiets komen vaak door een zwakke heup of een verkeerde zadelhoogte. De heupoefeningen zitten nu in elke sessie. Laat ook je zadelhoogte even checken.');
  if (k.has('nek')) t.push('Nek- en schouderklachten komen vaak uit een stijve bovenrug. Je doet het bovenrug draaien daarom twee keer in je warming-up.');
  if (k.has('heup')) t.push('Je couch-stretch duurt 45 seconden per kant in plaats van 30. Die stretch is voor jou het belangrijkste stuk van de sessie.');
  return t;
}

// ===========================================================================
// WEKELIJKS BIJSTUREN
// ===========================================================================
// Na elke afgeronde week: hoe reageerde je lichaam? 'beter' | 'gelijk' |
// 'slechter'. Bij slechter herhalen we de week. Na twee keer slechter op rij
// zetten we een week terug en krijgt Michel een seintje.
export function volgendeWeek(huidig, reactie, keerSlechterOpRij = 0) {
  if (reactie === 'slechter') {
    if (keerSlechterOpRij >= 1) return { week: Math.max(1, huidig - 1), seintje: true };
    return { week: huidig, seintje: false };
  }
  return { week: Math.min(12, huidig + 1), seintje: false };
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
  const moment = [0, 4, 8, 12].filter((w) => w <= afgerond).pop();
  if (moment == null) return null;
  return gedaneTests.includes(moment) ? null : moment;
}
export function meterNodig(afgerond, gedaneMeters) {
  const moment = METERWEKEN.filter((w) => w <= afgerond).pop();
  if (moment == null) return null;
  return gedaneMeters.includes(moment) ? null : moment;
}

// Een week is rond bij 2 van de 3 sessies. Strenger maakt het kapot: wie één
// keer mist en dan op slot zit, haakt af.
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
export function doelTip(doel, vandaag = new Date()) {
  if (!doel || !doel.datum) return null;
  const dagen = Math.ceil((new Date(doel.datum) - vandaag) / DAG);
  if (dagen < 0) return null;
  if (dagen <= 7) return `Nog ${dagen} ${dagen === 1 ? 'dag' : 'dagen'} tot ${doel.naam}. Doe deze week alleen sessie 1, en sla de laatste twee dagen voor je doel helemaal over. Je romp moet fris aan de start staan.`;
  if (dagen <= 21) return `Nog ${Math.ceil(dagen / 7)} weken tot ${doel.naam}. Gewoon doorgaan, maar geen nieuwe oefeningen meer proberen.`;
  return null;
}
