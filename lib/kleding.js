// /lib/kleding.js
// Kledingadvies voor de MKC-app (07-10-2026). ÉÉN bron van waarheid: de app
// (app.html, als module geladen) en het ochtendbericht (api/app.js) rekenen
// hiermee. Gebaseerd op Michels eigen indeling uit zondagmail 5 "Kleding in
// de kou": 18+, 11-18, 7-11, 3-7 en onder 3 graden, plus zijn regels:
//   - de eerste tien minuten hoor je het koud te hebben
//   - wind en regen zijn zo vijf graden
//   - je uiteinden worden het eerst koud (handschoenen, overschoenen)
//   - neem altijd iets mee om uit te doen
//   - krant of windvest over je borst in een lange afdaling
//   - kans op opvriezing: racefiets binnen
// Wijzig je de indeling, doe het hier.

const BANDEN = [
  { vanaf: 18, naam: '18 graden en warmer', items: ['Zweethemd zonder mouwen', 'Korte broek', 'Korte trui'], mee: 'Armstukken, voor als het tegenvalt' },
  { vanaf: 11, naam: '11 tot 18 graden', items: ['Zweethemd met korte mouwen', 'Korte broek met beenstukken', 'Armstukken of een lange trui'], mee: 'Een opvouwbaar windvestje' },
  { vanaf: 7, naam: '7 tot 11 graden', items: ['Zweethemd met korte mouwen', 'Lange broek', 'Lange trui met winddichte voorkant', 'Dunne handschoenen', 'Oorwarmer'], mee: 'Een windvestje' },
  { vanaf: 3, naam: '3 tot 7 graden', items: ['Thermoshirt met lange mouwen', 'Thermobroek', 'Winterjack', 'Winterhandschoenen', 'Overschoenen', 'Muts onder je helm'], mee: null },
  { vanaf: -99, naam: 'onder 3 graden', items: ['Thermoshirt met lange mouwen', 'Thermobroek', 'Winterjack plus een extra laag op je bovenlijf', 'Winterhandschoenen', 'Overschoenen', 'Muts onder je helm'], mee: null },
];

const r = (x) => Math.round(x);

// invoer:
//   temp      laagste temperatuur tijdens de rit (graden)
//   start     temperatuur bij vertrek (voor "het koelt af"-tip), optioneel
//   wind      hoogste wind tijdens de rit in km/u
//   regen     true als het nat is of gaat regenen tijdens de rit
//   intensiteit 'rustig' of 'hard'
//   kouType   'koud' (snel koud), 'normaal' of 'warm' (snel warm)
//   bijstel   persoonlijke bijsturing in graden uit eerdere ritten (+ = warmer kleden)
//   duurUur   duur van de rit in uren
export function kledingAdvies({ temp, start = null, wind = 0, regen = false, intensiteit = 'rustig', kouType = 'normaal', bijstel = 0, duurUur = 2 } = {}) {
  if (temp == null || !isFinite(temp)) return null;
  const redenen = [];
  // Wind en regen zijn zo vijf graden.
  let gevoel = temp;
  let weer = 0;
  if (wind >= 25) weer -= wind >= 40 ? 4 : 3;
  if (regen) weer -= 3;
  weer = Math.max(weer, -5);
  if (weer) { gevoel += weer; redenen.push(`${regen && wind >= 25 ? 'wind en regen' : regen ? 'regen' : 'wind'} voelt als ${Math.abs(weer)} graden kouder`); }
  // Hard rijden maakt warmte; snel koud of warm schuift het op.
  if (intensiteit === 'hard') { gevoel += 2; redenen.push('je rijdt hard, dus iets lichter'); }
  if (kouType === 'koud') { gevoel -= 2; redenen.push('je hebt het snel koud'); }
  if (kouType === 'warm') { gevoel += 2; redenen.push('je hebt het snel warm'); }
  if (bijstel) {
    gevoel -= bijstel;
    redenen.push(bijstel > 0 ? 'je vorige ritten waren aan de koude kant' : 'je vorige ritten waren aan de warme kant');
  }
  const band = BANDEN.find((b) => gevoel >= b.vanaf);
  const items = band.items.slice();
  const tips = [];
  if (band.mee) tips.push(`Mee in je achterzak: ${band.mee.charAt(0).toLowerCase() + band.mee.slice(1)}.`);
  if (regen && gevoel < 18) tips.push('Het is nat: een regenjack of waterdicht vest houdt je kern droog.');
  if (start != null && start - temp >= 3) tips.push(`Het koelt af tijdens je rit (van ${r(start)} naar ${r(temp)} graden): neem iets mee voor de terugweg.`);
  if (duurUur >= 2.5 && gevoel < 11) tips.push('Lange rit: doe voor een lange afdaling of de laatste kilometers je windvest of een krant over je borst.');
  if (temp <= 1 && regen) tips.push('Kans op gladheid: laat de racefiets binnen en kies de trainer of een korter rondje dicht bij huis.');
  else if (gevoel < 3) tips.push('Kies een korter rondje dicht bij huis.');
  if (gevoel < 11) tips.push('Je handen en voeten worden het eerst koud: goede handschoenen en overschoenen doen meer dan nog een jas.');
  return {
    gevoel: r(gevoel),
    band: band.naam,
    items,
    tips: tips.slice(0, 3),
    redenen,
    regel: 'De eerste tien minuten hoor je het een beetje koud te hebben. Lekker warm bij vertrek is te veel aan.',
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
  // Het zweethemd noemen we niet, dat hoort er altijd bij.
  return a.items.filter((x) => !/zweethemd/i.test(x)).slice(0, 4).map((x) => x.toLowerCase()).join(', ');
}
