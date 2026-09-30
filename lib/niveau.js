// /lib/niveau.js
// De inschrijfkaart van Het Afvalprogramma: de vragen die bepalen of iemand
// het Basis- of het Opbouwschema krijgt.
//
// BELANGRIJK: de uitkomst is INTERN. De deelnemer ziet alleen de vragen, nooit
// zijn score en nooit welk niveau eruit komt. Anders gaat hij zijn antwoorden
// aanpassen om "het zwaardere" schema te krijgen, en dat is precies de groep
// die in een tekort in de problemen komt.
//
// De vragen staan hier zodat de klantpagina ze rendert uit dezelfde bron als
// waarmee de api scoort. Eén lijst, geen kopie.

export const NIVEAUS = {
  basis:  { naam: 'Basis',  omschrijving: 'Rustiger opbouwen, minder intensiteit, meer ruimte voor herstel.' },
  opbouw: { naam: 'Opbouw', omschrijving: 'Meer kwaliteit per week, hogere belasting, voor wie al staat.' }
};

// Elke vraag: id, tekst, en opties met punten. Meer punten = meer richting Opbouw.
// De teksten zijn bewust neutraal: niets verraadt welk antwoord "beter" is.
export const VRAGEN = [
  {
    id: 'ervaring',
    tekst: 'Hoe lang train je al met een plan of een vaste weekindeling?',
    opties: [
      { waarde: 'geen',    tekst: 'Ik fiets wel, maar zonder plan',        punten: 0 },
      { waarde: 'kort',    tekst: 'Minder dan een jaar',                   punten: 8 },
      { waarde: 'middel',  tekst: 'Eén tot drie jaar',                     punten: 16 },
      { waarde: 'lang',    tekst: 'Langer dan drie jaar',                  punten: 22 }
    ]
  },
  {
    id: 'regelmaat',
    tekst: 'Hoe consequent heb je de afgelopen drie maanden gefietst?',
    opties: [
      { waarde: 'weinig',  tekst: 'Er zaten weken tussen dat ik niet reed', punten: 0 },
      { waarde: 'wisselend', tekst: 'Wisselend, gemiddeld een paar keer per week', punten: 10 },
      { waarde: 'vast',    tekst: 'Elke week ongeveer hetzelfde',          punten: 20 }
    ]
  },
  {
    id: 'intensiteit',
    tekst: 'Doe je op dit moment intervaltrainingen?',
    opties: [
      { waarde: 'nee',     tekst: 'Nee',                                   punten: 0 },
      { waarde: 'soms',    tekst: 'Af en toe, niet gepland',               punten: 9 },
      { waarde: 'ja',      tekst: 'Ja, elke week één of meer',             punten: 18 }
    ]
  },
  {
    id: 'langsterit',
    tekst: 'Hoe lang was je langste rit van de afgelopen maand?',
    opties: [
      { waarde: 'kort',    tekst: 'Korter dan een uur',                    punten: 0 },
      { waarde: 'uur2',    tekst: 'Eén tot twee uur',                      punten: 6 },
      { waarde: 'uur3',    tekst: 'Twee tot drie uur',                     punten: 13 },
      { waarde: 'lang',    tekst: 'Langer dan drie uur',                   punten: 18 }
    ]
  },
  {
    id: 'schema',
    tekst: 'Heb je eerder met een trainingsschema gereden?',
    opties: [
      { waarde: 'nooit',   tekst: 'Nee, dit wordt de eerste keer',         punten: 0 },
      { waarde: 'ooit',    tekst: 'Ja, maar dat is een tijd geleden',      punten: 6 },
      { waarde: 'nu',      tekst: 'Ja, ik rijd er nu ook een',             punten: 12 }
    ]
  },
  {
    id: 'doel',
    tekst: 'Wat wil je over twaalf weken vooral kunnen?',
    // Weegt licht mee, maar staat er vooral zodat jij weet wat iemand wil.
    opties: [
      { waarde: 'fitter',  tekst: 'Fitter zijn en me lichter voelen op de fiets', punten: 0 },
      { waarde: 'toertocht', tekst: 'Een lange toertocht uitrijden zonder in te storten', punten: 5 },
      { waarde: 'groep',   tekst: 'Meekomen in de groep of op de klim',    punten: 8 },
      { waarde: 'koers',   tekst: 'Koersen of hard rijden in wedstrijden', punten: 10 }
    ]
  }
];

// Naast de antwoorden wegen twee gemeten dingen mee, want die liegen niet:
// het aantal uren uit de weekindeling en, als het er is, watt per kilo.
// We rekenen in PROCENTEN van wat deze persoon kán halen, niet in losse punten.
// Reden: wie geen vermogensmeter heeft kan de watt-per-kilo-punten nooit
// verdienen en zou anders systematisch naar Basis zakken. Dat is tweederde
// van de lijst, dus dat zou structureel scheef staan.
export const DREMPELS = {
  basisTot: 42,     // tot en met dit percentage: Basis
  opbouwVanaf: 58   // vanaf dit percentage: Opbouw. Daartussen: naar een mens.
};

// invoer:
//   antwoorden: { ervaring: 'kort', regelmatig: ... }
//   uren: totaal fietsuren per week uit de weekindeling
//   ftp, gewicht: optioneel, voor watt per kilo
//
// uit: { niveau: 'basis'|'opbouw'|'twijfel', score, punten: {...}, redenen: [] }
export function bepaalNiveau({ antwoorden = {}, uren = 0, ftp = null, gewicht = null }) {
  const punten = {};
  let score = 0;
  let maximaal = 0;              // wat deze persoon maximaal kán halen
  const redenen = [];

  for (const v of VRAGEN) {
    const gekozen = v.opties.find(o => o.waarde === antwoorden[v.id]);
    const p = gekozen ? gekozen.punten : 0;
    punten[v.id] = p;
    score += p;
    maximaal += Math.max(...v.opties.map(o => o.punten));
    if (gekozen) redenen.push(`${v.id}: ${gekozen.tekst} (${p})`);
  }

  // Uren per week: het sterkste objectieve signaal na de regelmaat.
  let purenPunten = 0;
  if (uren >= 10) purenPunten = 16;
  else if (uren >= 7) purenPunten = 12;
  else if (uren >= 5) purenPunten = 7;
  else if (uren >= 3) purenPunten = 3;
  punten.uren = purenPunten;
  score += purenPunten;
  maximaal += 16;
  redenen.push(`uren: ${uren} per week (${purenPunten})`);

  // Watt per kilo, alleen als er een FTP is. Bewust een kleine bijdrage:
  // iemand kan een goede FTP hebben en toch net terug zijn van een winterstop.
  let wkg = null, wkgPunten = 0;
  if (Number.isFinite(ftp) && ftp > 0 && Number.isFinite(gewicht) && gewicht > 0) {
    wkg = ftp / gewicht;
    if (wkg >= 3.6) wkgPunten = 14;
    else if (wkg >= 3.1) wkgPunten = 10;
    else if (wkg >= 2.6) wkgPunten = 5;
    punten.wkg = wkgPunten;
    score += wkgPunten;
    maximaal += 14;
    redenen.push(`watt per kilo: ${wkg.toFixed(2)} (${wkgPunten})`);
  } else {
    redenen.push('watt per kilo: onbekend, telt niet mee');
  }
  const percentage = maximaal > 0 ? Math.round((score / maximaal) * 100) : 0;

  // --- Harde regels die de score overrulen ---
  // Wie nauwelijks reed of geen enkele intervaltraining doet, begint op Basis.
  // Ook als hij op punten hoger uitkomt: in een tekort beginnen met een zwaar
  // blok is precies waar het misgaat.
  const overrules = [];
  if (antwoorden.regelmaat === 'weinig') overrules.push('reed de laatste maanden onregelmatig');
  if (antwoorden.ervaring === 'geen' && antwoorden.intensiteit === 'nee') {
    overrules.push('geen plan en geen intervaltraining');
  }
  if (uren < 3) overrules.push('minder dan drie uur per week');

  let niveau;
  if (overrules.length) niveau = 'basis';
  else if (percentage <= DREMPELS.basisTot) niveau = 'basis';
  else if (percentage >= DREMPELS.opbouwVanaf) niveau = 'opbouw';
  else niveau = 'twijfel';

  return {
    niveau,
    advies: niveau === 'twijfel' ? 'basis' : niveau,   // waar we op terugvallen
    score, maximaal, percentage,
    wkg: wkg ? Math.round(wkg * 100) / 100 : null,
    punten,
    overrules,
    redenen
  };
}

// Korte samenvatting voor de interne mail. Nooit naar de klant sturen.
export function niveauSamenvatting(uitkomst) {
  const cijfer = `${uitkomst.percentage}% (${uitkomst.score} van ${uitkomst.maximaal})`;
  const kop = uitkomst.niveau === 'twijfel'
    ? `TWIJFELGEVAL op ${cijfer} — zelf kiezen, voorstel: ${NIVEAUS[uitkomst.advies].naam}`
    : `${NIVEAUS[uitkomst.niveau].naam} op ${cijfer}`;
  const regels = [
    kop,
    uitkomst.overrules.length ? `Teruggezet naar Basis omdat: ${uitkomst.overrules.join('; ')}` : null,
    ...uitkomst.redenen
  ].filter(Boolean);
  return regels;
}
