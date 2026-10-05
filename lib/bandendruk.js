// /lib/bandendruk.js
// ÉÉN bron van waarheid voor de bandenspanning. Hier rekenen drie dingen mee:
//   1. de calculator op /bandenspanning/ (via api/keuzehulp-inschrijving.js)
//   2. scripts/bandendruk.mjs, waarmee Michel persoonlijke mailtjes beantwoordt
//   3. de Bandenspanning-kaart (bandenspanning-kaart.html), waarvan de tabellen
//      met precies deze formule zijn uitgerekend
// Wijzig je hier iets, reken dan ook de kaart opnieuw uit, anders zegt de pdf
// iets anders dan de calculator.
//
// Het model (herijkt 28-09-2026): 25 mm bij een rijder van 75 kg is 5,6 voor en
// 6,2 achter. Schaalt lineair met het systeemgewicht (rijder + 10,5 kg) en met
// (25/breedte)^1,7. Voorband = achter x 0,91. Racefiets gaat uit van een
// binnenband, gravel van tubeless, net als de kaart. Gravel heeft een lagere
// ondergrens (1,3 bar i.p.v. 2,5).

export const FIETS = 10.5;          // fiets, kleding, schoenen, helm, twee bidons
const BASIS_SYSTEEM = 85.5;         // 75 kg rijder + 10,5
const BASIS_ACHTER = 6.2;           // bar, 25 mm bij dat systeemgewicht
const VOOR_RATIO = 0.91;            // voorwiel draagt minder
const EXP = 1.7;                    // (25/breedte)^EXP voor gelijke banddoorbuiging
const MAX = { 23: 8.5, 25: 8.0, 26: 7.5, 28: 7.0, 30: 6.5, 32: 6.0 };
const MIN = { weg: 2.5, gravel: 1.3 };
export const HOOKLESS_MAX = 5.0;
// Kaart: "tubeless in plaats van binnenband 0,2 tot 0,3 bar". We nemen het
// midden, zodat de calculator nooit buiten de kaart valt.
const TUBELESS_CORRECTIE = 0.25;
// Binnen deze marge noemen we het "goed". Kleiner dan wat een pompmeter
// betrouwbaar laat zien.
const MARGE = 0.15;

export const BREEDTES = {
  weg:    [23, 25, 26, 28, 30, 32],
  gravel: [35, 38, 40, 42, 45, 47, 50],
};

const r1 = (x) => Math.round(x * 10) / 10;
export const nl = (n) => r1(n).toFixed(1).replace('.', ',');
export const psi = (b) => Math.round(b * 14.5038);

// De oorspronkelijke formule, ongewijzigd: de kaart en het script rekenen hier
// al sinds september mee.
export function druk(breedte, rijderKg, type = 'weg') {
  const cap = MAX[breedte] ?? 6.0;
  const min = MIN[type] ?? MIN.weg;
  const f = Math.pow(25 / breedte, EXP) * ((rijderKg + FIETS) / BASIS_SYSTEEM);
  const achter = Math.min(Math.max(BASIS_ACHTER * f, min), cap);
  const voor = Math.min(Math.max(achter * VOOR_RATIO, min), cap);
  return {
    voor: r1(voor),
    achter: r1(achter),
    afgetopt: BASIS_ACHTER * f > cap,
    cap,
  };
}

// Pompen tonen bar of psi. Alles boven de 12 is psi, want 12 bar rijdt niemand.
export function naarBar(waarde) {
  const n = Number(String(waarde ?? '').replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  const bar = n > 12 ? n / 14.5038 : n;
  return bar >= 0.8 && bar <= 12 ? r1(bar) : null;
}

// Invoer van de pagina schoonmaken. Geeft null bij onbruikbare invoer, zodat de
// route dan gewoon de kaart mailt zonder persoonlijk advies.
export function leesInvoer(b) {
  const type = b.bandtype === 'gravel' ? 'gravel' : b.bandtype === 'weg' ? 'weg' : null;
  const gewicht = Math.round(Number(String(b.gewicht ?? '').replace(',', '.')));
  const breedte = Number(b.breedte);
  if (!type || !(gewicht >= 40 && gewicht <= 150) || !BREEDTES[type].includes(breedte)) return null;
  return {
    type,
    gewicht,
    breedte,
    tubeless: b.tubeless === 'tubeless' ? true : b.tubeless === 'binnenband' ? false : type === 'gravel',
    nuVoor: naarBar(b.nuVoor),
    nuAchter: naarBar(b.nuAchter),
  };
}

// Hoe ver boven de hookless-grens het advies mag liggen voordat we een bredere
// band aanraden. Een paar tiende is gewoon 5,0 aanhouden, dat merk je amper.
const HOOKLESS_MARGE = 0.3;

function hooklessZin(achter) {
  if (achter <= HOOKLESS_MAX) return 'Je huidige druk ligt daarboven, dus rijd je hookless, laat er dan wat uit.';
  if (achter - HOOKLESS_MAX <= HOOKLESS_MARGE + 1e-9) {
    return `Je advies ligt daar net boven. Rijd je hookless, houd dan gewoon 5,0 bar aan, dat scheelt maar ${nl(achter - HOOKLESS_MAX)} bar.`;
  }
  return 'Je advies ligt daar ruim boven. Rijd je hookless, kies dan een bredere band, zodat je met minder druk dezelfde steun hebt.';
}

// Persoonlijk advies, in dezelfde opbouw als de handmatige antwoorden
// (zie bandenspanning-antwoorden in memory): oordeel eerst, dan de eigen
// getallen, dan de tips die er voor deze renner echt toe doen.
export function bandenAdvies(inv) {
  if (!inv) return null;
  const { type, gewicht, breedte, tubeless, nuVoor, nuAchter } = inv;
  const basis = druk(breedte, gewicht, type);
  const min = MIN[type];

  // Correctie voor de bandopbouw ten opzichte van de tabel.
  let corr = 0;
  if (type === 'weg' && tubeless) corr = -TUBELESS_CORRECTIE;
  if (type === 'gravel' && !tubeless) corr = TUBELESS_CORRECTIE;
  const voor = r1(Math.min(Math.max(basis.voor + corr, min), basis.cap));
  const achter = r1(Math.min(Math.max(basis.achter + corr, min), basis.cap));

  const heeftNu = nuVoor != null && nuAchter != null;
  const dv = heeftNu ? r1(nuVoor - voor) : null;
  const da = heeftNu ? r1(nuAchter - achter) : null;

  // ---- Oordeel ----
  let status = 'onbekend';
  let oordeel;
  const verschil = (d) => `${nl(Math.abs(d))} bar te ${d > 0 ? 'hoog' : 'laag'}`;
  if (!heeftNu) {
    oordeel = `Met ${gewicht} kg op ${breedte} mm ${tubeless ? 'tubeless' : 'met binnenband'} is dit je startdruk.`;
  } else if (Math.abs(dv) <= MARGE && Math.abs(da) <= MARGE) {
    status = 'goed';
    oordeel = 'Je zit goed. Je huidige druk ligt precies waar hij moet liggen, daar hoef je niets aan te veranderen.';
  } else {
    const delen = [];
    delen.push(Math.abs(dv) <= MARGE ? 'Je voorband zit goed' : `Je voorband zit ${verschil(dv)}`);
    delen.push(Math.abs(da) <= MARGE ? 'je achterband zit goed' : `je achterband zit ${verschil(da)}`);
    const omhoog = dv > MARGE || da > MARGE;
    const omlaag = dv < -MARGE || da < -MARGE;
    status = omhoog && !omlaag ? 'te-hoog' : omlaag && !omhoog ? 'te-laag' : 'gemengd';
    oordeel = delen.join(', ') + '.';
  }

  // ---- Tips ----
  const tips = [];

  if (heeftNu && Math.abs(nuVoor - nuAchter) < 0.1 && achter - voor >= 0.3) {
    tips.push({
      kop: 'Pomp voor en achter niet even hard',
      tekst: `Je rijdt nu voor en achter dezelfde druk. Dat is de fout die ik het vaakst zie. Je achterwiel draagt meer gewicht, dus je voorband mag ${nl(achter - voor)} bar zachter. Dat geeft meer grip in de bochten en kost je niets.`,
    });
  }

  if (status === 'te-hoog' || status === 'gemengd') {
    tips.push({
      kop: 'Harder is niet sneller',
      tekst: 'Op een gewone Nederlandse weg stuitert een te harde band over elke oneffenheid. Dat kost je comfort, grip en zelfs snelheid. Ga in stapjes van 0,2 bar omlaag en rijd telkens dezelfde route, dan voel je het verschil zelf.',
    });
  }

  if (status === 'te-laag' && type === 'weg') {
    tips.push({
      kop: 'Te zacht kost je een band',
      tekst: 'Met een binnenband loop je bij te weinig druk kans op een snakebite: een lekke band door een klap op een stoeprand of gat. Pomp op naar je advies.',
    });
  }

  if (basis.afgetopt) {
    tips.push({
      kop: 'Overweeg een bredere band',
      tekst: `Op ${gewicht} kg zit je met ${breedte} mm op de maximumdruk van je band. Een bredere band geeft je dezelfde steun met minder druk, en dat rijdt comfortabeler en net zo snel.`,
    });
  }

  if (achter > HOOKLESS_MAX || (nuAchter != null && nuAchter > HOOKLESS_MAX)) {
    tips.push({
      kop: 'Hookless velg? Maximaal 5,0 bar',
      tekst: `Op een hookless velg is 5,0 bar je absolute bovengrens, wat er ook uit de berekening komt. ${hooklessZin(achter)} Weet je het niet zeker? Kijk in de binnenkant van je velg of vraag het je fietsenmaker.`,
      waarschuwing: true,
    });
  }

  // Nameten: de tip die in de praktijk het vaakst iets oplevert.
  const lijst = BREEDTES[type];
  // Minstens 2 mm breder, want dat is wat nameten in de praktijk oplevert.
  const breder = lijst.find((x) => x >= breedte + 2);
  if (breder) {
    const d = druk(breder, gewicht, type);
    const bv = r1(Math.min(Math.max(d.voor + corr, min), d.cap));
    const ba = r1(Math.min(Math.max(d.achter + corr, min), d.cap));
    tips.push({
      kop: 'Meet je band even na',
      tekst: `Een band meet op een moderne brede velg vaak 2 tot 3 mm breder dan wat er op de zijkant staat. Meet met een schuifmaat op je opgepompte band. Meet hij ${breder} mm? Dan is het ${nl(bv)} voor en ${nl(ba)} achter.`,
    });
  }

  if (type === 'weg') {
    tips.push({
      kop: 'Pas aan op het weer en de weg',
      tekst: 'Regen of nat wegdek: 0,3 bar eraf. Klinkers, kasseien of ruw asfalt: 0,5 bar eraf. Vers glad asfalt: 0,3 bar erbij.',
    });
  } else {
    tips.push({
      kop: 'Pas aan op de ondergrond',
      tekst: 'Los grind, zand of modder: 0,3 bar eraf. Vooral asfalt onderweg: 0,3 bar erbij. Bikepacking met tassen: 0,4 bar erbij.',
    });
  }

  if (type === 'gravel' && !tubeless) {
    tips.push({
      kop: 'Tubeless scheelt je druk',
      tekst: 'Met een binnenband moet je 0,2 tot 0,3 bar harder om niet door te slaan. Tubeless kun je zachter rijden, en dat geeft je op los wegdek meer grip en comfort.',
    });
  }

  return {
    type, gewicht, breedte, tubeless,
    voor, achter,
    voorPsi: psi(voor), achterPsi: psi(achter),
    nuVoor, nuAchter, dv, da,
    status, oordeel, tips,
  };
}
