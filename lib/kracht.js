// lib/kracht.js
// Krachttraining in de MKC-app (14-10-2026, op verzoek van Michel).
// Anders dan Core: Core is thuis, 10 tot 20 minuten, 2 tot 4 keer per week, zonder gewichten.
// Kracht is in de sportschool (of thuis met dumbbells), 2 keer per week ongeveer een uur, met gewichten.
// Het werkt het best naast ongeveer 2 keer per week een uur fietsen.
//
// Opbouw: 12 weken in 4 fases, daarna doorlopend in blokken (fase 2 tot 4 opnieuw, zwaarder).
// Elke week twee sessies, A en B. Een week is rond als A en B allebei gedaan zijn.
// Progressie: haal je bij alle sets de bovenkant van de herhalingen, dan gaat het gewicht de
// volgende keer omhoog. Bij een nieuwe fase (minder herhalingen) rekent de app een startgewicht voor.

export const KR_OEFENINGEN = {
  goblet: { naam: 'Goblet squat', spier: 'Bovenbenen en bilspieren', stap: 2, cue: ['Houd een dumbbell of kettlebell tegen je borst.', 'Zak met je billen naar achter en omlaag tot je dijen horizontaal zijn.', 'Knieën in de lijn van je tenen, borst omhoog, duw krachtig op.'] },
  squat: { naam: 'Squat met stang', spier: 'Bovenbenen en bilspieren', stap: 2.5, thuis: 'goblet', cue: ['Stang op je bovenrug, voeten op schouderbreedte.', 'Zak gecontroleerd tot je dijen horizontaal zijn.', 'Romp vast, duw explosief omhoog vanuit je hele voet.'] },
  rdl: { naam: 'Roemeense deadlift', spier: 'Hamstrings, bilspieren en onderrug', stap: 2.5, cue: ['Stang of dumbbells voor je dijen, knieën licht gebogen.', 'Schuif je heupen naar achter tot je een rek voelt in je hamstrings.', 'Rug recht, kom omhoog door je heupen naar voren te duwen.'] },
  split: { naam: 'Bulgaarse split squat', spier: 'Bovenbenen en bilspieren, per been', stap: 2, perKant: true, cue: ['Achterste voet op een bank, dumbbells in je handen.', 'Zak recht omlaag tot je voorste dij horizontaal is.', 'Duw op via je voorste hiel. Dit is het fietsbeen: één been tegelijk.'] },
  hipthrust: { naam: 'Hip thrust', spier: 'Bilspieren', stap: 2.5, cue: ['Bovenrug tegen een bank, stang of dumbbell op je heupen.', 'Duw je heupen omhoog tot je lijf een rechte plank is.', 'Knijp je billen boven even aan, zak gecontroleerd.'] },
  trapbar: { naam: 'Trap bar deadlift', spier: 'Benen, bilspieren en rug', stap: 2.5, thuis: 'dbdeadlift', cue: ['Ga in de trap bar staan, handen naast je.', 'Heupen omlaag, borst omhoog, rug recht.', 'Duw de vloer weg en kom rechtop. Langzaam terug.'] },
  dbdeadlift: { naam: 'Deadlift met dumbbells', spier: 'Benen, bilspieren en rug', stap: 2, cue: ['Dumbbells naast je voeten.', 'Heupen omlaag, borst omhoog, rug recht.', 'Duw de vloer weg en kom rechtop.'] },
  stepup: { naam: 'Step-up', spier: 'Bovenbenen en bilspieren, per been', stap: 2, perKant: true, cue: ['Stap met één voet op een bank of kist op kniehoogte.', 'Duw jezelf omhoog met dat been, niet afzetten met je achterste voet.', 'Gecontroleerd terug. Lijkt op een krachtige pedaalslag.'] },
  eenbeen: { naam: 'Eenbenige deadlift', spier: 'Hamstrings, bilspieren en balans, per been', stap: 2, perKant: true, cue: ['Dumbbell in de hand aan de kant van het been dat je naar achter strekt.', 'Kantel voorover op één been, achterste been gestrekt naar achter.', 'Heupen recht houden, terug via je bilspier.'] },
  roei: { naam: 'Eenarmig roeien', spier: 'Rug en schouders, per arm', stap: 2, perKant: true, cue: ['Hand en knie op een bank, dumbbell in je andere hand.', 'Trek de dumbbell naar je heup, elleboog langs je lijf.', 'Rug plat. Dit houdt je sterk en stil op het stuur.'] },
  pallof: { naam: 'Pallof press', spier: 'Romp, tegen draaien in, per kant', stap: 1, perKant: true, cue: ['Elastiek of kabel op borsthoogte naast je.', 'Duw je handen recht naar voren en houd 2 tellen vast.', 'Laat je romp niet meedraaien.'] },
  deadbug: { naam: 'Dead bug met gewicht', spier: 'Romp', stap: 1, cue: ['Op je rug, armen omhoog met een lichte dumbbell, knieën 90 graden.', 'Strek tegelijk een arm en het andere been uit, onderrug blijft op de grond.', 'Rustig terug, wissel af.'] },
  heupbuig: { naam: 'Heupbuigen staand', spier: 'Heupbuigers, per been', stap: 1, perKant: true, cue: ['Kabel of elastiek laag aan je enkel, gezicht van het apparaat af.', 'Trek je knie omhoog tot je dij horizontaal is, zoals de opgaande pedaal.', 'Romp rechtop, rustig terug.'] },
  kuit: { naam: 'Kuitheffen', spier: 'Kuiten', stap: 2, cue: ['Voorvoeten op een verhoging, dumbbell in je hand.', 'Kom zo hoog mogelijk op je tenen.', 'Langzaam zakken tot onder de verhoging.'] },
  boxjump: { naam: 'Box jump', spier: 'Explosieve kracht', stap: 0, gewichtloos: true, cue: ['Ga voor een stevige kist staan.', 'Spring met twee benen explosief op de kist, land zacht.', 'Stap rustig af. Kwaliteit boven aantal.'] }
};

// Fases: sets, herhalingen (laag-hoog), rust in seconden, en hoe zwaar het moet voelen.
export const KR_FASES = [
  { nr: 1, naam: 'Wennen', van: 1, tot: 2, sets: 2, laag: 10, hoog: 12, rust: 75, voel: 'Kies een gewicht waarbij je na elke set nog 3 herhalingen over hebt. Techniek eerst. Omhoog zo snel als je kunt, rustig terug.' },
  { nr: 2, naam: 'Opbouw', van: 3, tot: 6, sets: 3, laag: 8, hoog: 10, rust: 90, voel: 'Na elke set heb je nog 2 herhalingen over. Omhoog zo snel als je kunt, rustig terug.' },
  { nr: 3, naam: 'Kracht', van: 7, tot: 9, sets: 4, laag: 5, hoog: 6, rust: 150, voel: 'Zwaar: na elke set nog 1 tot 2 herhalingen over, nooit tot je niet meer kunt. Omhoog zo snel als je kunt. Neem je rust echt.' },
  { nr: 4, naam: 'Snelkracht', van: 10, tot: 12, sets: 3, laag: 4, hoog: 6, rust: 120, voel: 'Zwaar, maar elke herhaling explosief omhoog en rustig terug. Dit vertaal je naar de fiets.' }
];
// 2. Seizoen (Rønnestad 2010, Rønnestad en Mujika 2023): 1 sessie per week houdt je winst vast.
export const KR_ONDERHOUD = { nr: 5, naam: 'Seizoen', sets: 3, laag: 4, hoog: 6, rust: 120, voel: 'Eén sessie per week houdt je kracht vast in het seizoen. Zwaar, met nog 2 herhalingen over, omhoog zo snel als je kunt. Niet de dag voor een wedstrijd of je zwaarste rit.' };
// Kalenderweek als sleutel voor de seizoenssessie (1 per week).
export function kalWeek(nu = new Date()) { const t = new Date(Date.UTC(nu.getFullYear(), nu.getMonth(), nu.getDate())); const dag = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dag); const jan = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return 's' + t.getUTCFullYear() + '-' + Math.ceil(((t - jan) / 864e5 + 1) / 7); }
export function inSeizoen(s, nu = new Date()) { if (s && s.modus === 'seizoen') return true; if (s && s.modus === 'opbouw') return false; const m = nu.getMonth(); return m >= 3 && m <= 8; }
// Bijzaak-oefeningen (romp, kuiten) blijven bij hogere herhalingen.
const BIJZAAK = new Set(['pallof', 'deadbug', 'kuit', 'heupbuig']);

const SESSIES = {
  A: (f) => [f.nr === 1 ? 'goblet' : 'squat', 'rdl', 'split', 'hipthrust', 'pallof'].concat(f.nr === 4 ? ['boxjump'] : []),
  B: (f) => ['trapbar', 'stepup', 'eenbeen', 'heupbuig', 'roei', 'deadbug', 'kuit'],
  O: () => ['squat', 'stepup', 'rdl', 'heupbuig', 'kuit']
};
export const KR_SESSIENAAM = { A: 'Squat en bilspieren', B: 'Deadlift en één been', O: 'Onderhoud in het seizoen' };

export function krFase(week) {
  if (week <= 12) return KR_FASES.find((f) => week >= f.van && week <= f.tot);
  // Na 12 weken: blokken van 9 weken met fase 2, 3 en 4 opnieuw.
  const i = Math.floor(((week - 13) % 9) / 3);
  return KR_FASES[1 + i];
}
export function krBlok(week) { return week <= 12 ? 1 : 2 + Math.floor((week - 13) / 9); }

function vorigeFase(week) { return week > 1 ? krFase(week - 1) : null; }

// Voorgesteld gewicht voor een oefening deze sessie.
function voorstel(id, f, laatste, week) {
  const o = KR_OEFENINGEN[id];
  if (o.gewichtloos) return null;
  const l = laatste && laatste[id];
  if (!l || !l.kg) return null; // eerste keer: zelf kiezen
  const vf = l.fase ? KR_FASES.find((x) => x.nr === l.fase) : vorigeFase(week);
  if (vf && vf.nr !== f.nr && !BIJZAAK.has(id)) {
    // Andere fase: minder herhalingen = zwaarder. Ruwe vuistregel per 2 herhalingen minder ongeveer 5% erbij.
    const factor = 1 + Math.max(0, (vf.hoog - f.hoog)) * 0.025;
    return rondAf(l.kg * factor, o.stap);
  }
  const top = BIJZAAK.has(id) ? 15 : f.hoog;
  const gehaald = Array.isArray(l.reps) && l.reps.length >= (l.sets || 1) && l.reps.every((r) => Number(r) >= top);
  return gehaald ? rondAf(l.kg + o.stap, o.stap) : l.kg;
}
function rondAf(kg, stap) { const s = stap || 1; return Math.round(kg / s) * s; }

// Wat de app laat zien. s = { start, ervaring, waar, week, gedaan: [{sessie, week, op}], laatste: {id: {kg, reps, sets, fase}} }
export function krachtBeeld(s) {
  if (!s || !s.start) return null;
  const seizoen = inSeizoen(s), week = Math.max(1, Number(s.week) || 1), f = seizoen ? KR_ONDERHOUD : krFase(week);
  const dezeWeek = (s.gedaan || []).filter((g) => g.week === (seizoen ? kalWeek() : week)).map((g) => g.sessie);
  const letter = seizoen ? (dezeWeek.length ? null : 'O') : !dezeWeek.includes('A') ? 'A' : !dezeWeek.includes('B') ? 'B' : null;
  const sessie = (L) => {
    const ids = SESSIES[L](f).map((id) => (s.waar === 'thuis' && KR_OEFENINGEN[id].thuis) ? KR_OEFENINGEN[id].thuis : id);
    const oef = ids.map((id) => {
      const o = KR_OEFENINGEN[id], bij = BIJZAAK.has(id);
      const sets = o.gewichtloos ? 3 : bij ? 2 : f.sets;
      const laag = o.gewichtloos ? 4 : bij ? 10 : f.laag, hoog = o.gewichtloos ? 5 : bij ? 15 : f.hoog;
      return { id, naam: o.naam, spier: o.spier, cue: o.cue, perKant: !!o.perKant, gewichtloos: !!o.gewichtloos, sets, laag, hoog, rust: bij ? 45 : o.gewichtloos ? 90 : f.rust, kg: voorstel(id, f, s.laatste, week), vorige: s.laatste && s.laatste[id] ? s.laatste[id] : null };
    });
    // Duur: per set ongeveer 45 s werk + rust, plus 10 min warming-up.
    const sec = oef.reduce((t, o) => t + o.sets * (o.perKant ? 2 : 1) * 45 + o.sets * o.rust, 0) + 600;
    return { letter: L, naam: KR_SESSIENAAM[L], oefeningen: oef, minuten: Math.round(sec / 300) * 5 };
  };
  return {
    week, blok: krBlok(week), fase: f.nr, faseNaam: f.naam, voel: f.voel, ervaring: s.ervaring, waar: s.waar, seizoen, modus: s.modus || 'auto', perWeek: seizoen ? 1 : 2,
    gedaanDezeWeek: dezeWeek, weekRond: !letter, volgende: letter ? sessie(letter) : null,
    sessies: seizoen ? { O: sessie('O') } : { A: sessie('A'), B: sessie('B') }, totaal: (s.gedaan || []).length,
    laatsteKeer: (s.gedaan || []).slice(-1)[0] || null
  };
}

// Sessie opslaan. log = { sessie: 'A', oef: { id: [{kg, reps}, ...] } }. Geeft de nieuwe staat terug.
export function krachtLog(s, log) {
  const seizoen = inSeizoen(s), week = Math.max(1, Number(s.week) || 1), f = seizoen ? KR_ONDERHOUD : krFase(week);
  const L = log && (['A', 'B', 'O'].includes(log.sessie) ? log.sessie : null);
  if (!L) throw new Error('welke sessie?');
  s.gedaan = s.gedaan || []; s.laatste = s.laatste || {};
  if (s.gedaan.some((g) => g.week === (seizoen ? kalWeek() : week) && g.sessie === L)) throw new Error('deze sessie is deze week al gedaan');
  for (const [id, sets] of Object.entries((log && log.oef) || {})) {
    if (!KR_OEFENINGEN[id] || !Array.isArray(sets) || !sets.length) continue;
    const schoon = sets.slice(0, 6).map((x) => ({ kg: Math.max(0, Math.min(400, Number(x.kg) || 0)), reps: Math.max(0, Math.min(50, Math.round(Number(x.reps) || 0))) })).filter((x) => x.reps > 0);
    if (!schoon.length) continue;
    s.laatste[id] = { kg: Math.max(...schoon.map((x) => x.kg)), reps: schoon.map((x) => x.reps), sets: schoon.length, fase: f.nr, op: new Date().toISOString() };
  }
  s.gedaan.push({ sessie: L, week, op: new Date().toISOString() });
  s.gedaan = s.gedaan.slice(-120);
  // Week rond (A en B gedaan): door naar de volgende week.
  const dezeWeek = s.gedaan.filter((g) => g.week === week).map((g) => g.sessie);
  // In het seizoen telt de week niet door: je opbouw blijft staan voor de winter.
  if (seizoen) { s.onderhoud = (s.onderhoud || 0) + 1; s.gedaan[s.gedaan.length - 1].week = kalWeek(); }
  else if (dezeWeek.includes('A') && dezeWeek.includes('B')) s.week = week + 1;
  return s;
}

// Korte regel voor de coach.
export function krachtContext(b) {
  if (!b) return 'Kracht (sportschool): niet gestart.';
  if (b.seizoen) return `Kracht in de MKC-app: seizoensstand, 1 onderhoudssessie per week (squat, step-up, Roemeense deadlift, heupbuigen, kuit), zwaar en snel omhoog. Adviseer: niet de dag voor een wedstrijd of zijn zwaarste rit.`;
  return `Kracht in de sportschool (MKC-app): week ${b.week}, fase ${b.faseNaam}${b.blok > 1 ? ', blok ' + b.blok : ''}, ${b.gedaanDezeWeek.length} van 2 sessies deze week, ${b.totaal} sessies totaal, traint ${b.waar === 'thuis' ? 'thuis met dumbbells' : 'in de sportschool'}. Adviseer: krachtsessies niet de dag voor zijn zwaarste fietstraining, liefst op een dag met een rustige rit of geen rit, en geen Core op een zware beendag.`;
}
