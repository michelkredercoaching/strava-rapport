// /lib/recepten.js
// Recepten als inspiratie, niet als voorschrift.
//
// Twee regels waar dit bestand op gebouwd is:
//
// 1. ELK RECEPT SCHAALT MEE. Iemand met een ontbijt van 2 blokken en iemand
//    met 6 blokken krijgen hetzelfde recept met andere hoeveelheden. Een vast
//    recept van "60 gram havermout" klopt voor bijna niemand en ondermijnt
//    het hele plan.
//
// 2. GEEN VALSE BELOFTES. Bij hetzelfde aantal calorieën val je niet sneller
//    af van een betere keuze. Wat een betere keuze wél doet: je blijft langer
//    vol, je herstelt beter en je houdt het twaalf weken vol. Dat laatste
//    bepaalt de uitkomst, niet het recept.
//
// Ingrediënten hebben een schaal:
//   'kh'    schaalt mee met het aantal koolhydraatblokken van dat moment
//   'eiwit' schaalt mee met het aantal eiwitporties
//   'vet'   schaalt mee met het aantal vetporties
//   'vast'  blijft altijd gelijk (groente, kruiden, een scheut melk)

export const MOMENTEN = ['ontbijt', 'rond_training', 'lunch', 'avond', 'tussendoor'];

// waarvoor: waarom dit een goede keuze is. Eerlijk en concreet, geen hype.
export const RECEPTEN = [
  {
    id: 'havermoutpap',
    naam: 'Havermoutpap met kwark en fruit',
    moment: ['ontbijt'],
    dagtype: ['rust', 'herstel', 'duur', 'interval', 'lang'],
    tijd: '8 minuten',
    waarvoor: 'Blijft lang vol zitten door de vezels, en de kwark erdoor tilt je eiwit omhoog zonder dat je een extra maaltijd nodig hebt.',
    ingredienten: [
      { naam: 'Havermout', schaal: 'kh', per: 50, eenheid: 'g' },
      { naam: 'Magere kwark', schaal: 'eiwit', per: 200, eenheid: 'g' },
      { naam: 'Halfvolle melk', schaal: 'vast', per: 150, eenheid: 'ml' },
      { naam: 'Blauwe bessen of banaan', schaal: 'vast', per: 100, eenheid: 'g' },
      { naam: 'Kaneel', schaal: 'vast', per: 1, eenheid: 'snuf' }
    ],
    stappen: [
      'Kook de havermout met de melk en een scheut water, ongeveer vijf minuten.',
      'Haal van het vuur en roer de kwark erdoor als het iets is afgekoeld.',
      'Fruit en kaneel erover.'
    ],
    tip: 'Maak hem de avond ervoor koud klaar met alleen melk, dan staat je ontbijt klaar.'
  },
  {
    id: 'omelet-brood',
    naam: 'Omelet met volkoren brood',
    moment: ['ontbijt', 'lunch'],
    dagtype: ['rust', 'herstel', 'duur'],
    tijd: '10 minuten',
    waarvoor: 'Veel eiwit en volume voor weinig calorieën. Goede keuze op een rustdag, want daar heb je de koolhydraten minder nodig en de verzadiging juist wel.',
    ingredienten: [
      { naam: 'Eieren', schaal: 'eiwit', per: 3, eenheid: 'stuks' },
      { naam: 'Volkoren brood', schaal: 'kh', per: 2, eenheid: 'sneetjes' },
      { naam: 'Champignons en paprika', schaal: 'vast', per: 150, eenheid: 'g' },
      { naam: 'Olijfolie', schaal: 'vet', per: 1, eenheid: 'el' }
    ],
    stappen: [
      'Bak de groente een paar minuten in de olie.',
      'Klop de eieren los, giet erover en laat op laag vuur stollen.',
      'Serveer met het brood.'
    ],
    tip: 'Vervang één ei door twee eiwitten als je vet wil besparen.'
  },
  {
    id: 'rijstpap-voor',
    naam: 'Rijstepap voor een lange rit',
    moment: ['ontbijt'],
    dagtype: ['lang'],
    tijd: '15 minuten',
    waarvoor: 'Veel koolhydraten die makkelijk wegdrinken, zonder dat je met een volle maag op de fiets stapt. Vezelarm, dus rustig in je buik.',
    ingredienten: [
      { naam: 'Witte rijst of griesmeel', schaal: 'kh', per: 45, eenheid: 'g' },
      { naam: 'Halfvolle melk', schaal: 'vast', per: 300, eenheid: 'ml' },
      { naam: 'Honing', schaal: 'kh', per: 10, eenheid: 'g' },
      { naam: 'Kaneel', schaal: 'vast', per: 1, eenheid: 'snuf' }
    ],
    stappen: [
      'Kook de rijst of griesmeel in de melk tot hij dik is.',
      'Honing erdoor, kaneel erover.',
      'Eet dit twee tot drie uur voor je vertrekt.'
    ],
    tip: 'Op deze dag geen volkoren en geen grote hoeveelheid groente bij je ontbijt. Vezels zijn prima, alleen niet vlak voor drie uur fietsen.'
  },
  {
    id: 'rijstkoek-honing',
    naam: 'Rijstwafels met honing en banaan',
    moment: ['rond_training'],
    dagtype: ['duur', 'interval', 'lang'],
    tijd: '2 minuten',
    waarvoor: 'Snel weg, licht verteerbaar, en precies wat je nodig hebt in het uur voor een training met intensiteit.',
    ingredienten: [
      { naam: 'Rijstwafels', schaal: 'kh', per: 3, eenheid: 'stuks' },
      { naam: 'Honing', schaal: 'kh', per: 12, eenheid: 'g' },
      { naam: 'Banaan', schaal: 'vast', per: 1, eenheid: 'stuk' }
    ],
    stappen: ['Besmeer de rijstwafels, banaan erop of ernaast.'],
    tip: 'Zestig tot negentig minuten voor een intervaltraining. Korter ervoor kan ook, maak het dan kleiner.'
  },
  {
    id: 'herstelshake',
    naam: 'Herstelshake na een zware rit',
    moment: ['rond_training'],
    dagtype: ['interval', 'lang'],
    tijd: '2 minuten',
    waarvoor: 'Binnen een uur na een zware rit eiwit en koolhydraten binnen. Vooral belangrijk als je de volgende dag weer traint.',
    ingredienten: [
      { naam: 'Halfvolle melk', schaal: 'vast', per: 350, eenheid: 'ml' },
      { naam: 'Banaan', schaal: 'kh', per: 1, eenheid: 'stuk' },
      { naam: 'Magere kwark of eiwitpoeder', schaal: 'eiwit', per: 150, eenheid: 'g' },
      { naam: 'Havermout', schaal: 'kh', per: 25, eenheid: 'g' }
    ],
    stappen: ['Alles in de blender, dertig seconden.'],
    tip: 'Geen blender of geen zin? Een pak chocolademelk en een banaan doen bijna hetzelfde.'
  },
  {
    id: 'wrap-kip',
    naam: 'Wraps met kip en veel groente',
    moment: ['lunch'],
    dagtype: ['rust', 'herstel', 'duur', 'interval'],
    tijd: '12 minuten',
    waarvoor: 'Makkelijk mee te nemen naar werk en je krijgt er veel groente in zonder dat het als dieetkost voelt.',
    ingredienten: [
      { naam: 'Wraps', schaal: 'kh', per: 1.5, eenheid: 'stuks' },
      { naam: 'Kipfilet', schaal: 'eiwit', per: 110, eenheid: 'g' },
      { naam: 'Sla, tomaat, komkommer, paprika', schaal: 'vast', per: 200, eenheid: 'g' },
      { naam: 'Magere yoghurt met kruiden als saus', schaal: 'vast', per: 60, eenheid: 'g' },
      { naam: 'Olijfolie', schaal: 'vet', per: 0.5, eenheid: 'el' }
    ],
    stappen: [
      'Bak de kip met kruiden in de olie.',
      'Wraps vullen met groente, kip en de yoghurtsaus.',
      'Strak oprollen en doormidden snijden.'
    ],
    tip: 'Bak een dubbele portie kip, dan heb je morgen je lunch al.'
  },
  {
    id: 'kwarkbak',
    naam: 'Kwarkbak met fruit en noten',
    moment: ['lunch', 'tussendoor'],
    dagtype: ['rust', 'herstel', 'duur', 'interval', 'lang'],
    tijd: '3 minuten',
    waarvoor: 'De snelste manier om je eiwit te halen op een dag dat het eten erbij inschiet.',
    ingredienten: [
      { naam: 'Magere kwark', schaal: 'eiwit', per: 250, eenheid: 'g' },
      { naam: 'Fruit naar keuze', schaal: 'kh', per: 120, eenheid: 'g' },
      { naam: 'Noten', schaal: 'vet', per: 20, eenheid: 'g' },
      { naam: 'Honing', schaal: 'kh', per: 8, eenheid: 'g' }
    ],
    stappen: ['Alles in een bak, door elkaar.'],
    tip: 'Te zuur? Meng er wat Griekse yoghurt doorheen, dat kost je nauwelijks eiwit.'
  },
  {
    id: 'kip-rijst',
    naam: 'Kip met rijst en gewokte groente',
    moment: ['avond'],
    dagtype: ['duur', 'interval', 'lang'],
    tijd: '20 minuten',
    waarvoor: 'De standaard die altijd werkt. Makkelijk op te schalen naar een grote trainingsdag en makkelijk te verkleinen op een rustdag.',
    ingredienten: [
      { naam: 'Rijst', schaal: 'kh', per: 55, eenheid: 'g droog' },
      { naam: 'Kipfilet', schaal: 'eiwit', per: 120, eenheid: 'g' },
      { naam: 'Wokgroente', schaal: 'vast', per: 300, eenheid: 'g' },
      { naam: 'Olijfolie', schaal: 'vet', per: 1, eenheid: 'el' },
      { naam: 'Sojasaus, knoflook, gember', schaal: 'vast', per: 1, eenheid: 'naar smaak' }
    ],
    stappen: [
      'Zet de rijst op.',
      'Bak de kip in de olie, haal eruit.',
      'Wok de groente kort, kip erbij, sojasaus erover.'
    ],
    tip: 'Driehonderd gram groente lijkt veel maar slinkt tot niets. Dat volume is precies wat je op een tekortdag helpt.'
  },
  {
    id: 'pasta-zalm',
    naam: 'Pasta met zalm en spinazie',
    moment: ['avond'],
    dagtype: ['duur', 'lang'],
    tijd: '20 minuten',
    waarvoor: 'Goede avondmaaltijd voor de dag vóór een lange rit: veel koolhydraten en vetten die je herstel helpen.',
    ingredienten: [
      { naam: 'Pasta', schaal: 'kh', per: 70, eenheid: 'g droog' },
      { naam: 'Zalmfilet', schaal: 'eiwit', per: 120, eenheid: 'g' },
      { naam: 'Verse spinazie', schaal: 'vast', per: 200, eenheid: 'g' },
      { naam: 'Kookroom light of creme fraiche', schaal: 'vet', per: 40, eenheid: 'ml' },
      { naam: 'Knoflook en citroen', schaal: 'vast', per: 1, eenheid: 'naar smaak' }
    ],
    stappen: [
      'Kook de pasta.',
      'Bak de zalm met knoflook, voeg de spinazie toe tot hij slinkt.',
      'Room erdoor, pasta erbij, citroen erover.'
    ],
    tip: 'Zalm uit blik of gerookte zalm werkt ook en scheelt tijd.'
  },
  {
    id: 'aardappel-vlees',
    naam: 'Aardappel met mager vlees en groente',
    moment: ['avond'],
    dagtype: ['rust', 'herstel', 'duur'],
    tijd: '25 minuten',
    waarvoor: 'Aardappel geeft van alle koolhydraatbronnen het meeste verzadigingsgevoel per calorie. Sterke keuze op een rustdag.',
    ingredienten: [
      { naam: 'Aardappelen', schaal: 'kh', per: 250, eenheid: 'g' },
      { naam: 'Mager rundvlees of kip', schaal: 'eiwit', per: 120, eenheid: 'g' },
      { naam: 'Groente naar keuze', schaal: 'vast', per: 300, eenheid: 'g' },
      { naam: 'Olijfolie of roomboter', schaal: 'vet', per: 1, eenheid: 'el' }
    ],
    stappen: [
      'Kook of rooster de aardappelen.',
      'Bak het vlees, kook of roerbak de groente.',
      'Jus of een lepel mosterd erbij.'
    ],
    tip: 'Koude aardappel van de vorige dag zit nog beter vol. Handig in een salade voor de lunch.'
  },
  {
    id: 'kikkererwtencurry',
    naam: 'Kikkererwtencurry met rijst',
    moment: ['avond'],
    dagtype: ['rust', 'herstel', 'duur', 'interval'],
    tijd: '20 minuten',
    waarvoor: 'Vleesloos, veel vezels en goedkoop. Vezels helpen je door de avond heen op een dag met een tekort.',
    ingredienten: [
      { naam: 'Rijst', schaal: 'kh', per: 50, eenheid: 'g droog' },
      { naam: 'Kikkererwten uit blik', schaal: 'eiwit', per: 200, eenheid: 'g' },
      { naam: 'Tomatenblokjes en spinazie', schaal: 'vast', per: 300, eenheid: 'g' },
      { naam: 'Kokosmelk light', schaal: 'vet', per: 60, eenheid: 'ml' },
      { naam: 'Currykruiden, ui, knoflook', schaal: 'vast', per: 1, eenheid: 'naar smaak' }
    ],
    stappen: [
      'Fruit ui en knoflook, kruiden erbij.',
      'Tomaat, kikkererwten en kokosmelk erin, tien minuten laten pruttelen.',
      'Spinazie er op het laatst doorheen.'
    ],
    tip: 'Maak een dubbele pan. Morgen is hij lekkerder en je hebt je lunch.'
  },
  {
    id: 'tussendoor-hartig',
    naam: 'Snelle hartige tussendoor',
    moment: ['tussendoor'],
    dagtype: ['rust', 'herstel', 'duur', 'interval', 'lang'],
    tijd: '2 minuten',
    waarvoor: 'Voor wie tegen de avond gaat grazen. Eiwit en volume houden je van de kast weg.',
    ingredienten: [
      { naam: 'Volkoren crackers', schaal: 'kh', per: 3, eenheid: 'stuks' },
      { naam: 'Hüttenkäse of magere smeerkaas', schaal: 'eiwit', per: 150, eenheid: 'g' },
      { naam: 'Komkommer en tomaat', schaal: 'vast', per: 150, eenheid: 'g' }
    ],
    stappen: ['Beleggen en opeten.'],
    tip: 'Werkt beter dan fruit als je honger hebt en nog twee uur moet.'
  },
  {
    id: 'overnight-oats',
    naam: 'Overnight oats voor een vroege ochtend',
    moment: ['ontbijt', 'rond_training'],
    dagtype: ['duur', 'interval', 'lang'],
    tijd: '5 minuten de avond ervoor',
    waarvoor: 'Als je om zes uur vertrekt en niet kunt eten. Staat klaar, is koud prima en zit rustig in je maag.',
    ingredienten: [
      { naam: 'Havermout', schaal: 'kh', per: 50, eenheid: 'g' },
      { naam: 'Melk of yoghurtdrink', schaal: 'vast', per: 200, eenheid: 'ml' },
      { naam: 'Magere kwark', schaal: 'eiwit', per: 150, eenheid: 'g' },
      { naam: 'Banaan of appelmoes', schaal: 'kh', per: 1, eenheid: 'stuk' },
      { naam: 'Pindakaas', schaal: 'vet', per: 1, eenheid: 'el' }
    ],
    stappen: [
      'Alles in een bak of pot, roeren.',
      'Nacht in de koelkast.',
      "'s Ochtends meteen te eten."
    ],
    tip: 'Op de dag van een lange rit de pindakaas weglaten, dat ligt lichter.'
  },
  {
    id: 'soep-brood',
    naam: 'Groentesoep met een gevuld broodje',
    moment: ['lunch'],
    dagtype: ['rust', 'herstel'],
    tijd: '10 minuten',
    waarvoor: 'Veel volume voor weinig calorieën. De klassieke oplossing voor een rustdag waarop je honger krijgt van het kleinere plan.',
    ingredienten: [
      { naam: 'Groentesoep zonder room', schaal: 'vast', per: 400, eenheid: 'ml' },
      { naam: 'Volkoren brood', schaal: 'kh', per: 2, eenheid: 'sneetjes' },
      { naam: 'Kipfilet, tonijn of ei', schaal: 'eiwit', per: 100, eenheid: 'g' },
      { naam: 'Groente op brood', schaal: 'vast', per: 80, eenheid: 'g' }
    ],
    stappen: ['Soep opwarmen, broodje beleggen.'],
    tip: 'Zelfgemaakte bouillon met blokjes groente is in tien minuten klaar en kost bijna niets.'
  }
];

// ===========================================================================
// SLIMME RUILS — kleine keuzes, echte winst
// ===========================================================================
// Vaak nuttiger dan een heel recept, want het is één beslissing in de winkel.
//
// `soort` maakt eerlijk wat de winst is, want dat verschilt:
//   'eiwit'       zelfde calorieën, meer eiwit. Beschermt spiermassa.
//   'verzadiging' zelfde calorieën, je blijft langer vol. Helpt volhouden.
//   'kcal'        echt minder calorieën. Dit telt mee in je tekort.
//   'timing'      niet beter of slechter, maar beter op dat moment.
export const RUILS = [
  { van: 'Yoghurt', naar: 'Magere kwark', soort: 'eiwit',
    winst: '+14 gram eiwit per bakje, bij ongeveer dezelfde calorieën',
    wanneer: 'Altijd. Dit is de makkelijkste winst die er is.' },
  { van: 'Vruchtenyoghurt', naar: 'Naturel met vers fruit', soort: 'kcal',
    winst: 'Ongeveer 100 kcal minder per portie, en meer volume',
    wanneer: 'De suiker in vruchtenyoghurt is bijna een toetje.' },
  { van: 'Sinaasappelsap', naar: 'Een hele sinaasappel', soort: 'verzadiging',
    winst: 'Zelfde calorieën, maar je kauwt en het vult wel',
    wanneer: 'Op een rustdag. Voor een lange rit is sap juist handig.' },
  { van: 'Wit brood', naar: 'Volkoren brood', soort: 'verzadiging',
    winst: 'Meer vezels, je komt makkelijker tot de lunch',
    wanneer: 'Op rustdagen en normale trainingsdagen.' },
  { van: 'Volkoren brood', naar: 'Wit brood', soort: 'timing',
    winst: 'Ligt lichter, minder kans op een volle buik',
    wanneer: 'Alleen in de twee uur voor een lange of harde rit.' },
  { van: 'Noten uit de zak', naar: 'Een afgewogen handje van 25 gram', soort: 'kcal',
    winst: '150 kcal in plaats van de 400 die het anders wordt',
    wanneer: "Noten zijn gezond en calorierijk. Dat tweede vergeet iedereen 's avonds." },
  { van: 'Kaas 48+', naar: 'Kaas 30+', soort: 'kcal',
    winst: 'Ongeveer 25 kcal minder per plak, zelfde smaakbeleving op brood',
    wanneer: 'Bij twee plakken per dag is dat 350 kcal per week.' },
  { van: 'Bakken in olie op gevoel', naar: 'Afmeten met een lepel', soort: 'kcal',
    winst: 'Eén eetlepel is 120 kcal. Twee scheuten uit de fles zijn er zo drie.',
    wanneer: 'Dit is de stilste calorielek in de meeste keukens.' },
  { van: 'Vla of pudding als toetje', naar: 'Kwark met fruit en kaneel', soort: 'eiwit',
    winst: 'Je toetje wordt ineens een eiwitmoment',
    wanneer: "'s Avonds, als je toch iets zoets wil." },
  { van: 'Gekookte rijst schatten', naar: 'Droog afwegen', soort: 'kcal',
    winst: 'Gekookt schatten zit er zo 150 kcal naast, elke dag opnieuw',
    wanneer: 'De eerste twee weken, tot je het oog ervoor hebt.' },
  { van: 'Sportdrank op een rustig rondje', naar: 'Water', soort: 'kcal',
    winst: '30 gram koolhydraten per bidon die je op een uurtje rustig niet nodig hebt',
    wanneer: 'Ritten korter dan anderhalf uur op laag tempo.' },
  { van: 'Water op je lange rit', naar: 'Sportdrank', soort: 'timing',
    winst: 'Je haalt je grammen per uur zonder extra te hoeven eten',
    wanneer: 'Ritten van twee uur of langer. Hier bespaar je niets, hier vul je aan.' },
  { van: 'Een reep tussendoor', naar: 'Kwark of een gekookt ei', soort: 'verzadiging',
    winst: 'Zelfde calorieën, maar je hebt een uur later geen honger',
    wanneer: 'Tussendoor op kantoor.' },
  { van: 'Pindakaas met suiker', naar: '100% pinda', soort: 'verzadiging',
    winst: 'Nauwelijks minder calorieën, wel minder trek erna',
    wanneer: 'Bij het ontbijt.' },
  { van: 'Twee glazen bier', naar: 'Eén biertje en water', soort: 'kcal',
    winst: 'Ongeveer 150 kcal, en je slaapt beter voor de training van morgen',
    wanneer: 'De avond voor een trainingsdag.' }
];

export function ruilsVoor(soort) {
  return soort ? RUILS.filter(r => r.soort === soort) : RUILS;
}

// Eén ruil per week op de pagina, zodat het niet als een lijst regels voelt
// maar als een tip. Draait rond, dus in twaalf weken zie je ze bijna allemaal.
export function ruilVanDeWeek(week) {
  if (!RUILS.length) return null;
  return RUILS[(Math.max(1, week) - 1) % RUILS.length];
}

// ===========================================================================
// Schalen
// ===========================================================================
// In: het recept en het moment uit voorbeelddag(), plus het dagplan voor
// eiwit- en vetporties.
// Uit: dezelfde ingrediënten met hoeveelheden die kloppen voor deze persoon.
export function schaalRecept(recept, { khBlokken = 2, eiwitPorties = 1, vetPorties = 1 }) {
  const factor = { kh: khBlokken, eiwit: eiwitPorties, vet: vetPorties, vast: 1 };
  const ingredienten = recept.ingredienten.map(i => {
    const f = factor[i.schaal] ?? 1;
    let hoeveelheid = i.per * f;
    // Netjes afronden zodat er geen 2,7 eieren of 63,4 gram uitkomt.
    if (i.eenheid === 'stuks' || i.eenheid === 'stuk' || i.eenheid === 'sneetjes') {
      hoeveelheid = Math.max(0.5, Math.round(hoeveelheid * 2) / 2);
    } else if (i.eenheid === 'el' || i.eenheid === 'snuf' || i.eenheid === 'naar smaak') {
      hoeveelheid = Math.max(0.5, Math.round(hoeveelheid * 2) / 2);
    } else {
      hoeveelheid = Math.max(5, Math.round(hoeveelheid / 5) * 5);
    }
    return { naam: i.naam, hoeveelheid, eenheid: i.eenheid, vast: i.schaal === 'vast' };
  });
  return { ...recept, ingredienten };
}

// Welke recepten passen bij dit moment op dit dagtype. Maximaal drie, anders
// wordt het een kookboek en gaat niemand kiezen.
export function suggesties({ moment, dagtype, khBlokken, eiwitPorties, vetPorties, max = 3 }) {
  const passend = RECEPTEN.filter(r =>
    r.moment.includes(moment) && r.dagtype.includes(dagtype));
  return passend.slice(0, max).map(r =>
    schaalRecept(r, { khBlokken, eiwitPorties, vetPorties }));
}

// Alles voor één dag: per eetmoment een paar suggesties, geschaald op de
// blokken die bij dat moment horen.
// ALLEEN DE KOOLHYDRATEN SCHALEN MEE. Dat is het deel dat echt verschilt
// tussen een rustdag en een lange rit. Eiwit en vet blijven op de normale
// portie van het recept staan, want die verdeel je over de dag en niet per
// bord. Deed ik allebei tegelijk, dan kwam er 200 gram havermout mét 400 gram
// kwark uit: rekenkundig kloppend, maar boven de calorieën van dat moment en
// in de praktijk niet op te eten.
const MAX_KH_PER_GERECHT = 3.5;

export function dagSuggesties(dag, porties) {
  const uit = {};
  const sleutel = { 'Ontbijt': 'ontbijt', 'Rond je training': 'rond_training',
                    'Lunch': 'lunch', 'Avondeten': 'avond', 'Tussendoor': 'tussendoor' };
  for (const m of porties.momenten) {
    const code = sleutel[m.moment];
    if (!code) continue;
    const gewenstKh = Math.max(1, Math.round(m.kh * 2) / 2);   // halve blokken mogen
    const khBlokken = Math.min(gewenstKh, MAX_KH_PER_GERECHT);

    uit[code] = suggesties({ moment: code, dagtype: dag.type,
                             khBlokken, eiwitPorties: 1, vetPorties: 1, max: 2 })
      .map(r => ({ ...r, verdelen: gewenstKh > khBlokken, khBlokken }));
    if (!uit[code].length) delete uit[code];
  }
  return uit;
}
