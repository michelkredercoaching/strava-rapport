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
    gemIntensiteit = 0,
    herstelRatio = null,
    prestatiescore = 50,
    duurvermogen = 'matig',
    zonescore = 'slecht',
    herstelbalans = 'matig',
    intensiteitsverdeling = 'slecht',
    zones = [],
    langsteRit = 0,
    gemAfstandPerWeek = 0,
    ftp = null,
    bestE20min = null,
    bestE12min = null,
    trainingsDagen = [],
    maxGapDagen = 0,
    heeftVermogensmeter = false,
  } = stravaData;

  // FTP berekenen als we best efforts hebben
  let ftpWaarde = ftp;
  let ftpBron = null;
  if (!ftpWaarde && bestE20min) {
    ftpWaarde = Math.round(bestE20min * 0.95);
    ftpBron = `beste 20min (${bestE20min}W × 95%)`;
  } else if (!ftpWaarde && bestE12min) {
    ftpWaarde = Math.round(bestE12min * 0.88);
    ftpBron = `beste 12min (${bestE12min}W × 88%)`;
  }

  // Zone analyse op basis van FTP
  const zoneDefinities = ftpWaarde ? `
ZONE DEFINITIE (gebaseerd op FTP: ${ftpWaarde}W${ftpBron ? ` via ${ftpBron}` : ''}):
- Z1 Herstel: <${Math.round(ftpWaarde * 0.55)}W (<55% FTP)
- Z2 Duur: ${Math.round(ftpWaarde * 0.56)}-${Math.round(ftpWaarde * 0.75)}W (56-75% FTP) ← HIER moet 80% van de trainingen zitten
- Z3 Tempo/Grijs: ${Math.round(ftpWaarde * 0.76)}-${Math.round(ftpWaarde * 0.85)}W (76-85% FTP) ← dit is de valkuil
- Z4 Sweetspot: ${Math.round(ftpWaarde * 0.86)}-${Math.round(ftpWaarde * 0.95)}W (86-95% FTP)
- Z5 FTP: ${Math.round(ftpWaarde * 0.96)}-${Math.round(ftpWaarde * 1.05)}W (96-105% FTP)
- Z6 VO2max: >${Math.round(ftpWaarde * 1.05)}W (>105% FTP)` 
  : `ZONES: Geen vermogensmeter gedetecteerd. Analyse op basis van beschikbare data. Adviseer sporter een vermogensmeter aan te schaffen voor nauwkeurige zonebepaling.`;

  // Structuur analyse
  const structuurAnalyse = maxGapDagen > 10 
    ? `STRUCTUURPROBLEEM: ${maxGapDagen} dagen niet getraind — bij 10+ dagen verlies je 5-10% conditie (supercompensatie gaat verloren).`
    : maxGapDagen > 7 
    ? `STRUCTUURWAARSCHUWING: ${maxGapDagen} dagen gap gevonden — dit verstoort het supercompensatieproces.`
    : 'Structuur lijkt regelmatig.';

  // Schema aanbeveling op basis van uren
  let schemaAanbeveling, schemaUrl;
  if (urenPerWeek < 4) {
    schemaAanbeveling = { niveau: 'Beginner', weken: 8, prijs: 39, reden: 'eerst basisconditie opbouwen met structuur en regelmaat' };
    schemaUrl = 'https://michelkredercoaching.nl/trainingsschemas/?niveau=beginner&weken=8';
  } else if (urenPerWeek < 8) {
    schemaAanbeveling = { niveau: 'Gevorderd', weken: 12, prijs: 59, reden: 'je hebt een basis — nu de juiste zones en structuur toepassen' };
    schemaUrl = 'https://michelkredercoaching.nl/trainingsschemas/?niveau=gevorderd&weken=12';
  } else {
    schemaAanbeveling = { niveau: 'Expert', weken: 16, prijs: 79, reden: 'hoog volume vereist periodisering en precieze zone-controle' };
    schemaUrl = 'https://michelkredercoaching.nl/trainingsschemas/?niveau=expert&weken=16';
  }

  const prompt = `Je bent Michel Kreder — voormalig profwielrenner (9 jaar) en coach (8+ jaar). Je hebt 17 jaar ervaring en baseert alles op wetenschappelijke trainingsleer. Je hebt honderden wielrenners gecoacht en kent het probleem van binnenuit.

JOUW TRAININGSFILOSOFIE:
1. 80/20 REGEL: 80% van trainingen in Z2 Duur (56-75% FTP), 20% in Z5/Z6 kwaliteit. Nooit Z3 Tempo als doel — dat is het grijze gebied waar iedereen te veel in rijdt: te zwaar voor duurtraining, te licht voor kwaliteit. Resultaat: altijd moe, geen progressie.

2. ZONES OP FTP:
${zoneDefinities}

3. STRUCTUUR IS ALLES:
- Weinig trainers (3-4x/week): Ma rust, Di train, Wo rust, Do train, Vr rust, Za kort/rust, Zo lang
- Veel trainers (5-6x/week): Ma rust, Di-Do train, Vr rust, Za-Zo train
- ALTIJD minimaal 2 rustdagen per week — liefst een echte rustdag (geen actief herstel)
- Intensieve trainingen: nooit twee opeenvolgende dagen. Minimaal 2-3 dagen ertussen (bijv. Do → Zo)
- Supercompensatie: na zware prikkel moet het lichaam 48-72u herstellen voor adaptatie plaatsvindt
- Gap van 10+ dagen = 5-10% conditieverlies

4. GRIJS GEBIED = VIJAND: De meeste sporters rijden 80-85% FTP (Z3 Tempo) — voelt goed maar is de slechtste zone. Te zwaar voor mitochondriële aanpassing, te licht voor VO2max prikkel. Resultaat: chronisch moe zonder progressie.

5. DUUR + KWALITEIT = GOUDEN SLEUTEL:
- Meer Z2 = meer mitochondriën = meer uithoudingsvermogen = langer volhouden
- Z5/Z6 sessies geven VO2max prikkel die de motor laat groeien
- Combinatie van beide = maximale progressie met minimale vermoeidheid

6. CONSISTENTIE: Regelmaat boven volume. Liever 3x per week structureel dan chaos van soms veel, soms weinig.

SPORTER DATA:
- Naam: ${naam}
- Activiteiten (90 dagen): ${aantalActiviteiten} (ideaal: 36-54 voor 3-4x/week)
- Trainingsuren per week: ${urenPerWeek}u
- VO2max sessies (Z5/Z6): ${vo2maxSessies} van ${aantalActiviteiten} trainingen
- Gemiddelde intensiteit: ${gemIntensiteit}% van max hartslag
- Langste rit: ${langsteRit}km
- Gem. afstand/week: ${gemAfstandPerWeek}km
- Grootste gap: ${maxGapDagen} dagen niet getraind
- Vermogensmeter: ${heeftVermogensmeter ? 'ja' : 'nee'}
- FTP: ${ftpWaarde ? ftpWaarde + 'W' : 'onbekend'}
- Zoneverdeling: ${zones.length > 0 ? zones.map((z,i) => `Z${i+1}: ${z}%`).join(', ') : 'niet beschikbaar'}
- Duurvermogen: ${duurvermogen}
- Zoneverdeling beoordeling: ${zonescore}
- Herstelbalans: ${herstelbalans}

STRUCTUUR ANALYSE: ${structuurAnalyse}

SCHEMA AANBEVELING: ${schemaAanbeveling.niveau} ${schemaAanbeveling.weken} weken (€${schemaAanbeveling.prijs}) — ${schemaAanbeveling.reden}

Schrijf nu een persoonlijk rapport in Michel Kreder's stem. Direct, no-bullshit, eerlijk. Gebruik de naam. Benoem specifieke cijfers. Geen vage taal. Geen motivatiequotes. Klink als een coach die de data heeft gezien en precies weet wat er mis is.

Geef ALLEEN dit JSON terug, geen uitleg, geen markdown:

{
  "lekkenGevonden": <1-4>,
  "alertTekst": "<1 directe zin met naam en specifiek probleem, gebruik echte cijfers>",
  "diagnose": [
    "<zin 1: hoofdprobleem met cijfers — wees confronterend maar constructief>",
    "<zin 2: gevolg of tweede probleem>",
    "<zin 3: kern in één zin, gebruik HTML strong tags voor getallen/termen>"
  ],
  "kritiekeBevinding": "<HTML string, meest kritieke bevinding. Gebruik strong tags. Koppel aan jouw filosofie.>",
  "persoonlijkeAnalyse": "<3-4 zinnen in Michel's stem. Gebruik naam. Benoem wat goed gaat. Benoem wat fout gaat. Koppel aan de 80/20 filosofie en structuur. Eindig met wat er gaat veranderen als hij het aanpakt.>",
  "actieplan": [
    "<stap 1: meest kritieke actie, specifiek en uitvoerbaar met cijfers, gebaseerd op Michel's filosofie>",
    "<stap 2: tweede actie>",
    "<stap 3: derde actie>"
  ],
  "trainingsblokken": [
    {
      "titel": "<zone label — bijv. 'Z2 Duurtraining' of 'Z5 VO2max Interval'>",
      "omschrijving": "<concreet format — bijv. '10 × 20-10' of '2u Z2'>",
      "detail": "<waarom deze werkt volgens Michel's filosofie, hoe uitvoeren>"
    },
    {
      "titel": "<tweede blok>",
      "omschrijving": "<format>",
      "detail": "<uitleg>"
    }
  ],
  "upsell": {
    "niveau": "${schemaAanbeveling.niveau}",
    "weken": ${schemaAanbeveling.weken},
    "prijs": ${schemaAanbeveling.prijs},
    "url": "${schemaUrl}",
    "tekst": "<2-3 zinnen waarom dit schema de oplossing is voor deze specifieke sporter. Gebruik naam. Koppel aan de gevonden problemen. Klink als Michel die persoonlijk adviseert — niet als een salespitch.>",
    "ctaTekst": "<korte CTA tekst voor de knop, max 6 woorden>"
  }
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return res.status(500).json({ error: 'Claude API fout', fallback: true });
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text || '';
    const clean = rawText.replace(/```json|```/g, '').trim();
    const analyse = JSON.parse(clean);

    return res.status(200).json(analyse);

  } catch (err) {
    console.error('Analyse fout:', err);
    return res.status(500).json({ error: 'Analyse mislukt', fallback: true });
  }
}
