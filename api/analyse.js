// /api/analyse — DETERMINISTISCHE ANALYSE-ENGINE (v2, juni 2026)
//
// Vervangt de Anthropic-call volledig. Geen Strava-data verlaat de server
// (Strava API Policy sectie 5.3 compliant). Zelfde JSON-contract als de
// AI-versie, dus de frontend (toonRapport / vulUnlockPagina) blijft ongewijzigd.
//
// Hoe het werkt:
// 1. BEVINDINGEN-BIBLIOTHEEK: elke bevinding heeft een conditie op de data,
//    een prioriteit, en teksttemplates waar de echte cijfers in vallen.
// 2. De engine verzamelt alle ware bevindingen, sorteert op prioriteit en
//    bouwt daaruit alert, diagnose, kritieke bevinding, analyse en actieplan.
// 3. Lichte tekstvariatie via een hash op naam+data, zodat twee vrienden
//    die rapporten vergelijken niet woord-voor-woord hetzelfde lezen.
//
// Teksten aanpassen? Zoek het blok BEVINDINGEN en VARIANTEN hieronder —
// alles wat de klant leest staat daar, in gewone zinnen.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stravaData } = req.body;
  if (!stravaData) {
    return res.status(400).json({ error: 'Geen Strava data meegegeven' });
  }

  const {
    naam = 'sporter',
    aantalActiviteiten = 0,
    urenPerWeek = 0,
    vo2maxSessies = 0,
    gemIntensiteit = null,
    herstelScore = null,
    herstelbalans = 'matig',
    zones = [],
    duurZonePct = null,
    grijsZonePct = null,
    kwaliteitZonePct = null,
    langsteRit = 0,
    heeftVermogensmeter = false,
    ftp = null,
    maxHf = null,
    omslagpunt = null,
    maxGapDagen = 0,
  } = stravaData;

  // ===== AFGELEIDE WAARDEN =====
  const isPower = !!(heeftVermogensmeter && ftp);
  const isHr = !isPower && !!(omslagpunt && maxHf);

  // Zone-totalen: gebruik meegegeven waarden, anders berekenen uit zones[]
  let laagPct, grijsPct, kwaliteitPct;
  if (duurZonePct !== null && grijsZonePct !== null && kwaliteitZonePct !== null) {
    laagPct = duurZonePct; grijsPct = grijsZonePct; kwaliteitPct = kwaliteitZonePct;
  } else if (isPower) {
    laagPct = (zones[0] || 0) + (zones[1] || 0);
    grijsPct = (zones[2] || 0) + (zones[3] || 0);
    kwaliteitPct = (zones[4] || 0) + (zones[5] || 0);
  } else if (isHr) {
    laagPct = (zones[0] || 0) + (zones[1] || 0);
    grijsPct = zones[2] || 0;
    kwaliteitPct = (zones[3] || 0) + (zones[4] || 0);
  } else {
    laagPct = null; grijsPct = null; kwaliteitPct = null;
  }

  const rittenPerWeek = Math.round((aantalActiviteiten / 13) * 10) / 10;
  const herstelLaag = (herstelScore !== null && herstelScore < 6) || herstelbalans === 'slecht';
  const duurMax = isPower ? Math.round(ftp * 0.75) + 'W' : (isHr ? Math.round(omslagpunt * 0.85) + ' bpm' : '75% van je FTP');

  // Zone-namen per systeem (zodat de teksten kloppen voor power én hartslag)
  const Z = isPower
    ? { laag: 'Z1+Z2 (Herstel/Duur)', grijs: 'het grijze gebied (Tempo/Sweetspot)', kwaliteit: 'Z5+Z6 (FTP/VO2max)' }
    : { laag: 'Herstel/D1', grijs: 'het grijze gebied (D2)', kwaliteit: 'D3/Weerstand' };

  // Variatie-seed: deterministisch maar per sporter anders
  const seed = hashStr(naam + '|' + aantalActiviteiten + '|' + (ftp || maxHf || 0));

  // ===== BEVINDINGEN-BIBLIOTHEEK =====
  // prioriteit: lager = belangrijker. telAlsLek: telt mee in "X prestatielekken".
  const bevindingen = [];

  // 1. Groot trainingsgat
  if (maxGapDagen >= 14) {
    bevindingen.push({
      prio: 1, telAlsLek: true,
      kort: `Je grootste trainingsgat was ${maxGapDagen} dagen — dat kost 5-10% conditie en zet je supercompensatie volledig stil.`,
      html: `Je had een gat van <strong>${maxGapDagen} dagen</strong> zonder training. Elke opbouw die je daarvoor deed, lever je in zo'n periode grotendeels weer in. Consistentie is het fundament — zonder dat werkt geen enkele trainingsprikkel.`,
      analyse: `je grootste lek zit niet in je trainingen maar ertussen: ${maxGapDagen} dagen zonder rit zet je adaptatie volledig stil`,
      actie: `Bescherm je consistentie: maximaal 4-5 dagen tussen trainingen, ook in drukke weken. Eén korte rit van 45 minuten houdt je opbouw vast — nul ritten gooit hem weg.`
    });
  } else if (maxGapDagen >= 10) {
    bevindingen.push({
      prio: 4, telAlsLek: true,
      kort: `Er zat een gat van ${maxGapDagen} dagen in je training — net genoeg om je opbouw te onderbreken.`,
      html: `Een gat van <strong>${maxGapDagen} dagen</strong> onderbreekt je supercompensatie. Je lichaam bouwt op in golven van belasting en herstel — valt die golf te lang stil, dan begin je deels opnieuw.`,
      analyse: `het gat van ${maxGapDagen} dagen in je schema heeft je opbouw onderbroken`,
      actie: `Houd het maximale gat tussen trainingen onder de 5 dagen. Liever één korte rit tussendoor dan een week niets.`
    });
  }

  // 2. Geen VO2max-prikkel
  if (vo2maxSessies === 0 && aantalActiviteiten >= 5) {
    bevindingen.push({
      prio: 2, telAlsLek: true,
      kort: `0 echte VO2max-sessies in 90 dagen — je motor krijgt geen enkele groeiprikkel.`,
      html: `In 90 dagen deed je <strong>0 VO2max-sessies</strong>. Dit is de primaire oorzaak van een prestatieplateau: zonder prikkel boven je drempel heeft je lichaam geen reden om je zuurstofopname te vergroten. Je onderhoudt, maar je groeit niet.`,
      analyse: `wat ontbreekt is de prikkel: nul VO2max-sessies betekent dat je motor geen reden krijgt om te groeien`,
      actie: `Plan 1x per week een vaste VO2max-training (bijvoorbeeld elke donderdag). De exacte intervalblokken op jouw niveau staan onder dit rapport — kies daar één van.`
    });
  } else if (vo2maxSessies >= 1 && vo2maxSessies <= 3 && aantalActiviteiten >= 10) {
    bevindingen.push({
      prio: 6, telAlsLek: true,
      kort: `Slechts ${vo2maxSessies} VO2max-sessie${vo2maxSessies > 1 ? 's' : ''} in 90 dagen — te weinig voor structurele groei (richtlijn: 1 per week).`,
      html: `Je deed <strong>${vo2maxSessies} VO2max-sessie${vo2maxSessies > 1 ? 's' : ''}</strong> in 90 dagen, waar er ruimte is voor circa 12. Incidentele prikkels onderhouden; pas een wekelijkse prikkel laat je motor groeien.`,
      analyse: `je raakt de VO2max-zone wel eens aan (${vo2maxSessies}x in 90 dagen), maar te zelden voor structurele groei`,
      actie: `Maak van VO2max een wekelijks ritueel in plaats van een uitzondering: elke week 1 sessie, nooit twee intensieve dagen op rij. De blokken onder dit rapport zijn je menu.`
    });
  }

  // 3. Grijs gebied te groot
  if (grijsPct !== null && grijsPct > 20) {
    bevindingen.push({
      prio: 3, telAlsLek: true,
      kort: `${grijsPct}% van je trainingstijd zit in ${Z.grijs} — te zwaar om van te herstellen, te licht om van te groeien.`,
      html: `<strong>${grijsPct}%</strong> van je tijd zit in ${Z.grijs}. Dat is de vermoeidheidszone: zwaar genoeg om je te slopen, te licht voor een echte prikkel. Dit verklaart het gevoel van hard trainen zonder sneller te worden.`,
      analyse: `met ${grijsPct}% in ${Z.grijs} train je jezelf moe zonder er sneller van te worden — dat is het klassieke patroon achter een plateau`,
      actie: `Schrap het grijze gebied: elke rit is óf rustig (onder ${duurMax}) óf een gerichte kwaliteitstraining. Het "lekker stevig doorrijden"-tempo is precies wat je moet laten staan.`
    });
  } else if (grijsPct !== null && grijsPct > 12) {
    bevindingen.push({
      prio: 7, telAlsLek: true,
      kort: `${grijsPct}% in ${Z.grijs} — aan de hoge kant; die tijd levert je weinig op.`,
      html: `Met <strong>${grijsPct}%</strong> in ${Z.grijs} lekt er trainingstijd weg naar een zone die weinig oplevert. Niet dramatisch, wel de makkelijkste winst die er ligt.`,
      analyse: `er lekt nog ${grijsPct}% van je tijd weg naar ${Z.grijs} — de makkelijkste winst die er ligt`,
      actie: `Maak je ritten polariserender: het grijze tempo-werk omzetten naar rustige duur onder ${duurMax}, en de vrijgekomen frisheid investeren in je wekelijkse kwaliteitstraining.`
    });
  }

  // 4. Te weinig duurbasis
  if (laagPct !== null && laagPct < 65) {
    bevindingen.push({
      prio: 3, telAlsLek: true,
      kort: `Maar ${laagPct}% van je tijd in ${Z.laag} — daar hoort 80% te zitten. Dit is waar je motor gebouwd wordt.`,
      html: `Slechts <strong>${laagPct}%</strong> van je trainingstijd zit in ${Z.laag}, waar 80% het doel is. Rustige duurtraining bouwt de mitochondriën die je uithoudingsvermogen dragen — zonder die basis heeft intensiteit geen fundament.`,
      analyse: `je basis is te smal: ${laagPct}% rustige duur waar 80% het doel is, en juist daar wordt je motor gebouwd`,
      actie: `Breng ${Z.laag} naar 80% van je trainingstijd. Concreet: je duurritten écht rustig houden, onder ${duurMax} — ook als het traag voelt. Traag voelen is het punt.`
    });
  } else if (laagPct !== null && laagPct < 78) {
    bevindingen.push({
      prio: 8, telAlsLek: false,
      kort: `${laagPct}% lage intensiteit — op de goede weg, maar nog niet de 80% waar je motor van groeit.`,
      html: `Je zit op <strong>${laagPct}%</strong> lage intensiteit. Goede richting, maar de wetenschap is duidelijk: rond de 80% rustige duur levert de meeste aerobe winst per trainingsuur.`,
      analyse: `je zoneverdeling zit in de goede richting (${laagPct}% rustig), maar de laatste stap naar 80% is waar het verschil zit`,
      actie: `Schuif de laatste procenten: houd elke duurrit gedisciplineerd onder ${duurMax} en bewaar je energie voor de kwaliteitsdag.`
    });
  }

  // 5. Te veel intensiteit
  if (kwaliteitPct !== null && kwaliteitPct > 22) {
    bevindingen.push({
      prio: 4, telAlsLek: true,
      kort: `${kwaliteitPct}% in ${Z.kwaliteit} — meer intensiteit dan je lichaam kan verwerken. Herstel komt in gevaar.`,
      html: `<strong>${kwaliteitPct}%</strong> van je tijd zit in ${Z.kwaliteit} — boven de 20% die je lichaam structureel aankan. Meer prikkel zonder meer herstel is geen extra groei, het is opstapelende vermoeidheid.`,
      analyse: `je traint eerder te hard dan te zacht: ${kwaliteitPct}% kwaliteit is meer dan je herstel kan bijbenen`,
      actie: `Doseer je intensiteit: maximaal 1-2 kwaliteitstrainingen per week, nooit twee op rij, en de rest van je ritten compromisloos rustig onder ${duurMax}.`
    });
  }

  // 6. Herstelbalans laag
  if (herstelLaag) {
    const scoreTekst = herstelScore !== null ? `${herstelScore}/10` : 'laag';
    bevindingen.push({
      prio: 5, telAlsLek: true,
      kort: `Je herstelbalans staat op ${scoreTekst} — je stapelt belasting zonder de adaptatie te innen.`,
      html: `Je herstelbalans is <strong>${scoreTekst}</strong>. Training is de prikkel, maar de winst wordt geboekt in het herstel (48-72 uur na een zware sessie). Wie dat venster steeds doorkruist, traint hard voor halve adaptatie.`,
      analyse: `je herstelbalans (${scoreTekst}) verraadt dat je de winst van je trainingen maar half int`,
      actie: `Plan herstel zoals je trainingen plant: minimaal 2 echte rustdagen per week en 48-72 uur tussen intensieve sessies.`
    });
  }

  // 7. Te lage frequentie
  if (rittenPerWeek < 3 && rittenPerWeek > 0) {
    bevindingen.push({
      prio: 5, telAlsLek: true,
      kort: `Gemiddeld ${rittenPerWeek} ritten per week — onder de 3x per week is structurele progressie lastig vast te houden.`,
      html: `Je traint gemiddeld <strong>${rittenPerWeek}x per week</strong>. Onder de 3 wekelijkse prikkels zakt je opbouw tussen trainingen steeds deels terug — je begint elke week een beetje opnieuw.`,
      analyse: `met ${rittenPerWeek} ritten per week zit je onder de frequentie waarop opbouw blijft plakken`,
      actie: `Verhoog naar minimaal 3 vaste trainingen per week en zet ze in je agenda als afspraken: bijvoorbeeld dinsdag rustig, donderdag kwaliteit, zondag lange duur.`
    });
  }

  // 8. Hoge gemiddelde intensiteit (alleen relevant zonder zone-data)
  if (gemIntensiteit !== null && gemIntensiteit > 80 && grijsPct === null) {
    bevindingen.push({
      prio: 6, telAlsLek: true,
      kort: `Je gemiddelde intensiteit is ${gemIntensiteit}% van je maximale hartslag — vrijwel elke rit is (te) stevig.`,
      html: `Een gemiddelde intensiteit van <strong>${gemIntensiteit}%</strong> van je max hartslag betekent dat bijna elke rit in de vermoeiende middenzone zit. Rustig is bij jou niet rustig genoeg.`,
      analyse: `je gemiddelde intensiteit (${gemIntensiteit}% van max HF) laat zien dat je rustige ritten niet rustig genoeg zijn`,
      actie: `Maak je rustige ritten écht rustig: je moet er moeiteloos bij kunnen praten. Voelt het traag, dan doe je het goed.`
    });
  }

  // FALLBACK: alles in orde — scherpte-bevinding
  if (bevindingen.length === 0) {
    bevindingen.push({
      prio: 9, telAlsLek: true,
      kort: `Je traint consistent en gestructureerd — je grootste winst zit nu in de scherpte van de uitvoering.`,
      html: `Je basis staat: consistente frequentie en een nette verdeling. De volgende stap is geen grote omslag maar <strong>precisie</strong> — strakkere zones, gerichtere kwaliteit, beter getimed herstel.`,
      analyse: `je fundament staat — consistent, nette verdeling — en dat is precies waarom de volgende winst in precisie zit, niet in meer uren`,
      actie: `Maak je uitvoering scherper: rustige ritten strak onder ${duurMax}, je wekelijkse kwaliteitssessie exact volgens de blokken onder dit rapport.`
    });
  }

  bevindingen.sort((a, b) => a.prio - b.prio);
  const top = bevindingen[0];
  const lekken = Math.min(Math.max(bevindingen.filter(b => b.telAlsLek).length, 1), 4);

  // ===== POSITIEF PUNT (er is altijd iets) =====
  let positief;
  if (maxGapDagen < 7 && rittenPerWeek >= 3) positief = `je bent consistent — ${rittenPerWeek}x per week zonder grote gaten, en dat is het fundament dat de meesten missen`;
  else if (laagPct !== null && laagPct >= 78) positief = `je duurbasis staat goed: ${laagPct}% rustige training is precies waar je motor van groeit`;
  else if (urenPerWeek >= 8) positief = `aan inzet geen gebrek — ${urenPerWeek} uur per week is een volume waar veel mee te winnen valt`;
  else if (langsteRit >= 80) positief = `je durft lang te rijden (langste rit ${langsteRit} km) en dat duurvermogen is een sterke basis`;
  else if (vo2maxSessies >= 4) positief = `je zoekt de intensiteit op (${vo2maxSessies} kwaliteitssessies) — de wil om diep te gaan is er`;
  else positief = `de data staat er en je traint — dat is meer dan de meeste mensen die sneller wíllen worden ooit vastleggen`;

  // ===== VARIANTEN (lichte tekstvariatie per sporter) =====
  const payoffVarianten = [
    `Pak dit aan en je voelt binnen 4-6 weken het verschil: frisser op de fiets en hogere waarden op dezelfde inspanning.`,
    `Los dit op en de progressie die nu blijft liggen komt los — meestal merkbaar binnen een week of vier tot zes.`,
    `Dit is geen kwestie van harder trainen maar van slimmer verdelen — en dat betaalt zich binnen enkele weken uit.`
  ];
  const alertVarianten = [
    (n) => `${kapitaal(n)}, je traint — maar je trainingsstructuur laat progressie liggen.`,
    (n) => `${kapitaal(n)}, de inzet is er. De structuur nog niet — en daar lekt je progressie weg.`,
    (n) => `${kapitaal(n)}, je data laat één ding duidelijk zien: er zit meer in dan eruit komt.`
  ];

  // ===== SAMENSTELLEN =====
  const diagnose = bevindingen.slice(0, 3).map(b => b.kort);
  while (diagnose.length < 3) diagnose.push('');
  // Derde regel krijgt de kern met strong-tags (zoals de frontend verwacht)
  if (bevindingen.length >= 1) {
    diagnose[2] = diagnose[2]
      ? `<strong>De kern:</strong> ${ontHtml(top.analyse)}.`
      : `<strong>De kern:</strong> ${ontHtml(top.analyse)}.`;
  }

  const persoonlijkeAnalyse =
    `${kapitaal(naam)}, eerst wat er goed gaat: ${positief}. ` +
    `Maar ${top.analyse}. ` +
    `${bevindingen[1] ? `Daar komt bij dat ${bevindingen[1].analyse}. ` : ''}` +
    `De oplossing is het 80/20-principe: 80% écht rustig, 20% écht raak, en het grijze gebied eruit. ` +
    kies(payoffVarianten, seed);

  // Actieplan: acties van de top-bevindingen, aangevuld met vaste fundamenten
  const actieplan = [];
  for (const b of bevindingen) {
    if (actieplan.length >= 3) break;
    if (!actieplan.includes(b.actie)) actieplan.push(b.actie);
  }
  const standaardActies = [
    `Plan je week vooruit: vaste trainingsdagen in de agenda (bijv. dinsdag rustig, donderdag kwaliteit, zondag lange duur) — consistentie wint van willekeur.`,
    `Houd elke duurrit onder ${duurMax} en bewaar je hardheid voor de kwaliteitsdag — de exacte intervalblokken staan onder dit rapport.`,
    `Bouw je weken in golven: 3 weken opbouwen, 1 week gas terug — zo in je adaptatie zonder op te stapelen.`
  ];
  for (const a of standaardActies) {
    if (actieplan.length >= 3) break;
    if (!actieplan.includes(a)) actieplan.push(a);
  }

  // ===== SCHEMA AANBEVELING (zelfde mapping als voorheen) =====
  let schema;
  if (urenPerWeek < 4) {
    schema = { niveau: 'Beginner', weken: 8, prijs: 39, url: 'https://michelkredercoaching.nl/checkout/?add-to-cart=6440&variation_id=11084' };
  } else if (urenPerWeek < 8) {
    schema = { niveau: 'Gevorderd', weken: 12, prijs: 59, url: 'https://michelkredercoaching.nl/checkout/?add-to-cart=8387&variation_id=11091' };
  } else {
    schema = { niveau: 'Expert', weken: 16, prijs: 79, url: 'https://michelkredercoaching.nl/checkout/?add-to-cart=8388&variation_id=11108' };
  }

  const upsellTekstVarianten = [
    `${kapitaal(naam)}, dit rapport laat zien wáár het lekt — het ${schema.niveau}-schema van ${schema.weken} weken lost het week voor week op. Elke training staat klaar, in de juiste zone, op het juiste moment, afgestemd op jouw ${urenPerWeek} uur per week.`,
    `${kapitaal(naam)}, je weet nu wat er mis gaat. Het ${schema.niveau}-schema (${schema.weken} weken) is de uitvoering: elke week exact weten wat je rijdt, in welke zone, en wanneer je herstelt — gebouwd voor sporters met jouw trainingsvolume.`,
    `De diagnose heb je nu, ${naam}. Het ${schema.niveau}-schema van ${schema.weken} weken is het recept: dag voor dag de juiste prikkel op het juiste moment, passend bij jouw ${urenPerWeek} uur per week.`
  ];

  const analyse = {
    lekkenGevonden: lekken,
    alertTekst: kies(alertVarianten, seed)(naam),
    diagnose,
    kritiekeBevinding: top.html,
    persoonlijkeAnalyse,
    actieplan,
    upsell: {
      niveau: schema.niveau,
      weken: schema.weken,
      prijs: schema.prijs,
      url: schema.url,
      tekst: kies(upsellTekstVarianten, seed),
      ctaTekst: 'Start mijn trainingsschema →'
    }
  };

  return res.status(200).json(analyse);
}

// ===== HELPERS =====
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function kies(arr, seed) { return arr[seed % arr.length]; }
function kapitaal(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function ontHtml(s) { return s.replace(/<[^>]*>/g, ''); }
