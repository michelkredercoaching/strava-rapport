// /lib/voeding.js
// ÉÉN bron van waarheid voor alle voedingsberekeningen van Het Afvalprogramma
// voor Wielrenners. Hier komen straks drie dingen uit:
//   1. de persoonlijke tokenpagina (het plan van de klant)
//   2. de wekelijkse check-in (de bijsturing)
//   3. de Afvalkaart (de gratis leadmagnet, vereenvoudigde tabel)
// Nooit een formule kopiëren naar een van die drie: dan lopen ze binnen een
// maand uit elkaar en krijgt iemand via de kaart andere getallen dan na aankoop.
//
// ALLE KNOPPEN STAAN IN `INSTELLINGEN` HIERONDER. Michel kan daar draaien
// zonder de rest van het bestand aan te raken. Draai je eraan, draai dan ook
// `node scripts/voeding-check.mjs` en kijk of de uitkomsten nog kloppen.

// ===========================================================================
// INSTELLINGEN
// ===========================================================================
export const INSTELLINGEN = {
  // --- Ruststofwisseling (BMR) ---
  // Mifflin-St Jeor. Gekozen boven Harris-Benedict omdat die bij sporters
  // systematisch te hoog uitkomt.
  formule: 'mifflin-st-jeor',

  // --- Leven naast de fiets (werk, huishouden, lopen) ---
  // Factor op de BMR, ZONDER het fietsen. Het fietsen tellen we daarna apart
  // op, want dat weten we veel preciezer uit de trainingsdata.
  werkfactor: {
    zittend: 1.35,   // kantoor, weinig lopen
    actief:  1.45,   // staand of lopend werk, veel op de been
    zwaar:   1.60    // fysiek werk (bouw, zorg, buiten)
  },

  // --- Energie van het fietsen ---
  // Zonder vermogensmeter schatten we het gemiddelde vermogen per type rit.
  // Twee manieren, in deze volgorde:
  //   1. is de FTP bekend: percentage van FTP (nauwkeuriger)
  //   2. anders: watt per kilo (grove schatting)
  // Daarna: kcal ≈ kJ = watt × uren × 3,6. Dat 1-op-1-verband klopt omdat
  // het menselijk rendement op de fiets rond de 24% ligt; de omrekening van
  // kJ naar kcal en dat rendement vallen tegen elkaar weg.
  ritIntensiteit: {
    herstel:  { pctFtp: 0.50, wkg: 1.4 },
    duur:     { pctFtp: 0.62, wkg: 2.0 },  // D1/D2, de standaard duurrit
    interval: { pctFtp: 0.72, wkg: 2.3 },  // inclusief warmrijden en rust
    lang:     { pctFtp: 0.68, wkg: 2.2 }   // toertocht of koers, 3 uur of meer
  },

  // --- Het tekort ---
  // 1 kilo vet is ongeveer 7700 kcal. We rekenen per WEEK, niet per dag,
  // zodat het tekort ongelijk over de week verdeeld kan worden.
  kcalPerKiloVet: 7700,
  standaardTempoKgPerWeek: 0.4,     // binnen de 0,3 tot 0,5 van de pagina
  maxTempoKgPerWeek: 0.5,           // absoluut plafond, voor niemand hoger

  // Dat plafond geldt niet voor iedereen gelijk. Een halve kilo per week is
  // prima als je ruim boven je streefgewicht zit: dan komt het grootste deel
  // uit vet. Zit je al slank op de fiets, dan komt diezelfde halve kilo deels
  // uit spier en zakken je watts mee naar beneden. Vandaar een trap op BMI,
  // van hoog naar laag doorlopen; de eerste die past wint.
  maxTempoNaarBmi: [
    { vanafBmi: 27, max: 0.50 },
    { vanafBmi: 24, max: 0.45 },
    { vanafBmi: 22, max: 0.35 },
    { vanafBmi: 0,  max: 0.30 }
  ],
  maxTekortPctVanOnderhoud: 0.25,   // nooit meer dan 25% onder onderhoud

  // Hoe het weektekort over de dagen verdeeld wordt. Dit IS het verschil met
  // een calorieënapp: op de dag dat je hard traint snijd je niet.
  // De getallen zijn gewichten, geen procenten; ze worden genormaliseerd zodat
  // de som over de week precies het weektekort is. Een gewicht van 0 betekent:
  // deze dag wordt nooit aangeraakt, ook niet bij herverdeling.
  tekortVerdeling: {
    rust:     1.0,
    herstel:  1.3,
    duur:     1.1,
    interval: 0.0,   // kwaliteitsdag: geen tekort
    lang:     0.0    // lange rit: geen tekort
  },

  // Nooit meer dan dit deel van het dagverbruik in één dag wegsnijden, ook al
  // zou de ondergrens het toelaten. Een rustdag van 2550 naar 1650 is op
  // papier prima en in de praktijk een dag waarop je slecht slaapt.
  maxDagTekortPct: 0.28,

  // --- Eiwit ---
  // In een tekort hoger dan normaal, want dat beschermt spiermassa.
  // Blijft elke dag gelijk, ook op een rustdag.
  eiwitPerKg: 2.0,
  // Bij fors overgewicht rekenen we eiwit over een referentiegewicht in plaats
  // van het echte gewicht, anders komen er onhaalbare grammen uit.
  eiwitReferentieBmi: 27.5,

  // --- Vet ---
  // Ondergrens, voor hormonen en vetoplosbare vitamines.
  vetPerKgMinimaal: 0.8,

  // --- Koolhydraten op de fiets (gram per uur) ---
  // Binnen de gangbare richtlijn van 30 tot 90 g/uur.
  koolhydratenPerUur: {
    herstel:  30,
    duur:     60,
    interval: 60,
    lang:     80
  },

  // --- Harde ondergrenzen ---
  // LET OP: deze twee getallen moeten door Michel nagerekend en bevestigd
  // worden voordat de Afvalkaart naar buiten gaat.
  absoluteOndergrens: { man: 1800, vrouw: 1500 },
  // Daarnaast nooit onder de ruststofwisseling plus een kleine marge.
  ondergrensBmrFactor: 1.10,

  // --- Veiligheid ---
  minimumLeeftijd: 18,
  gezondeBmiOndergrens: 20.0,   // streefgewicht mag hier niet onder
  minGewichtKg: 40,
  maxGewichtKg: 200
};

// ===========================================================================
// DE BERICHTEN VAN DE WEKELIJKSE CHECK-IN
// ===========================================================================
// Dit is wat de deelnemer op zijn pagina leest nadat hij heeft ingevuld.
// MICHEL SCHRIJFT DEZE TEKSTEN. Wat hier staat is een concept in zijn toon;
// pas ze gerust helemaal aan, de regels eronder veranderen er niet van.
//
// Twee dingen om vast te houden bij het herschrijven:
//   1. Geen gedachtestreepjes, alleen punten en komma's.
//   2. Bij de regels die naar een mens gaan (naarMens) mag de tekst NIET
//      vooruitlopen op wat jij gaat zeggen. Die tekst overbrugt alleen de tijd
//      tot jouw bericht.
export const BERICHTEN = {
  'geen-meting': {
    kop: 'Nog niets ingevuld',
    tekst: 'Vul je gewicht in, dan reken ik je week door. Twee minuten werk.'
  },

  'te-vroeg': {
    kop: 'Nog even niets veranderen',
    tekst: 'De eerste twee weken zeggen weinig. Wat je nu ziet is vooral vocht en glycogeen, dus een kilo eraf betekent nog geen kilo vet eraf. Vanaf week 3 gaan we naar de lijn kijken en niet naar de losse weging. Blijf gewoon doen wat je doet.'
  },

  'op-koers': {
    kop: 'Precies goed, niets veranderen',
    tekst: 'Je zit in het tempo waarin je vet verliest en je vermogen overeind blijft. Dit is saai en dat is het punt. Niets aanpassen, gewoon doorgaan.'
  },

  'iets-traag': {
    kop: 'Het loopt, maar rustig',
    tekst: 'Je gaat de goede kant op, alleen iets langzamer dan bedoeld. Ik haal er een klein beetje af, en alleen op je rustdagen. Je trainingsdagen blijven staan zoals ze waren.'
  },

  'stilstand': {
    kop: 'Even bijstellen',
    tekst: 'Drie weken vlak terwijl je het goed doet. Dat hoort erbij: je lichaam past zich aan als je lichter wordt. Ik zet je tekort iets groter, verdeeld over je rustdagen. Verander verder niets aan je trainingen.'
  },

  'stil-eten-lukt-niet': {
    kop: 'Eerst het eten, dan de getallen',
    tekst: 'De weegschaal staat stil, maar je gaf zelf aan dat het eten niet lukte. Dan ga ik niet snijden in een plan dat niet gevolgd is, want dan maak ik het alleen maar moeilijker. Pak deze week één ding: je eiwit halen. De rest komt daarna.'
  },

  // Hier stond "boven een halve kilo per week gaat er spier mee". Dat getal is
  // eruit sinds de grens per lichaamsbouw verschilt (maxTempoNaarBmi): deze
  // regel vuurt bij een slanke renner al op 0,35, en dan klopt "een halve
  // kilo" niet met wat hij op zijn scherm ziet gebeuren.
  // NOG NAREKENEN: de claim dat er boven de grens spiermassa meegaat en de
  // watts zakken. Michel checkt die. Zachtere variant als hij hem niet hard
  // wil maken: "dan gaat het ten koste van je herstel en de kwaliteit van je
  // trainingen".
  'te-snel': {
    kop: 'Iets te snel, ik voer je bij',
    tekst: 'Je gaat harder omlaag dan bij jou de bedoeling is. Dat voelt als winst, maar boven jouw tempo gaat er spier mee en zakken je watts. Ik geef je er wat eten bij op je rustige dagen. Je bent niet aan het falen, we remmen alleen af.'
  },

  // --- Hieronder: gaat naar een mens. Houd de tekst neutraal. ---

  'veel-te-snel': {
    kop: 'Dit gaat te hard',
    tekst: 'Je valt sneller af dan we willen. Dat kan ten koste gaan van je herstel, spiermassa en je vermogen. Ik heb je voeding meteen iets verhoogd en kijk zelf even met je mee. Je hoeft nu niets te veranderen. Ik kom bij je terug.'
  },

  'trainingen-slecht': {
    kop: 'Eerst je trainingen terug',
    tekst: 'Je geeft aan dat je trainingen zwaar en leeg voelen. Dan gaat de training vóór de weegschaal. Ik heb deze week extra eten toegevoegd en kijk zelf even naar je cijfers. Krijg je een zware training niet goed uitgevoerd? Sla die dan over of maak hem rustig. Eerst zorgen dat je weer goed kunt trainen.'
  },

  'gaat-omhoog': {
    kop: 'Hier kijk ik zelf even naar',
    tekst: 'Je gewicht loopt op terwijl je het plan volgt. Dat kan meerdere oorzaken hebben en ik ga nu niet zomaar je eten verder verlagen. Ik kijk naar je cijfers en laat je weten wat ik zie.'
  },

  'twee-weken-gemist': {
    kop: 'Je was er twee weken uit',
    tekst: 'Je hebt twee check-ins overgeslagen. Geen probleem, dat gebeurt. Ik stuur je een bericht om te kijken hoe we het weer oppakken.'
  },

  'doel-bereikt': {
    kop: 'Je bent op je streefgewicht',
    tekst: 'Mooi. Je hebt je doel gehaald. Vanaf hier haal ik het tekort eraf. Verder afvallen is niet meer het doel; we gaan nu zorgen dat je dit gewicht vasthoudt en je vermogen behoudt. Ik zet je voeding op onderhoud.'
  },

  // Bewust niet "onder gezond gewicht" in de kop: dat klinkt medisch en opent
  // een discussie over wat gezond precies is. Dit is de ondergrens die dit
  // programma aanhoudt, en dat is een keuze van de coach.
  'onder-gezonde-grens': {
    kop: 'Hier stoppen we',
    tekst: 'Je bent onder de ondergrens gekomen die ik binnen dit programma aanhoud. Vanaf hier wil ik je niet verder laten afvallen. Ik haal het tekort er direct af en neem contact met je op. We gaan eerst zorgen dat je gewicht stabiliseert en je trainingen goed blijven gaan.'
  }
};

// ===========================================================================
// DE BELEMMERINGEN VAN DE AFVALCHECK
// ===========================================================================
// Vraag vijf van de gratis Afvalcheck: waar loop je het meest tegenaan. Dit
// stuurt géén berekening aan, de getallen blijven exact hetzelfde. Het doet
// twee dingen: de bezoeker krijgt een antwoord op zíjn probleem in plaats van
// een algemene richtlijn, en wij weten waar iemand vastloopt zodat de mails
// daarna over het juiste onderwerp gaan.
//
// 'tag' gaat als losse Mailchimp-tag mee naast 'afvalkaart-pdf'.
// MICHEL SCHRIJFT DEZE TEKSTEN, net als BERICHTEN hierboven.
export const BELEMMERINGEN = [
  {
    sleutel: 'na-de-rit',
    tag: 'afval-na-de-rit',
    knop: 'Na het fietsen eet ik alles op wat los zit',
    kop: 'Die honger is geen gebrek aan wilskracht',
    tekst: 'Wat je na een rit voelt, is bijna altijd de rekening van wat je er tijdens die rit niet in hebt gestopt. Je komt thuis met een gat en dat gat vult zichzelf, of je het nu wil of niet.',
    actie: 'Eet 30 tot 60 gram koolhydraten per uur op de fiets, ook als het maar anderhalf uur is, en neem binnen een uur na afloop 25 tot 40 gram eiwit. Grote kans dat die aanval op de koelkast dan grotendeels wegblijft.'
  },
  {
    sleutel: 'avondtrek',
    tag: 'afval-avondtrek',
    knop: "'s Avonds op de bank gaat het mis",
    kop: 'De avond is het probleem niet',
    tekst: 'De avond is waar het zichtbaar wordt, maar het ontstaat eerder op de dag. Wie overdag te krap eet, haalt dat op de bank vanzelf in. Dat is geen karakter, dat is een tekort dat zich meldt.',
    actie: 'Kijk eens of je overdag in de buurt van je getallen hierboven komt. Zit je daar ruim onder, verschuif dan eten naar je ontbijt en je lunch in plaats van te proberen je avond te beheersen.'
  },
  {
    sleutel: 'geen-resultaat',
    tag: 'afval-geen-resultaat',
    knop: 'Ik eet gezond maar val niet af',
    kop: 'Gezond en weinig zijn twee verschillende dingen',
    tekst: 'Noten, olijfolie, pindakaas, smoothies, sportrepen, volle kwark: allemaal prima keuzes en allemaal flink wat energie. Je kunt uitstekend eten en toch geen gram kwijtraken.',
    actie: 'Verander voorlopig niets aan wát je eet. Kijk eerst of je totaal in de buurt van de getallen hierboven ligt, en of je op je rustdagen echt lager zit dan op je trainingsdagen. Daar zit bij de meeste renners het verschil.'
  },
  {
    sleutel: 'hoeveel',
    tag: 'afval-hoeveel',
    knop: 'Ik weet gewoon niet hoeveel ik moet eten',
    kop: 'Daar heb je er nu drie van',
    tekst: 'En het belangrijkste getal is niet hoeveel je eet, maar het verschil tussen je rustdag en je zware dag. Dat verschil is het hele mechanisme: brandstof wanneer het moet, tekort wanneer het niets kost.',
    actie: 'Pak deze week alleen je rustdagen. Eet daar naar het rustdaggetal en laat je trainingsdagen precies zoals ze nu zijn. Dat is de makkelijkste winst die er is.'
  },
  {
    sleutel: 'opnieuw',
    tag: 'afval-volhouden',
    knop: 'Ik begin steeds opnieuw',
    kop: 'Dan was het begin waarschijnlijk te streng',
    tekst: 'Een kilo per week eraf voelt als winst tot je merkt dat je drempelblokken niet meer lukken. Dan gaat er spier mee en zakken je watts, en dan stopt bijna iedereen. Niet omdat ze te slap zijn, maar omdat het plan te hard was.',
    actie: 'Mik op 0,3 tot 0,5 kilo per week en niet meer. Dat voelt traag en het is precies de reden dat je er in week tien nog mee bezig bent.'
  }
];

export function belemmeringAdvies(sleutel) {
  return BELEMMERINGEN.find(b => b.sleutel === sleutel) || null;
}

// ===========================================================================
// HULPJES
// ===========================================================================
const rond = (n, stap = 1) => Math.round(n / stap) * stap;
const klem = (n, min, max) => Math.min(max, Math.max(min, n));

export const DAGTYPES = ['rust', 'herstel', 'duur', 'interval', 'lang'];

export const DAGTYPE_NAAM = {
  rust:     'Rustdag',
  herstel:  'Hersteltraining',
  duur:     'Duurtraining',
  interval: 'Intervaltraining',
  lang:     'Lange rit'
};

// ===========================================================================
// 1. VEILIGHEID — draait vóór alles
// ===========================================================================
// Geeft { mag: true } of { mag: false, reden, uitleg }. De uitleg is de tekst
// die de klant te zien krijgt, dus in gewone taal.
export function controleerVeiligheid(invoer) {
  const { leeftijd, gewicht, lengte, streefgewicht, geslacht, medisch } = invoer;
  const I = INSTELLINGEN;

  if (!Number.isFinite(leeftijd) || leeftijd < I.minimumLeeftijd) {
    return { mag: false, reden: 'leeftijd',
      uitleg: 'Dit programma is voor deelnemers van 18 jaar en ouder.' };
  }
  if (!Number.isFinite(gewicht) || gewicht < I.minGewichtKg || gewicht > I.maxGewichtKg) {
    return { mag: false, reden: 'gewicht',
      uitleg: 'Controleer je gewicht, dat lijkt niet te kloppen.' };
  }
  if (!Number.isFinite(lengte) || lengte < 130 || lengte > 220) {
    return { mag: false, reden: 'lengte',
      uitleg: 'Controleer je lengte, dat lijkt niet te kloppen.' };
  }
  if (medisch && (medisch.diabetes || medisch.zwanger || medisch.eetstoornis)) {
    return { mag: false, reden: 'medisch',
      uitleg: 'Bij diabetes, zwangerschap of een eetstoornis nu of in het verleden hoort dit bij je arts of diëtist, niet bij een programma als dit. Je krijgt je geld terug.' };
  }
  const doelBmi = streefgewicht / Math.pow(lengte / 100, 2);
  if (Number.isFinite(streefgewicht) && doelBmi < I.gezondeBmiOndergrens) {
    const minDoel = rond(I.gezondeBmiOndergrens * Math.pow(lengte / 100, 2), 0.5);
    return { mag: false, reden: 'streefgewicht',
      uitleg: `Je streefgewicht ligt onder een gezond gewicht voor je lengte. Bij ${lengte} cm houd ik ${minDoel} kg aan als ondergrens. Kies een hoger streefgewicht of neem contact op.`,
      minimumStreefgewicht: minDoel };
  }
  if (Number.isFinite(streefgewicht) && streefgewicht >= gewicht) {
    return { mag: false, reden: 'geen-doel',
      uitleg: 'Je streefgewicht is gelijk aan of hoger dan je huidige gewicht. Dit programma is bedoeld om af te vallen.' };
  }
  if (geslacht !== 'man' && geslacht !== 'vrouw') {
    return { mag: false, reden: 'geslacht',
      uitleg: 'Kies man of vrouw, dat is nodig voor de berekening van je ruststofwisseling.' };
  }
  return { mag: true };
}

// ===========================================================================
// 2. RUSTSTOFWISSELING EN ONDERHOUD
// ===========================================================================
export function bmr({ geslacht, gewicht, lengte, leeftijd }) {
  const basis = 10 * gewicht + 6.25 * lengte - 5 * leeftijd;
  return geslacht === 'man' ? basis + 5 : basis - 161;
}

// Energie van één rit, in kcal. Gebruikt in deze volgorde:
//   1. echte kJ uit de rit (uit Strava, het nauwkeurigst)
//   2. FTP-percentage
//   3. watt per kilo
export function ritEnergie({ type, uren, ftp, gewicht, kj }) {
  if (Number.isFinite(kj) && kj > 0) return kj;           // kJ ≈ kcal, zie boven
  const prof = INSTELLINGEN.ritIntensiteit[type];
  if (!prof || !Number.isFinite(uren) || uren <= 0) return 0;
  const watt = Number.isFinite(ftp) && ftp > 0
    ? ftp * prof.pctFtp
    : gewicht * prof.wkg;
  return watt * uren * 3.6;
}

// ===========================================================================
// 3. HET WEEKPLAN
// ===========================================================================
// invoer:
//   geslacht, leeftijd, lengte, gewicht, streefgewicht
//   werk: 'zittend' | 'actief' | 'zwaar'
//   ftp: getal of null
//   week: [{ dag: 'ma', type: 'duur', uren: 2 }, ...]  (7 dagen)
//   tempoKgPerWeek: optioneel, standaard 0,4
//
// uit:
//   { bmr, basisverbruik, week: [...], gemiddeld, eiwit, vet, ondergrens,
//     weektekort, verwachtTempo, waarschuwingen }
// Het maximumtempo voor déze deelnemer. Zonder lengte vallen we terug op het
// algemene plafond, want dan kunnen we geen BMI uitrekenen.
export function maxTempoVoor({ gewicht, lengte }) {
  const I = INSTELLINGEN;
  if (!Number.isFinite(gewicht) || !Number.isFinite(lengte) || lengte <= 0) {
    return I.maxTempoKgPerWeek;
  }
  const bmi = gewicht / Math.pow(lengte / 100, 2);
  const trap = I.maxTempoNaarBmi.find(r => bmi >= r.vanafBmi);
  return Math.min(I.maxTempoKgPerWeek, trap ? trap.max : I.maxTempoKgPerWeek);
}

export function berekenPlan(invoer) {
  const I = INSTELLINGEN;
  const { geslacht, gewicht, lengte, werk = 'zittend', ftp = null } = invoer;
  const week = Array.isArray(invoer.week) ? invoer.week : [];
  const waarschuwingen = [];

  const rust = bmr(invoer);
  const factor = I.werkfactor[werk] ?? I.werkfactor.zittend;
  const basisverbruik = rust * factor;   // leven zonder fiets

  // --- Verbruik per dag, inclusief fietsen ---
  const dagen = week.map(d => {
    const type = DAGTYPES.includes(d.type) ? d.type : 'rust';
    const uren = Number.isFinite(d.uren) ? d.uren : 0;
    const fiets = type === 'rust' ? 0 : ritEnergie({ type, uren, ftp, gewicht, kj: d.kj });
    return { ...d, type, uren, fiets, onderhoud: basisverbruik + fiets };
  });

  // --- Het weektekort ---
  const maxTempo = maxTempoVoor({ gewicht, lengte });
  let tempo = Number.isFinite(invoer.tempoKgPerWeek)
    ? invoer.tempoKgPerWeek : I.standaardTempoKgPerWeek;
  if (tempo > maxTempo) waarschuwingen.push('tempo-begrensd-op-lichaamsbouw');
  tempo = klem(tempo, 0.1, maxTempo);
  let weektekort = tempo * I.kcalPerKiloVet;

  const weekOnderhoud = dagen.reduce((s, d) => s + d.onderhoud, 0);
  const maxWeektekort = weekOnderhoud * I.maxTekortPctVanOnderhoud;
  if (weektekort > maxWeektekort) {
    weektekort = maxWeektekort;
    waarschuwingen.push('tekort-begrensd');
  }

  // --- Verdelen over de week: niet snijden op de kwaliteitsdagen ---
  const gewichten = dagen.map(d => I.tekortVerdeling[d.type] ?? 1);

  // --- Eiwit en vet (elke dag gelijk) ---
  const bmi = gewicht / Math.pow(lengte / 100, 2);
  const refGewicht = bmi > I.eiwitReferentieBmi
    ? I.eiwitReferentieBmi * Math.pow(lengte / 100, 2)
    : gewicht;
  const eiwit = rond(refGewicht * I.eiwitPerKg, 5);
  const vetMin = rond(gewicht * I.vetPerKgMinimaal, 5);

  // --- Ondergrens ---
  const ondergrens = Math.max(
    I.absoluteOndergrens[geslacht] ?? 1500,
    rust * I.ondergrensBmrFactor
  );

  // --- Verdelen, met herverdeling ---
  // Elke dag heeft een maximum: niet onder de ondergrens, en niet meer dan
  // maxDagTekortPct van het dagverbruik. Wat op een volle dag niet past,
  // schuiven we door naar de dagen die nog ruimte hebben. Kwaliteitsdagen
  // (gewicht 0) blijven daarbij buiten schot.
  const ruimte = dagen.map((d, i) => gewichten[i] === 0
    ? 0
    : Math.max(0, Math.min(d.onderhoud - ondergrens, d.onderhoud * I.maxDagTekortPct)));

  const toegekend = new Array(dagen.length).fill(0);
  let teVerdelen = weektekort;
  for (let ronde = 0; ronde < 5 && teVerdelen > 1; ronde++) {
    const open = dagen.map((_, i) => (ruimte[i] - toegekend[i] > 0 ? gewichten[i] : 0));
    const somOpen = open.reduce((a, b) => a + b, 0);
    if (somOpen <= 0) break;
    let verdeeldDezeRonde = 0;
    for (let i = 0; i < dagen.length; i++) {
      if (open[i] <= 0) continue;
      const wens = teVerdelen * (open[i] / somOpen);
      const kan = Math.min(wens, ruimte[i] - toegekend[i]);
      toegekend[i] += kan;
      verdeeldDezeRonde += kan;
    }
    teVerdelen -= verdeeldDezeRonde;
    if (verdeeldDezeRonde <= 1) break;
  }
  const tekortNietGehaald = Math.max(0, teVerdelen);

  // --- Per dag uitrekenen ---
  const plan = dagen.map((d, i) => {
    let kcal = rond(d.onderhoud - toegekend[i], 25);

    // Koolhydraten = wat overblijft na eiwit en vet.
    const kcalEiwit = eiwit * 4;
    const kcalVet = vetMin * 9;
    const koolhydraten = Math.max(0, rond((kcal - kcalEiwit - kcalVet) / 4, 5));

    return {
      dag: d.dag,
      type: d.type,
      naam: DAGTYPE_NAAM[d.type],
      uren: d.uren,
      fietsKcal: rond(d.fiets, 25),
      onderhoud: rond(d.onderhoud, 25),
      kcal,
      eiwit,
      vet: vetMin,
      koolhydraten,
      koolhydratenPerUur: d.type === 'rust' ? 0 : I.koolhydratenPerUur[d.type],
      isKwaliteitsdag: d.type === 'interval' || d.type === 'lang'
    };
  });

  if (tekortNietGehaald > 0) waarschuwingen.push('ondergrens-geraakt');

  const werkelijkTekort = weektekort - tekortNietGehaald;
  const verwachtTempo = werkelijkTekort / I.kcalPerKiloVet;

  return {
    bmr: rond(rust, 5),
    basisverbruik: rond(basisverbruik, 25),
    week: plan,
    gemiddeld: rond(plan.reduce((s, d) => s + d.kcal, 0) / (plan.length || 1), 25),
    eiwit,
    vet: vetMin,
    ondergrens: rond(ondergrens, 25),
    weektekort: rond(werkelijkTekort, 25),
    verwachtTempo: Math.round(verwachtTempo * 100) / 100,
    waarschuwingen
  };
}

// ===========================================================================
// 4. DE WEKELIJKSE BIJSTURING (de beslisboom)
// ===========================================================================
// Dit is het automatische deel van de check-in. Michel schrijft de berichten
// zelf; hier staan alleen de REGELS en een korte werktekst per regel.
//
// invoer:
//   metingen: [{ week: 1, gewicht: 84.0 }, ...] oplopend, laatste = nu
//   plan: uitkomst van berekenPlan
//   gevoel: 'goed' | 'wisselend' | 'slecht'   (hoe voelden de trainingen)
//   etenGelukt: 'ja' | 'meestal' | 'nee'
//   streefgewicht, lengte
//
// uit: { regel, kcalAanpassing, tempoAanpassing, naarMens, kop, werktekst }
//
// `naarMens` betekent: dit gaat niet automatisch de deur uit, Michel of zijn
// vriendin kijkt ernaar. Zie de uitzonderingsregel op de verkooppagina.
export function wekelijkseBijsturing(invoer) {
  const uit = bepaalRegel(invoer);
  // De kop en de tekst komen uit BERICHTEN bovenaan dit bestand, zodat Michel
  // die kan herschrijven zonder aan de regels te zitten. Staat er geen tekst,
  // dan valt hij terug op de werktekst; dan ziet hij meteen dat er eentje mist.
  const bericht = BERICHTEN[uit.regel];
  return {
    ...uit,
    kop: bericht?.kop || uit.kop,
    tekst: bericht?.tekst || uit.werktekst
  };
}

function bepaalRegel({ metingen = [], plan, gevoel = 'goed',
                       etenGelukt = 'meestal', streefgewicht, lengte }) {
  const I = INSTELLINGEN;
  // Alle regels rekenen op WEEKGEMIDDELDEN, niet op losse wegingen. Anders
  // beslist een toevallige ochtend met een kilo verschil over de bijsturing.
  const weken = weekGemiddelden(metingen);
  const n = weken.length;
  const laatste = weken[n - 1];

  // --- Geen meting: eerst herinneren ---
  if (n === 0) {
    return { regel: 'geen-meting', kcalAanpassing: 0, naarMens: false,
      kop: 'Nog geen gewicht ingevuld',
      werktekst: 'Vul je gewicht in, dan reken ik je week door.' };
  }

  // --- Twee weken niets ingevuld: naar een mens ---
  const gemist = n >= 2 ? laatste.week - weken[n - 2].week - 1 : 0;
  if (gemist >= 2) {
    return { regel: 'twee-weken-gemist', kcalAanpassing: 0, naarMens: true,
      kop: 'Je was er twee weken uit',
      werktekst: 'Deelnemer heeft twee check-ins gemist. Even persoonlijk contact voordat het programma doorloopt.' };
  }

  // --- Onder de gezonde grens gaat VOOR het streefgewicht ---
  // Stond eerst andersom, en dan kreeg iemand die doorzakte tot onder een
  // gezond gewicht elke week vrolijk "je bent op je streefgewicht" te zien,
  // omdat die regel als eerste vuurde. De veiligheidsregel wint altijd.
  if (Number.isFinite(lengte)) {
    const bmi = laatste.gewicht / Math.pow(lengte / 100, 2);
    if (bmi < I.gezondeBmiOndergrens) {
      return { regel: 'onder-gezonde-grens', kcalAanpassing: +400, naarMens: true,
        kop: 'We stoppen met afvallen',
        werktekst: 'Gewicht onder de gezonde ondergrens voor deze lengte. Tekort direct eraf, persoonlijk contact.' };
    }
  }
  if (Number.isFinite(streefgewicht) && laatste.gewicht <= streefgewicht) {
    return { regel: 'doel-bereikt', kcalAanpassing: +300, naarMens: true,
      kop: 'Je bent op je streefgewicht',
      werktekst: 'Streefgewicht bereikt. Overschakelen naar onderhoud, niet doorgaan met het tekort.' };
  }

  // --- Eerste twee weken beoordelen we niet: dat is grotendeels vocht ---
  if (laatste.week <= 2) {
    return { regel: 'te-vroeg', kcalAanpassing: 0, naarMens: false,
      kop: 'Nog even niets veranderen',
      werktekst: 'De eerste twee weken zijn vooral vocht. We kijken vanaf week 3 naar de trend.' };
  }

  // --- Trainingen voelen slecht: dat gaat vóór de weegschaal ---
  if (gevoel === 'slecht') {
    return { regel: 'trainingen-slecht', kcalAanpassing: +250, naarMens: true,
      kop: 'Eerst je trainingen terug',
      werktekst: 'Trainingen voelen slecht. Tekort deze week omhoog; als het volgende week nog zo is, persoonlijk kijken.' };
  }

  // --- De trend over de laatste drie weken ---
  const trend = gewichtsTrend(metingen, 3);   // kg per week, negatief = eraf
  const perWeek = -trend;                     // positief = eraf

  // De grenzen hieronder bewegen mee met de lichaamsbouw. Bij een gewone BMI
  // komt er precies uit wat er altijd uitkwam (0,8 / 0,5 / 0,25); bij een
  // slanke renner liggen ze lager, want daar is een halve kilo per week niet
  // hetzelfde als bij iemand van honderd kilo.
  const maxTempo = maxTempoVoor({ gewicht: laatste.gewicht, lengte });
  const veelTeSnel = maxTempo + 0.3;
  const opKoersVanaf = Math.max(0.1, maxTempo * 0.5);

  if (perWeek > veelTeSnel) {
    return { regel: 'veel-te-snel', kcalAanpassing: +350, naarMens: true,
      kop: 'Dit gaat te hard',
      werktekst: `Meer dan ${veelTeSnel.toFixed(2)} kg per week eraf. Fors bijvoeren en persoonlijk contact: hier gaat spiermassa mee.` };
  }
  if (perWeek > maxTempo) {
    return { regel: 'te-snel', kcalAanpassing: +250, naarMens: false,
      kop: 'Iets te snel, we voeren bij',
      werktekst: `Boven het maximumtempo van ${maxTempo.toFixed(2)} kg per week voor deze lichaamsbouw. Tekort kleiner maken.` };
  }
  if (perWeek >= opKoersVanaf) {
    return { regel: 'op-koers', kcalAanpassing: 0, naarMens: false,
      kop: 'Precies goed, niets veranderen',
      werktekst: 'Binnen het doeltempo. Niets aanpassen.' };
  }
  if (perWeek >= 0.1) {
    return { regel: 'iets-traag', kcalAanpassing: -100, naarMens: false,
      kop: 'Het loopt, maar rustig',
      werktekst: 'Iets onder het doeltempo. Klein beetje eraf, alleen op de rustdagen.' };
  }

  // --- Staat stil of gaat omhoog ---
  if (etenGelukt === 'nee') {
    return { regel: 'stil-eten-lukt-niet', kcalAanpassing: 0, naarMens: false,
      kop: 'Eerst het eten, dan de getallen',
      werktekst: 'Geen daling, maar het eten lukte niet. Niets aanpassen: eerst uitvoering, anders snijden we in een plan dat niet gevolgd is.' };
  }
  if (perWeek >= -0.1) {
    return { regel: 'stilstand', kcalAanpassing: -200, naarMens: false,
      kop: 'Even bijstellen',
      werktekst: 'Drie weken vlak bij goede uitvoering. Tekort vergroten, verdeeld over de rustdagen.' };
  }
  return { regel: 'gaat-omhoog', kcalAanpassing: -250, naarMens: true,
    kop: 'We kijken hier samen naar',
    werktekst: 'Gewicht stijgt bij goede uitvoering. Persoonlijk nakijken voordat we verder snijden.' };
}

// Meerdere wegingen in dezelfde week worden eerst gemiddeld. Dat is de hele
// reden dat extra wegingen mogen: één ochtend kan er zomaar een kilo naast
// zitten door zout, vocht of een late maaltijd, en dat verdwijnt in het
// gemiddelde.
//
// Let op: een vaste tweede weegdag, bijvoorbeeld vrijdag naast maandag, is
// juist een SLECHT idee. Maandagochtend is systematisch je zwaarste moment van
// de week en vrijdag je lichtste, dus dan meet je vooral de kalender. Daarom
// staat er nergens een tweede vast moment; extra wegingen mogen op elke dag en
// hoe meer dagen erin zitten, hoe eerlijker het gemiddelde.
export function weekGemiddelden(metingen = []) {
  const perWeek = new Map();
  for (const m of metingen) {
    if (!Number.isFinite(m?.gewicht)) continue;
    const lijst = perWeek.get(m.week) || [];
    lijst.push(m.gewicht);
    perWeek.set(m.week, lijst);
  }
  return [...perWeek.entries()]
    .map(([week, lijst]) => ({
      week,
      gewicht: Math.round((lijst.reduce((a, b) => a + b, 0) / lijst.length) * 100) / 100,
      aantal: lijst.length
    }))
    .sort((a, b) => a.week - b.week);
}

// Helling van de laatste `aantal` weken, in kg per week (kleinste kwadraten).
// Rekent op de weekgemiddelden, niet op losse wegingen.
// Buikomtrek: de goedkoopste tweede meting die er is.
//
// Waarom hij erbij staat: de weegschaal kan drie weken stilstaan terwijl er
// wel degelijk vet af gaat. Dat is precies de week waarin mensen afhaken.
// Zakt de omtrek wel, dan heb je iets om te laten zien.
//
// Waarom hij het plan NIET bijstuurt: één bandmeting heeft makkelijk een paar
// centimeter speling, afhankelijk van waar je hem legt en of je uitademt.
// Te onnauwkeurig om calorieën op te baseren, prima om een trend te tonen.
// Het gewicht blijft sturen; de omtrek vertelt het verhaal erbij.
export function buikverschil(metingen = []) {
  const met = metingen
    .filter(m => Number.isFinite(Number(m.buikomtrek)) && Number(m.buikomtrek) > 0)
    .sort((a, b) => (a.week - b.week) || String(a.op).localeCompare(String(b.op)));
  if (met.length < 2) {
    return met.length === 1
      ? { start: Number(met[0].buikomtrek), laatste: null, verschil: null, metingen: 1 }
      : null;
  }
  const start = Number(met[0].buikomtrek);
  const laatste = Number(met[met.length - 1].buikomtrek);
  return {
    start,
    laatste,
    verschil: Math.round((laatste - start) * 10) / 10,
    week: met[met.length - 1].week,
    metingen: met.length
  };
}

// In welke weken vragen we de omtrek. Elke week is onzin: de ruis is groter
// dan wat er in zeven dagen verandert. Bij de start en bij elke evaluatie.
export const OMTREKWEKEN = [1, 4, 8, 12];
export function vraagOmtrek(week) {
  return OMTREKWEKEN.includes(Number(week));
}

export function gewichtsTrend(metingen, aantal = 3) {
  const punten = weekGemiddelden(metingen).slice(-Math.max(2, aantal));
  if (punten.length < 2) return 0;
  const n = punten.length;
  const gemX = punten.reduce((s, p) => s + p.week, 0) / n;
  const gemY = punten.reduce((s, p) => s + p.gewicht, 0) / n;
  let teller = 0, noemer = 0;
  for (const p of punten) {
    teller += (p.week - gemX) * (p.gewicht - gemY);
    noemer += (p.week - gemX) ** 2;
  }
  if (noemer === 0) return 0;
  return Math.round((teller / noemer) * 100) / 100;
}

// Past een bijsturing toe op het plan: de aanpassing gaat naar de dagen waar
// ruimte is, nooit naar een kwaliteitsdag.
export function pasBijsturingToe(plan, kcalAanpassing) {
  if (!kcalAanpassing) return plan;
  const kandidaten = plan.week.filter(d => !d.isKwaliteitsdag);
  const doelen = kandidaten.length ? kandidaten : plan.week;
  const perDag = rond(kcalAanpassing / doelen.length, 25);
  const nieuw = plan.week.map(d => {
    if (!doelen.includes(d)) return d;
    const kcal = Math.max(plan.ondergrens, rond(d.kcal + perDag, 25));
    const koolhydraten = Math.max(0, rond((kcal - d.eiwit * 4 - d.vet * 9) / 4, 5));
    return { ...d, kcal, koolhydraten };
  });
  return { ...plan, week: nieuw,
    gemiddeld: rond(nieuw.reduce((s, d) => s + d.kcal, 0) / (nieuw.length || 1), 25) };
}

// ===========================================================================
// 5. DE AFVALKAART (leadmagnet)
// ===========================================================================
// Dezelfde motor, maar teruggebracht tot een opzoektabel. Bewust grof: de
// kaart kent je lengte, leeftijd en weekindeling niet. Daarom rekenen we met
// een standaardprofiel en zeggen we er eerlijk bij dat het een schatting is.
export const KAART_AANNAMES = {
  leeftijd: 42,
  lengteBijGewicht: (kg) => Math.round(170 + (kg - 60) * 0.55), // grove maar nette aanname
  werk: 'zittend',
  // Weekindelingen per urenklasse. De kaart geeft één rustdag- en één
  // trainingsdaggetal, dus we rekenen met een gemiddelde trainingsdag.
  weken: {
    '<4':   [{ type: 'duur', uren: 1.5 }, { type: 'interval', uren: 1 }, { type: 'duur', uren: 1.5 }],
    '4-8':  [{ type: 'duur', uren: 2 }, { type: 'interval', uren: 1.25 }, { type: 'duur', uren: 1.5 }, { type: 'lang', uren: 1.25 }],
    '8-12': [{ type: 'duur', uren: 2 }, { type: 'interval', uren: 1.5 }, { type: 'duur', uren: 2 }, { type: 'lang', uren: 3.5 }, { type: 'herstel', uren: 1 }],
    '12+':  [{ type: 'duur', uren: 2 }, { type: 'interval', uren: 1.75 }, { type: 'duur', uren: 2.5 }, { type: 'lang', uren: 4 }, { type: 'duur', uren: 1.75 }, { type: 'herstel', uren: 1 }]
  }
};

export function kaartRij(gewicht, urenklasse, geslacht = 'man') {
  const A = KAART_AANNAMES;
  const lengte = A.lengteBijGewicht(gewicht);
  const ritten = A.weken[urenklasse] || A.weken['4-8'];
  const week = [];
  for (let i = 0; i < 7; i++) {
    week.push(ritten[i] ? { dag: `d${i + 1}`, ...ritten[i] } : { dag: `d${i + 1}`, type: 'rust', uren: 0 });
  }
  const plan = berekenPlan({
    geslacht, leeftijd: A.leeftijd, lengte, gewicht,
    streefgewicht: gewicht - 5, werk: A.werk, ftp: null, week
  });
  const rustdagen = plan.week.filter(d => d.type === 'rust');
  const trainingsdagen = plan.week.filter(d => d.type !== 'rust');
  const gem = (arr) => arr.length ? rond(arr.reduce((s, d) => s + d.kcal, 0) / arr.length, 50) : 0;
  return {
    gewicht,
    urenklasse,
    rustdag: gem(rustdagen),
    trainingsdag: gem(trainingsdagen),
    eiwit: plan.eiwit,
    opOndergrens: plan.waarschuwingen.includes('ondergrens-geraakt')
  };
}

// ===========================================================================
// 6. DE MINI-CHECK
// ===========================================================================
// Wat iemand krijgt vóór hij de kaart downloadt: zijn eigen richtlijn uit vier
// vragen. Nadrukkelijk een STARTRICHTLIJN en geen voedingsadvies, want we
// weten zijn lengte, leeftijd en weekindeling niet.
//
// Gebruikt precies dezelfde motor als het betaalde programma, zodat een koper
// later geen andere getallen krijgt dan hij hier zag. Dat verschil zou het
// eerste zijn wat hij opmerkt, en het laatste wat je kunt gebruiken.
export const URENKLASSEN = [
  { waarde: '<4',   tekst: 'Minder dan 4 uur',  uren: 3 },
  { waarde: '4-8',  tekst: '4 tot 8 uur',       uren: 6 },
  { waarde: '8-12', tekst: '8 tot 12 uur',      uren: 10 },
  { waarde: '12+',  tekst: 'Meer dan 12 uur',   uren: 13 }
];

// "een lange rit van 3,5 uur", "een intervalrit van 1 uur". Gebruikt op de
// uitkomstpagina en in de mail, zodat het zwaarste getal te plaatsen is.
function ritOmschrijving(dag) {
  const soort = { lang: 'een lange rit', interval: 'een intervalrit',
                  duur: 'een duurrit', herstel: 'een hersteltrit' }[dag.type] || 'een rit';
  const uren = String(dag.uren).replace('.', ',');
  return `${soort} van ${uren} uur`;
}

export function persoonlijkeRichtlijn({ geslacht = 'man', gewicht, urenklasse = '4-8',
                                        werk = 'zittend', lengte, leeftijd }) {
  const A = KAART_AANNAMES;
  if (!Number.isFinite(gewicht) || gewicht < INSTELLINGEN.minGewichtKg
      || gewicht > INSTELLINGEN.maxGewichtKg) return null;

  const gebruiktLengte = Number.isFinite(lengte) ? lengte : A.lengteBijGewicht(gewicht);
  const gebruiktLeeftijd = Number.isFinite(leeftijd) ? leeftijd : A.leeftijd;
  const ritten = A.weken[urenklasse] || A.weken['4-8'];

  const week = [];
  for (let i = 0; i < 7; i++) {
    week.push(ritten[i] ? { dag: `d${i + 1}`, ...ritten[i] } : { dag: `d${i + 1}`, type: 'rust', uren: 0 });
  }
  const plan = berekenPlan({
    geslacht, leeftijd: gebruiktLeeftijd, lengte: gebruiktLengte, gewicht,
    streefgewicht: gewicht - 5, werk, ftp: null, week
  });

  const rustdagen = plan.week.filter(d => d.type === 'rust');
  const trainingsdagen = plan.week.filter(d => d.type !== 'rust');
  const gem = arr => arr.length ? rond(arr.reduce((s, d) => s + d.kcal, 0) / arr.length, 50) : 0;
  const zwaarste = trainingsdagen.reduce((a, b) => (b.kcal > (a?.kcal ?? 0) ? b : a), null);

  return {
    geslacht, gewicht, urenklasse, werk,
    rustdag: gem(rustdagen),
    trainingsdag: gem(trainingsdagen),
    zwaarsteDag: zwaarste ? zwaarste.kcal : null,
    // De omschrijving erbij, want zonder context is dat getal onbruikbaar:
    // iemand ziet 5100 kcal naast 3500 en weet niet wanneer hij welke moet
    // hebben. Eén bron voor die zin, zodat scherm en mail nooit uiteenlopen.
    zwaarsteUren: zwaarste ? zwaarste.uren : null,
    zwaarsteType: zwaarste ? zwaarste.type : null,
    zwaarsteOmschrijving: zwaarste ? ritOmschrijving(zwaarste) : null,
    eiwit: plan.eiwit,
    koolhydratenPerUur: INSTELLINGEN.koolhydratenPerUur,
    tempo: plan.verwachtTempo,
    opOndergrens: plan.waarschuwingen.includes('ondergrens-geraakt'),
    // Waar we van uit zijn gegaan. Hoort in de uitkomst te staan, zodat
    // niemand denkt dat dit op zijn eigen lichaam is uitgerekend.
    aannames: { lengte: gebruiktLengte, leeftijd: gebruiktLeeftijd,
                eigenLengte: Number.isFinite(lengte), eigenLeeftijd: Number.isFinite(leeftijd) }
  };
}

export function kaartTabel(geslacht = 'man') {
  const rijen = [];
  for (let kg = 60; kg <= 100; kg += 5) {
    for (const klasse of ['<4', '4-8', '8-12']) {
      rijen.push(kaartRij(kg, klasse, geslacht));
    }
  }
  return rijen;
}
