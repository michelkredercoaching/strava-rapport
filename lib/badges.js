// /lib/badges.js
// Je palmares in de MKC-app. ÉÉN bron van waarheid voor badges en beloningen.
//
// Versie 2 (13-10-2026): elke badge heeft drie niveaus, brons, zilver en goud.
// Elk behaald niveau is een medaille; het totaal aantal medailles ontgrendelt
// beloningen (BELONINGEN). 20 badges x 3 = 60 medailles, dus er valt lang wat te halen.
//
// De server (api/app.js) rekent alles uit met eigen gegevens, nooit met wat de
// app zelf opgeeft:
//   - Core: sessies, niveaus, Rompscore en reeks uit het Core-dossier
//   - Rijden: levenslange tellers in app:teller:<email> (ritten 1x per dag,
//     beoordeeld, vroeg) en het weer dat de SERVER ophaalt bij "Ik rijd hiermee"
//   - Groepsrit: geplande ritten en het hoogste aantal meerijders
//   - Finishes (doel afgerond), maten (betaald lid via jouw link), coachvragen,
//     Strava-analyses (geteld bij de betaling)
// Eerlijke verdeling (13-10-2026): brons en zilver kan iedereen halen; GOUD is voor
// leden (ook coaching en schema). Haalt een gratis gebruiker de goud-drempel, dan staat
// goud klaar (goudKlaar) en krijgt hij het zodra hij lid is.
// lid: true = te verdienen met Pro (Core-app en slimme bandenspanning);
// gratis gebruikers zien die als "Met Pro" en doen mee met de rest.
// Behaalde niveaus blijven staan, met datum, in app:medailles:<email>.

export const NIVEAUS = ['brons', 'zilver', 'goud'];

export const BADGES = [
  // Core-app
  { id: 'stalen-romp', lid: true, groep: 'Core', naam: 'Stalen romp', icoon: 'core', eenheid: ['Core-sessie', 'Core-sessies'], drempels: [5, 25, 50], van: (s) => s.coreSessies },
  { id: 'niveau', lid: true, groep: 'Core', naam: 'Niveau omhoog', icoon: 'omhoog', eenheid: ['niveau afgerond', 'niveaus afgerond'], drempels: [1, 3, 6], van: (s) => s.coreNiveaus },
  { id: 'sterker', lid: true, groep: 'Core', naam: 'Sterker gemeten', icoon: 'grafiek', eenheid: ['punt Rompscore erbij', 'punten Rompscore erbij'], drempels: [5, 10, 20], van: (s) => Math.max(0, s.rompPlus || 0) },
  { id: 'volhouder', lid: true, groep: 'Core', naam: 'Volhouder', icoon: 'vlam', eenheid: ['week op rij', 'weken op rij'], drempels: [4, 8, 12], van: (s) => s.reeks },
  // Van start (14-10-2026): je eerste medaille meteen na de welkomstreeks. Telt de startstappen die de server ziet:
  // doel gekozen, meldingen aan, eerste coachvraag, Core-intake gedaan, fiets en woonplaats ingesteld.
  { id: 'van-start', groep: 'Start', naam: 'Van start', icoon: 'start', eenheid: ['startstap gezet', 'startstappen gezet'], drempels: [1, 3, 5], van: (s) => s.vanStart || 0,
    uitleg: ['Kies waar je voor traint', '3 van de 5 startstappen: doel, meldingen, coachvraag, Core-intake, fiets', 'Alle 5 startstappen gezet'] },
  // Strava (14-10-2026): Core-sessies gedeeld op Strava, en weken op rij (beste reeks ooit).
  { id: 'op-strava', groep: 'Strava', naam: 'Op Strava', icoon: 'strava', eenheid: ['Core-sessie gedeeld', 'Core-sessies gedeeld'], drempels: [1, 25, 100], van: (s) => s.stravaGedeeld || 0 },
  { id: 'strava-reeks', lid: true, groep: 'Strava', naam: 'Strava-reeks', icoon: 'strava', eenheid: ['week op rij gedeeld', 'weken op rij gedeeld'], drempels: [4, 12, 26], van: (s) => s.stravaReeksMax || 0,
    uitleg: ['4 weken op rij minstens één sessie op Strava', '12 weken op rij, een heel Core-blok', '26 weken op rij, een half jaar'] },
  // Elke dag de app open (beste reeks ooit, dus een gemiste dag kost je geen medaille)
  { id: 'ochtendmens', veld: 'ochtend', lid: true, groep: 'Elke dag', naam: 'Ochtendmens', icoon: 'zon', eenheid: ['ochtendbericht ontvangen', 'ochtendberichten ontvangen'], drempels: [7, 30, 100], van: (s) => s.ochtend },
  { id: 'dagelijkse-kost', groep: 'Elke dag', naam: 'Dagelijkse kost', icoon: 'kalender', eenheid: ['dag op rij de app geopend', 'dagen op rij de app geopend'], drempels: [7, 14, 21], van: (s) => s.openMax },
  { id: 'gewoontedier', groep: 'Elke dag', naam: 'Gewoontedier', icoon: 'kalender', eenheid: ['dag op rij de app geopend', 'dagen op rij de app geopend'], drempels: [42, 84, 182], van: (s) => s.openMax },
  // Rijden
  { id: 'vaste-rijder', veld: 'ritten', lid: true, groep: 'Rijden', naam: 'Vaste rijder', icoon: 'fiets', eenheid: ['rit voorbereid', 'ritten voorbereid'], drempels: [3, 25, 100], van: (s) => s.ritten },
  { id: 'fijnproever', veld: 'beoordeeld', lid: true, groep: 'Rijden', naam: 'Fijnproever', icoon: 'vink', eenheid: ['rit nagekeken', 'ritten nagekeken'], drempels: [3, 10, 25], van: (s) => s.beoordeeld },
  { id: 'winterrijder', veld: 'winter', lid: true, groep: 'Rijden', naam: 'Winterrijder', icoon: 'sneeuw', eenheid: ['rit onder 5 graden', 'ritten onder 5 graden'], drempels: [1, 5, 15], van: (s) => s.winter },
  { id: 'regenvreter', veld: 'regen', lid: true, groep: 'Rijden', naam: 'Regenvreter', icoon: 'regen', eenheid: ['rit in regen of op nat wegdek', 'ritten in regen of op nat wegdek'], drempels: [1, 5, 15], van: (s) => s.regen },
  { id: 'vroege-vogel', veld: 'vroeg', lid: true, groep: 'Rijden', naam: 'Vroege vogel', icoon: 'zon', eenheid: ['rit voor 7 uur', 'ritten voor 7 uur'], drempels: [1, 5, 15], van: (s) => s.vroeg },
  // Groepsrit
  { id: 'clubkapitein', veld: 'groepsritten', groep: 'Groepsrit', naam: 'Clubkapitein', icoon: 'groep', eenheid: ['groepsrit gepland', 'groepsritten gepland'], drempels: [1, 5, 10], van: (s) => s.groepsritten },
  { id: 'groepsmagneet', veld: 'groepMeeMax', groep: 'Groepsrit', naam: 'Groepsmagneet', icoon: 'magneet', eenheid: ['meerijder in één rit', 'meerijders in één rit'], drempels: [3, 5, 10], van: (s) => s.groepMeeMax },
  // Doel
  { id: 'finisher', veld: 'finishes', groep: 'Doel', naam: 'Finisher', icoon: 'vlag', eenheid: ['tocht of wedstrijd uitgereden', 'tochten of wedstrijden uitgereden'], drempels: [1, 2, 3], van: (s) => s.finishes },
  // Lidmaatschap
  { id: 'trouw-lid', lid: true, groep: 'Pro', naam: 'Trouw Pro', icoon: 'kroon', eenheid: ['maand Pro', 'maanden Pro'], drempels: [1, 3, 12], van: (s) => s.lidMaanden },
  // Maten
  { id: 'ploegbouwer', groep: 'Maten', naam: 'Ploegbouwer', icoon: 'maten', eenheid: ['maat lid geworden', 'maten lid geworden'], drempels: [1, 5, 10], van: (s) => s.maten },
  // Kennis
  { id: 'leergierig', veld: 'coach', groep: 'Kennis', naam: 'Leergierig', icoon: 'vraag', eenheid: ['coachvraag', 'coachvragen'], drempels: [3, 15, 30], van: (s) => s.coach },
  { id: 'gemeten', veld: 'analyses', groep: 'Kennis', naam: 'Gemeten', icoon: 'meten', eenheid: ['Strava-analyse', 'Strava-analyses'], drempels: [1, 2, 3], van: (s) => s.analyses },
  // Pacingplan: de volgende stap na je analyse. Binnenkort te koop; telt dan via de teller pacingplannen.
  { id: 'op-schema', groep: 'Kennis', naam: 'Op schema', icoon: 'pacing', binnenkort: true, eenheid: ['pacingplan', 'pacingplannen'], drempels: [1, 2, 3], van: (s) => s.pacingplannen }
];

// Beloningen bij het totaal aantal medailles (besluit Michel 13-10-2026).
// soort bepaalt wat de server regelt; zie badgesBijwerken in api/app.js.
export const BELONINGEN = [
  { n: 5, id: 'm5', renner: true, titel: 'Pro-pakket', kort: 'Een oranje helm, een spiegelbril en oranje schoenen voor je renner, plus 2 extra gratis coachvragen als je nog geen Pro hebt.' },
  { n: 10, id: 'm10', renner: true, titel: 'Kopmanspakket', kort: 'Bolletjestrui, witte fiets, hoge carbon velgen, oranje lens en fluogele schoenen voor je renner, plus €5 korting op je eerste maand Pro als je nog geen Pro hebt.' },
  { n: 15, id: 'm15', renner: true, titel: 'Teamkit', kort: 'Groene trui, aero-helm en gouden schoenen voor je renner.' },
  { n: 20, id: 'm20', titel: 'Gouden week', kort: 'Een week lang een volledig gouden renner op de ranglijst: trui, helm, bril, schoenen en fiets. Iedereen ziet het.' },
  { n: 25, goud: 3, id: 'm25', titel: 'Gratis Strava-analyse', kort: 'Een Strava-analyse cadeau: zie waar je nu staat. Vanaf 25 medailles, waarvan minstens 3 goud.' },
  { n: 30, goud: 3, id: 'm30', binnenkort: true, titel: 'Gratis pacingplan', kort: 'Een pacingplan voor je tocht cadeau, zodra het er is. Vanaf 30 medailles, waarvan minstens 3 goud.' },
  // Lange termijn (besluit 14-10-2026): bij 40 regelt Michel het zelf (de app mailt hem), daarna een blijvende metalen renner.
  { n: 40, goud: 6, id: 'm40', handmatig: true, titel: 'Maand cadeau', kort: 'Een maand MKC Pro cadeau. Heb je al Pro, dan schuift je volgende betaling een maand op. Vanaf 40 medailles, waarvan minstens 6 goud.' },
  { n: 50, goud: 10, id: 'm50', metaal: 'brons', titel: 'Bronzen renner', kort: 'Voor altijd een bronzen renner op de ranglijst: trui, helm, bril, schoenen en fiets. Vanaf 50 medailles, waarvan minstens 10 goud.' },
  { n: 60, goud: 15, id: 'm60', metaal: 'zilver', titel: 'Zilveren renner', kort: 'Voor altijd een zilveren renner op de ranglijst. Vanaf 60 medailles, waarvan minstens 15 goud.' },
  { n: BADGES.length * 3, alle: true, id: 'legende', metaal: 'goud', titel: 'Legende', kort: 'Alle ' + BADGES.length * 3 + ' medailles. Voor altijd een gouden renner met een kroon op de ranglijst.' }
];
export const MAX_MEDAILLES = BADGES.length * 3;
// Ranglijst (klassement) vanaf dit aantal medailles; daarvoor sta je op de startlijst
// (renner en kleedkamer al wel, nog niet in het klassement). Besluit Michel 13-10-2026: 1.
export const RANGLIJST_VANAF = 1;

const tekst = (b, n) => `${n} ${n === 1 ? b.eenheid[0] : b.eenheid[1]}`;

// stand: de getallen (s.coreSessies, s.ritten, ...). verdiend: { id: { 1: iso, 2: iso, 3: iso } }.
export function badgeOverzicht(stand = {}, verdiend = {}, { lid = true } = {}) {
  return BADGES.map((b) => {
    const waarde = Number(b.van(stand)) || 0;
    const v = verdiend[b.id] && typeof verdiend[b.id] === 'object' ? verdiend[b.id] : {};
    let niveau = 0;
    b.drempels.forEach((d, i) => { if (v[i + 1] || (waarde >= d && (lid || i < 2) && (lid || !b.lid))) niveau = i + 1; });
    const goudKlaar = !lid && niveau < 3 && waarde >= b.drempels[2] && !b.lid;
    const volgende = niveau < 3 ? b.drempels[niveau] : null;
    const goudLid = !lid && niveau === 2;
    return {
      id: b.id, groep: b.groep, naam: b.naam, icoon: b.icoon, eenheid: b.eenheid || null, lid: !!b.lid, binnenkort: !!b.binnenkort && !niveau, niveau, waarde,
      drempels: b.drempels, volgende, goudKlaar, goudLid, op: { 1: v[1] || null, 2: v[2] || null, 3: v[3] || null },
      uitleg: b.uitleg || b.drempels.map((d) => tekst(b, d)),
      nog: goudKlaar ? 'Je goud staat klaar: je krijgt het zodra je lid bent.' : goudLid ? `Goud haal je met Pro: ${tekst(b, b.drempels[2])}.` : volgende != null ? `Nog ${volgende - Math.min(waarde, volgende)} tot ${NIVEAUS[niveau]}: ${tekst(b, volgende)}` : 'Goud gehaald'
    };
  });
}
export const medailleTotaal = (lijst) => lijst.reduce((t, b) => t + b.niveau, 0);

// ---- Je renner (13-10-2026): kleedkamer met spullen die je vrijspeelt ----
// vanaf: { m: medailles, g: gouden badges }. De server controleert het bij opslaan.
export const RENNER = {
  huid: [{ id: 'h1', naam: 'Licht' }, { id: 'h2', naam: 'Getint' }, { id: 'h3', naam: 'Bruin' }, { id: 'h4', naam: 'Donker' }],
  trui: [
    { id: 'mkc', naam: 'MKC-oranje' }, { id: 'zwart', naam: 'Zwart' }, { id: 'wit', naam: 'Wit' },
    { id: 'streep', naam: 'Streep', vanaf: { m: 5 } }, { id: 'bolletjes', naam: 'Bolletjestrui', vanaf: { m: 10 } },
    { id: 'groen', naam: 'Groene trui', vanaf: { m: 15 } }, { id: 'geel', naam: 'Gele trui', vanaf: { m: 20, g: 1 } },
    { id: 'regenboog', naam: 'Regenboogtrui', vanaf: { m: 30, g: 3 } }
  ],
  helm: [
    { id: 'wit', naam: 'Wit' }, { id: 'zwart', naam: 'Zwart' }, { id: 'oranje', naam: 'Oranje', vanaf: { m: 5 } },
    { id: 'aero', naam: 'Aero', vanaf: { m: 15 } }, { id: 'goud', naam: 'Goud', vanaf: { m: 25, g: 2 } }
  ],
  bril: [
    { id: 'geen', naam: 'Geen' }, { id: 'zwart', naam: 'Zwart' }, { id: 'spiegel', naam: 'Spiegel', vanaf: { m: 5 } },
    { id: 'oranje', naam: 'Oranje lens', vanaf: { m: 10 } }, { id: 'goud', naam: 'Goud', vanaf: { m: 20, g: 1 } }
  ],
  fiets: [
    { id: 'oranje', naam: 'Oranje' }, { id: 'rood', naam: 'Rood' }, { id: 'blauw', naam: 'Blauw' }, { id: 'groen', naam: 'Groen' }, { id: 'grijs', naam: 'Grijs' },
    { id: 'wit', naam: 'Wit, speciaal', vanaf: { m: 10 } }, { id: 'zwart', naam: 'Zwart carbon', vanaf: { m: 20, g: 1 } }, { id: 'goud', naam: 'Goud', vanaf: { m: 30, g: 3 } }
  ],
  schoenen: [
    { id: 'wit', naam: 'Wit' }, { id: 'zwart', naam: 'Zwart' }, { id: 'oranje', naam: 'Oranje', vanaf: { m: 5 } },
    { id: 'fluor', naam: 'Fluogeel', vanaf: { m: 10 } }, { id: 'goud', naam: 'Goud', vanaf: { m: 15 } }
  ],
  wielen: [
    { id: 'standaard', naam: 'Standaard' }, { id: 'hoog', naam: 'Hoge carbon velgen', vanaf: { m: 10 } }, { id: 'disc', naam: 'Dicht achterwiel', vanaf: { m: 25, g: 2 } }
  ]
};
export const rennerOpen = (item, m = 0, g = 0) => !item.vanaf || (m >= (item.vanaf.m || 0) && g >= (item.vanaf.g || 0));

// ---- Maanduitdaging (13-10-2026) ----
// Elke maand één uitdaging met een limited-edition medaille: alleen die maand te halen.
// meet = een maandteller op de server (app:maand:<email>:<JJJJ-MM>): appDagen, ritten,
// winter, regen, vroeg, groepsritten, coach, beoordeeld, of coreSessies (uit het Core-dossier).
// lid: true = ledenvariant; met gratis: {...} krijgen gratis gebruikers die maand een eigen
// (lichter) doel voor dezelfde medaille, zodat iedereen elke maand mee kan doen.
export const MAANDUITDAGINGEN = {
  '2026-10': { naam: 'Oktober-opener', kort: 'OKT', meet: 'appDagen', doel: 12, uitleg: 'Open de app op 12 dagen in oktober.' },
  '2026-11': { naam: 'Novembergrinder', kort: 'NOV', meet: 'coreSessies', doel: 8, lid: true, uitleg: 'Doe 8 Core-sessies in november.', gratis: { meet: 'appDagen', doel: 15, uitleg: 'Open de app op 15 dagen in november.' } },
  '2026-12': { naam: 'Winterbeul', kort: 'DEC', meet: 'winter', doel: 3, lid: true, uitleg: 'Ga 3 keer op pad bij minder dan 5 graden in december.', gratis: { meet: 'groepsritten', doel: 1, uitleg: 'Plan 1 groepsrit in december.' } },
  '2027-01': { naam: 'Goede voornemens', kort: 'JAN', meet: 'appDagen', doel: 20, uitleg: 'Open de app op 20 dagen in januari.' },
  '2027-02': { naam: 'Februari-fundament', kort: 'FEB', meet: 'coreSessies', doel: 8, lid: true, uitleg: 'Doe 8 Core-sessies in februari.', gratis: { meet: 'coach', doel: 3, uitleg: 'Stel 3 vragen aan je coach in februari.' } },
  '2027-03': { naam: 'Voorjaarsklassieker', kort: 'MRT', meet: 'groepsritten', doel: 2, uitleg: 'Plan 2 groepsritten in maart en neem je maten mee.' }
};
const MND = ['JAN', 'FEB', 'MRT', 'APR', 'MEI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];
const MAAND_NAAM = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
// Valt een maand buiten de lijst, dan is er altijd deze: voor iedereen te halen.
export function maandUitdaging(sleutel) {
  if (MAANDUITDAGINGEN[sleutel]) return { sleutel, ...MAANDUITDAGINGEN[sleutel] };
  const m = Number(String(sleutel).slice(5, 7)) - 1;
  return { sleutel, naam: 'Maandvolhouder ' + MAAND_NAAM[m], kort: MND[m] || 'MND', meet: 'appDagen', doel: 15, uitleg: `Open de app op 15 dagen in ${MAAND_NAAM[m]}.` };
}
