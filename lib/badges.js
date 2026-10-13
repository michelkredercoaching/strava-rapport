// /lib/badges.js
// Je palmares in de MKC-app (13-10-2026): badges voor wat je echt doet.
// ÉÉN bron van waarheid voor de lijst. De server (api/app.js) rekent ze uit
// met eigen gegevens, nooit met wat de app zelf opgeeft:
//   - Core: de sessies, niveaus, Rompscore en reeks uit het Core-dossier
//   - Rijden: levenslange tellers in app:teller:<email> (ritten, beoordeeld,
//     vroeg) en het weer dat de SERVER zelf ophaalt bij "Ik rijd hiermee"
//     (winter onder 5 graden, regen of nat wegdek)
//   - Groepsrit: geplande ritten en het hoogste aantal meerijders
//   - Doel, maten (betaald lid via jouw link), coachvragen en de Strava-analyse
// Een verdiende badge blijft staan, met de datum, in app:badges:<email>.
// Nieuwe badge? Voeg hem hier toe; de app en het beheer volgen vanzelf.

export const BADGES = [
  // Core-app
  { id: 'core-1', groep: 'Core', naam: 'Eerste meters', kort: '1', uitleg: 'Je eerste Core-sessie gedaan.', van: (s) => [s.coreSessies, 1] },
  { id: 'core-10', groep: 'Core', naam: 'Op stoom', kort: '10', uitleg: 'Tien Core-sessies gedaan.', van: (s) => [s.coreSessies, 10] },
  { id: 'core-25', groep: 'Core', naam: 'Stalen romp', kort: '25', uitleg: 'Vijfentwintig Core-sessies gedaan.', van: (s) => [s.coreSessies, 25] },
  { id: 'core-50', groep: 'Core', naam: 'Romp van een prof', kort: '50', uitleg: 'Vijftig Core-sessies gedaan.', van: (s) => [s.coreSessies, 50] },
  { id: 'core-niveau', groep: 'Core', naam: 'Niveau omhoog', kort: 'N+', uitleg: 'Je eerste niveau in de Core-app afgerond.', van: (s) => [s.coreNiveaus, 1] },
  { id: 'romp-10', groep: 'Core', naam: 'Sterker gemeten', kort: '+10', uitleg: 'Je Rompscore is 10 punten hoger dan bij je starttest.', van: (s) => [Math.max(0, s.rompPlus), 10] },
  { id: 'reeks-4', groep: 'Core', naam: 'Vier weken op rij', kort: '4W', uitleg: 'Vier weken op rij je Core-sessies gedaan.', van: (s) => [s.reeks, 4] },
  { id: 'reeks-12', groep: 'Core', naam: 'Twaalf weken op rij', kort: '12W', uitleg: 'Twaalf weken op rij je Core-sessies gedaan. Dat is discipline.', van: (s) => [s.reeks, 12] },
  // Rijden
  { id: 'rit-1', groep: 'Rijden', naam: 'Eerste rit', kort: 'R1', uitleg: 'Je eerste rit voorbereid met "Ik rijd hiermee".', van: (s) => [s.ritten, 1] },
  { id: 'rit-25', groep: 'Rijden', naam: 'Vaste rijder', kort: '25', uitleg: 'Vijfentwintig ritten voorbereid in de app.', van: (s) => [s.ritten, 25] },
  { id: 'beoordeeld-10', groep: 'Rijden', naam: 'Fijnproever', kort: '10', uitleg: 'Tien ritten nagekeken op je banden en kleding. Zo wordt je advies steeds preciezer.', van: (s) => [s.beoordeeld, 10] },
  { id: 'winter', groep: 'Rijden', naam: 'Winterrijder', kort: '&lt;5&deg;', uitleg: 'Op pad bij minder dan 5 graden.', van: (s) => [s.winter, 1] },
  { id: 'regen', groep: 'Rijden', naam: 'Regenvreter', kort: 'NAT', uitleg: 'Op pad met regen of een nat wegdek.', van: (s) => [s.regen, 1] },
  { id: 'vroeg', groep: 'Rijden', naam: 'Vroege vogel', kort: '7:00', uitleg: 'Voor 7 uur in de ochtend klaar voor je rit.', van: (s) => [s.vroeg, 1] },
  // Groepsrit
  { id: 'groep-1', groep: 'Groepsrit', naam: 'Eerste groepsrit', kort: 'G1', uitleg: 'Je eerste groepsrit gepland en gedeeld.', van: (s) => [s.groepsritten, 1] },
  { id: 'groep-10', groep: 'Groepsrit', naam: 'Clubkapitein', kort: '10', uitleg: 'Tien groepsritten gepland.', van: (s) => [s.groepsritten, 10] },
  { id: 'groep-mee5', groep: 'Groepsrit', naam: 'Groepsmagneet', kort: '5+', uitleg: 'Vijf of meer renners reden mee met een rit die jij plande.', van: (s) => [s.groepMeeMax, 5] },
  // Doel
  { id: 'doel', groep: 'Doel', naam: 'Doel gezet', kort: 'D', uitleg: 'Je weet waar je voor traint.', van: (s) => [s.doel, 1] },
  { id: 'finisher', groep: 'Doel', naam: 'Finisher', kort: 'FIN', uitleg: 'Je tocht of wedstrijd zit erop.', van: (s) => [s.finisher, 1] },
  // Maten (betaald lid geworden via jouw link)
  { id: 'maat-1', groep: 'Maten', naam: 'Gangmaker', kort: '1', uitleg: 'Je eerste maat werd lid via jouw link.', van: (s) => [s.maten, 1] },
  { id: 'maat-5', groep: 'Maten', naam: 'Kopman', kort: '5', uitleg: 'Vijf maten werden lid via jouw link.', van: (s) => [s.maten, 5] },
  { id: 'maat-10', groep: 'Maten', naam: 'Ploegleider', kort: '10', uitleg: 'Tien maten werden lid via jouw link. Jij bent de motor van de groep.', van: (s) => [s.maten, 10] },
  // Kennis
  { id: 'coach-10', groep: 'Kennis', naam: 'Leergierig', kort: '?', uitleg: 'Tien vragen gesteld aan je coach.', van: (s) => [s.coach, 10] },
  { id: 'analyse', groep: 'Kennis', naam: 'Gemeten', kort: 'FTP', uitleg: 'Je Strava-analyse gedaan: je weet waar je staat.', van: (s) => [s.analyse, 1] }
];

// stand: de getallen hierboven (s.coreSessies, s.ritten, ...). verdiend: { id: ISO-datum }.
export function badgeOverzicht(stand = {}, verdiend = {}) {
  return BADGES.map((b) => {
    const [h, nodig] = b.van(stand).map((x) => Number(x) || 0);
    const op = verdiend[b.id] || null;
    const behaald = !!op || h >= nodig;
    const uitleg = b.id === 'finisher' && stand.doelNaam ? `${stand.doelNaam} zit erop.` : b.uitleg;
    return { id: b.id, groep: b.groep, naam: b.naam, kort: b.kort, uitleg, op, behaald, nu: behaald ? nodig : Math.min(h, nodig), nodig };
  });
}
