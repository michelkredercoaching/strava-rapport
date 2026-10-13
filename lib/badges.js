// /lib/badges.js
// Je palmares in de MKC-app. ÉÉN bron van waarheid voor badges en beloningen.
//
// Versie 2 (13-10-2026): elke badge heeft drie niveaus, brons, zilver en goud.
// Elk behaald niveau is een medaille; het totaal aantal medailles ontgrendelt
// beloningen (BELONINGEN). 18 badges x 3 = 54 medailles, dus er valt lang wat te halen.
//
// De server (api/app.js) rekent alles uit met eigen gegevens, nooit met wat de
// app zelf opgeeft:
//   - Core: sessies, niveaus, Rompscore en reeks uit het Core-dossier
//   - Rijden: levenslange tellers in app:teller:<email> (ritten 1x per dag,
//     beoordeeld, vroeg) en het weer dat de SERVER ophaalt bij "Ik rijd hiermee"
//   - Groepsrit: geplande ritten en het hoogste aantal meerijders
//   - Finishes (doel afgerond), maten (betaald lid via jouw link), coachvragen,
//     Strava-analyses (geteld bij de betaling)
// Behaalde niveaus blijven staan, met datum, in app:medailles:<email>.

export const NIVEAUS = ['brons', 'zilver', 'goud'];

export const BADGES = [
  // Core-app
  { id: 'stalen-romp', groep: 'Core', naam: 'Stalen romp', icoon: 'core', eenheid: ['Core-sessie', 'Core-sessies'], drempels: [5, 25, 50], van: (s) => s.coreSessies },
  { id: 'niveau', groep: 'Core', naam: 'Niveau omhoog', icoon: 'omhoog', eenheid: ['niveau afgerond', 'niveaus afgerond'], drempels: [1, 3, 6], van: (s) => s.coreNiveaus },
  { id: 'sterker', groep: 'Core', naam: 'Sterker gemeten', icoon: 'grafiek', eenheid: ['punt Rompscore erbij', 'punten Rompscore erbij'], drempels: [5, 10, 20], van: (s) => Math.max(0, s.rompPlus || 0) },
  { id: 'volhouder', groep: 'Core', naam: 'Volhouder', icoon: 'vlam', eenheid: ['week op rij', 'weken op rij'], drempels: [4, 8, 12], van: (s) => s.reeks },
  // Elke dag de app open (beste reeks ooit, dus een gemiste dag kost je geen medaille)
  { id: 'dagelijkse-kost', groep: 'Elke dag', naam: 'Dagelijkse kost', icoon: 'kalender', eenheid: ['dag op rij de app geopend', 'dagen op rij de app geopend'], drempels: [7, 14, 21], van: (s) => s.openMax },
  { id: 'gewoontedier', groep: 'Elke dag', naam: 'Gewoontedier', icoon: 'kalender', eenheid: ['dag op rij de app geopend', 'dagen op rij de app geopend'], drempels: [42, 84, 182], van: (s) => s.openMax },
  // Rijden
  { id: 'vaste-rijder', groep: 'Rijden', naam: 'Vaste rijder', icoon: 'fiets', eenheid: ['rit voorbereid', 'ritten voorbereid'], drempels: [3, 25, 100], van: (s) => s.ritten },
  { id: 'fijnproever', groep: 'Rijden', naam: 'Fijnproever', icoon: 'vink', eenheid: ['rit nagekeken', 'ritten nagekeken'], drempels: [3, 10, 25], van: (s) => s.beoordeeld },
  { id: 'winterrijder', groep: 'Rijden', naam: 'Winterrijder', icoon: 'sneeuw', eenheid: ['rit onder 5 graden', 'ritten onder 5 graden'], drempels: [1, 5, 15], van: (s) => s.winter },
  { id: 'regenvreter', groep: 'Rijden', naam: 'Regenvreter', icoon: 'regen', eenheid: ['rit in regen of op nat wegdek', 'ritten in regen of op nat wegdek'], drempels: [1, 5, 15], van: (s) => s.regen },
  { id: 'vroege-vogel', groep: 'Rijden', naam: 'Vroege vogel', icoon: 'zon', eenheid: ['rit voor 7 uur', 'ritten voor 7 uur'], drempels: [1, 5, 15], van: (s) => s.vroeg },
  // Groepsrit
  { id: 'clubkapitein', groep: 'Groepsrit', naam: 'Clubkapitein', icoon: 'groep', eenheid: ['groepsrit gepland', 'groepsritten gepland'], drempels: [1, 5, 10], van: (s) => s.groepsritten },
  { id: 'groepsmagneet', groep: 'Groepsrit', naam: 'Groepsmagneet', icoon: 'magneet', eenheid: ['meerijder in één rit', 'meerijders in één rit'], drempels: [3, 5, 10], van: (s) => s.groepMeeMax },
  // Doel
  { id: 'finisher', groep: 'Doel', naam: 'Finisher', icoon: 'vlag', eenheid: ['tocht of wedstrijd uitgereden', 'tochten of wedstrijden uitgereden'], drempels: [1, 2, 3], van: (s) => s.finishes },
  // Maten
  { id: 'ploegbouwer', groep: 'Maten', naam: 'Ploegbouwer', icoon: 'maten', eenheid: ['maat lid geworden', 'maten lid geworden'], drempels: [1, 5, 10], van: (s) => s.maten },
  // Kennis
  { id: 'leergierig', groep: 'Kennis', naam: 'Leergierig', icoon: 'vraag', eenheid: ['coachvraag', 'coachvragen'], drempels: [3, 15, 30], van: (s) => s.coach },
  { id: 'gemeten', groep: 'Kennis', naam: 'Gemeten', icoon: 'meten', eenheid: ['Strava-analyse', 'Strava-analyses'], drempels: [1, 2, 3], van: (s) => s.analyses },
  // Pacingplan: de volgende stap na je analyse. Binnenkort te koop; telt dan via de teller pacingplannen.
  { id: 'op-schema', groep: 'Kennis', naam: 'Op schema', icoon: 'pacing', binnenkort: true, eenheid: ['pacingplan', 'pacingplannen'], drempels: [1, 2, 3], van: (s) => s.pacingplannen }
];

// Beloningen bij het totaal aantal medailles (besluit Michel 13-10-2026).
// soort bepaalt wat de server regelt; zie badgesBijwerken in api/app.js.
export const BELONINGEN = [
  { n: 5, id: 'm5', titel: 'Michel-sessie', kort: 'Een extra Core-sessie van Michel, plus 2 extra gratis coachvragen als je nog geen lid bent.' },
  { n: 10, id: 'm10', titel: 'Herstelsessie van Michel', kort: 'Een extra sessie van Michel voor na een lange rit, plus €5 korting op je eerste lidmaatschap als je nog geen lid bent.' },
  { n: 15, id: 'm15', titel: 'Gratis Strava-analyse', kort: 'Een Strava-analyse cadeau: zie waar je nu staat.' }
];
export const MAX_MEDAILLES = BADGES.length * 3;

const tekst = (b, n) => `${n} ${n === 1 ? b.eenheid[0] : b.eenheid[1]}`;

// stand: de getallen (s.coreSessies, s.ritten, ...). verdiend: { id: { 1: iso, 2: iso, 3: iso } }.
export function badgeOverzicht(stand = {}, verdiend = {}) {
  return BADGES.map((b) => {
    const waarde = Number(b.van(stand)) || 0;
    const v = verdiend[b.id] && typeof verdiend[b.id] === 'object' ? verdiend[b.id] : {};
    let niveau = 0;
    b.drempels.forEach((d, i) => { if (waarde >= d || v[i + 1]) niveau = i + 1; });
    const volgende = niveau < 3 ? b.drempels[niveau] : null;
    return {
      id: b.id, groep: b.groep, naam: b.naam, icoon: b.icoon, binnenkort: !!b.binnenkort && !niveau, niveau, waarde,
      drempels: b.drempels, volgende, op: { 1: v[1] || null, 2: v[2] || null, 3: v[3] || null },
      uitleg: b.drempels.map((d) => tekst(b, d)),
      nog: volgende != null ? `Nog ${volgende - Math.min(waarde, volgende)} tot ${NIVEAUS[niveau]}: ${tekst(b, volgende)}` : 'Goud gehaald'
    };
  });
}
export const medailleTotaal = (lijst) => lijst.reduce((t, b) => t + b.niveau, 0);
