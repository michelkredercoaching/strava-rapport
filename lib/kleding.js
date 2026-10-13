// /lib/kleding.js
// Kledingadvies voor de MKC-app. ÉÉN bron van waarheid: de app (app.html, als
// module geladen) en het ochtendbericht (api/app.js) rekenen hiermee.
//
// Versie 2 (09-10-2026): opgebouwd uit Michels eigen antwoorden op de
// kledingvragenlijst (K1 t/m K33), per lichaamsdeel in plaats van vaste banden.
// Belangrijkste regels van Michel:
//   - wind verandert de kleding nauwelijks; neem dan wel een regenjas mee (K3)
//   - regen is geen "paar graden kouder" maar andere kleding: Gore-Tex jas,
//     neopreen handschoenen en overschoenen, petje, en onder 10 graden een muts (K2, K5)
//   - aanhoudende regen Gore-Tex, een buitje windvest (K27)
//   - neopreen handschoenen bij regen onder 12 graden (K21), winterhandschoenen onder 7 (K22)
//   - overschoenen vanaf 10 graden en kouder; neopreen bij regen, winddicht als het droog is (K23, K24)
//   - petje onder 12 graden of bij regen (K25), muts onder 7 graden (K26)
//   - de eerste 10 minuten koud geldt niet bij regen (K31)
//   - snel koud = 2 graden opschuiven (K30); hard rijden scheelt ongeveer 2 graden (K15)
//   - onder 0 graden niet buiten (K13); 5 graden en regen liever binnen iets korter (K11)
//   - altijd mee: telefoon, pas of geld, een reep of gel (K32)
//   - koude dagen een regenjas mee, ook droog: voor als je lek rijdt of moet stoppen (K12)
//   - materialen noemen mag, en een tip zoals Decathlon voor neopreen handschoenen (K33)
// Versie 3 (13-10-2026): nat wegdek zonder regen telt nu mee (spatwater van je
// wielen: natte voeten, rug en knieën), plus bril, en het advies komt per
// lichaamsdeel terug (groepen) met de achterzak als eigen lijst.
// Wijzig je de indeling, doe het hier.

const r = (x) => Math.round(x);

// invoer:
//   temp        laagste temperatuur tijdens de rit (graden)
//   start       temperatuur bij vertrek (voor "het koelt af"-tip), optioneel
//   wind        hoogste wind tijdens de rit in km/u
//   regen       true als het regent of gaat regenen tijdens de rit
//   nat         true als het wegdek nat is (ook als het droog is uit de lucht)
//   regenMm     totale regen tijdens de rit in mm (optioneel; bepaalt Gore-Tex of windvest)
//   intensiteit 'rustig' of 'hard'
//   kouType     'koud' (snel koud), 'normaal' of 'warm' (snel warm)
//   bijstel     persoonlijke bijsturing in graden uit eerdere ritten (+ = warmer kleden)
//   duurUur     duur van de rit in uren
export function kledingAdvies({ temp, start = null, wind = 0, regen = false, nat = false, regenMm = null, intensiteit = 'rustig', kouType = 'normaal', bijstel = 0, duurUur = 2 } = {}) {
  if (temp == null || !isFinite(temp)) return null;
  const redenen = [];
  let t = temp;
  if (intensiteit === 'hard') { t += 2; redenen.push('je rijdt hard, dus iets lichter'); }
  if (kouType === 'koud') { t -= 2; redenen.push('je hebt het snel koud'); }
  if (kouType === 'warm') { t += 2; redenen.push('je hebt het snel warm'); }
  if (wind >= 35) { t -= 1; redenen.push('harde wind'); }
  if (bijstel) { t -= bijstel; redenen.push(bijstel > 0 ? 'je vorige ritten waren aan de koude kant' : 'je vorige ritten waren aan de warme kant'); }
  if (regen) redenen.push('regen');
  const spat = nat && !regen; // nat wegdek, droog uit de lucht
  if (spat) redenen.push('nat wegdek, dus spatwater');
  const lang = duurUur >= 4;
  const zwareRegen = regen && (regenMm == null || regenMm >= 1.5);

  // Te koud of te glad: niet buiten.
  if (temp < 0) {
    return { gevoel: r(t), band: 'onder 0 graden', items: [], binnen: true,
      tips: ['Onder 0 graden rijd ik zelf niet buiten: kans op gladheid. Pak de trainer en rijd binnen iets korter.'], redenen,
      regel: 'Liever binnen een goede training dan buiten een valpartij.' };
  }

  const boven = [], onder = [], handen = [], voeten = [], hoofd = [], mee = [];

  // Bovenlijf
  if (regen && t < 16) {
    if (t < 7) boven.push('Thermo-ondershirt met lange mouwen', 'Winterjack');
    else if (t >= 12) boven.push('Ondershirt met korte mouwen', 'Korte trui', 'Armstukken');
    else boven.push('Ondershirt met korte mouwen');
    boven.push(zwareRegen ? 'Waterdichte regenjas (Gore-Tex)' : 'Windvest');
  } else if (t >= 25) boven.push('Korte trui');
  else if (t >= 20) boven.push('Mouwloos ondershirt', 'Korte trui');
  else if (t >= 12) boven.push(spat ? 'Ondershirt met korte mouwen' : 'Mouwloos ondershirt', 'Korte trui', 'Armstukken');
  else if (t >= 9) boven.push('Ondershirt met korte mouwen', 'Dunne lange trui', 'Windvest');
  else if (t >= 7) boven.push('Mouwloos ondershirt', 'Winddichte lange trui');
  else boven.push('Thermo-ondershirt met lange mouwen', 'Winterjack');

  if (spat && t < 18 && !boven.includes('Windvest') && !boven.includes('Winterjack')) boven.push('Windvest (houdt het spatwater van je rug)');

  // Benen
  if (t >= 16) onder.push('Korte broek');
  else if (t >= 13 && !regen && !spat) onder.push('Korte broek met kniestukken');
  else if (t >= 11 && spat) onder.push('Korte broek met kniestukken (natte knieën koelen snel af)');
  else if (t >= 7) onder.push('Korte broek met beenstukken');
  else onder.push('Thermobroek');

  // Handen
  let neopreenHand = false;
  if (regen && t < 12) { handen.push('Neopreen handschoenen'); neopreenHand = true; }
  else if (t < 7 || (lang && t < 9)) handen.push('Winterhandschoenen');
  else if (t < 13) handen.push('Dunne lange handschoenen');
  else if (t < 18) handen.push('Zomerhandschoenen');

  // Voeten
  voeten.push(t < 7 ? 'Wollen sokken' : 'Zomersokken');
  if (regen && t < 12) voeten.push('Neopreen overschoenen');
  else if (regen && t < 17) voeten.push('Teenkapjes');
  else if (spat && t < 12) voeten.push('Neopreen overschoenen (natte voeten worden snel koud)');
  else if (spat && t < 18) voeten.push('Teenkapjes (tegen spatwater op je schoenen)');
  else if (t < 8 || (lang && t < 10)) voeten.push('Neopreen overschoenen');
  else if (t <= 10) voeten.push('Winddichte overschoenen');

  // Hoofd
  const muts = t < 7 || (regen && t <= 10);
  if (muts) hoofd.push('Muts onder je helm');
  else if (t < 12 || ((regen || spat) && t < 16)) hoofd.push('Petje onder je helm' + (spat ? ' (de klep houdt spatwater uit je ogen)' : ''));
  if (!muts && t <= 10) hoofd.push('Hoofdband of oorwarmer');
  if (t <= 6 || (lang && t < 9)) hoofd.push('Buff of nekwarmer');
  hoofd.push(regen || spat ? 'Fietsbril met heldere glazen' : t >= 15 ? 'Zonnebril' : 'Fietsbril');

  // Achterzak
  if (!regen && t >= 9 && t < 20 && !boven.some((x) => x.startsWith('Windvest'))) mee.push('een windvest');
  if (!regen && (t <= 6 || (wind >= 30 && t < 15))) mee.push('een regenjas, voor als je lek rijdt, moet stoppen of het gaat regenen');
  if (lang && t < 10) { if (!mee.some((x) => x.startsWith('een regenjas'))) mee.push('een regenjas'); mee.push('extra handschoenen'); }
  if (regen && lang) mee.push('droge handschoenen in een zakje');
  mee.push('je telefoon, een pas of wat geld', 'een reep of gel');

  const items = [...boven, ...onder, ...handen, ...voeten, ...hoofd];
  const groepen = [['Bovenlijf', boven], ['Benen', onder], ['Handen', handen], ['Voeten', voeten], ['Hoofd', hoofd]].filter((g) => g[1].length).map(([kop, l]) => ({ kop, items: l }));
  const meeLijst = mee.map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const tips = [];
  if (regen && temp <= 6) tips.push('Bij kou en regen kies ik zelf liever binnen iets korter, en ga ik naar buiten als het weer mooi is.');
  if (t >= 22) tips.push('Smeer je armen, benen en nek in, en zet je bril op. Een dun fietspetje onder je helm houdt de zon uit je nek.');
  if (spat) tips.push('Nat wegdek zonder spatborden geeft een natte rug en natte voeten. Een klik-spatbordje onder je zadel scheelt al veel.');
  if (spat || regen) tips.push('In de groep niet recht achter iemands achterwiel rijden, dan krijg je zijn spatwater in je gezicht. Schuif iets op.');
  if (start != null && start - temp >= 3) tips.push(`Het koelt af tijdens je rit (van ${r(start)} naar ${r(temp)} graden): neem iets mee voor de terugweg.`);
  if (neopreenHand) tips.push('Neopreen handschoenen hoeven niet duur te zijn, kijk bijvoorbeeld eens bij Decathlon.');
  if (duurUur >= 2.5 && t < 12 && !regen) tips.push('Lange afdaling of de laatste kilometers? Doe je windvest of een krant over je borst.');

  return {
    gevoel: r(t),
    band: regen ? `${r(temp)} graden en regen` : `${r(temp)} graden`,
    items,
    groepen,
    mee: meeLijst,
    tips: tips.slice(0, 4),
    redenen,
    regel: regen
      ? 'Bij regen mag je wel meteen warm vertrekken: nat en koud worden gaat sneller dan je denkt.'
      : t >= 18
        ? 'Bij dit weer gaat het om koel blijven: licht en luchtig aan, rits open op de klim en drink meer dan je denkt.'
        : 'De eerste tien minuten hoor je het een beetje koud te hebben. Lekker warm bij vertrek is te veel aan.',
  };
}

// Persoonlijke bijsturing uit eerdere ritten: "te koud" = volgende keer
// warmer kleden, "te warm" = lichter. Laatste 5 oordelen, max 4 graden.
export function kledingBijstel(ritten = []) {
  const l = ritten.filter((x) => x && ['koud', 'warm', 'goed'].includes(x.oordeelKleding)).slice(0, 5);
  const som = l.reduce((a, x) => a + (x.oordeelKleding === 'koud' ? 1.5 : x.oordeelKleding === 'warm' ? -1.5 : 0), 0);
  return Math.max(-4, Math.min(4, Math.round(som * 2) / 2));
}

// Korte samenvatting voor het ochtendbericht.
export function kledingKort(a) {
  if (!a) return '';
  if (a.binnen) return 'vandaag liever binnen op de trainer';
  // Ondershirts noemen we niet, die horen er altijd bij.
  return a.items.filter((x) => !/ondershirt|zomersokken/i.test(x)).slice(0, 5).map((x) => x.toLowerCase()).join(', ');
}
