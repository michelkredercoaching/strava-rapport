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
    herstelRatio = null,
    prestatiescore = 50,
    duurvermogen = 'matig',
    zonescore = 'slecht',
    herstelbalans = 'matig',
    intensiteitsverdeling = 'slecht',
    zones = [],
    langsteRit = 0,
    gemAfstandPerWeek = 0,
    heeftVermogensmeter = false,
    ftp = null,
    bestE20min = null,
    bestE12min = null,
    maxHf = null,
    omslagpunt = null,
    gemHr = null,
    maxGapDagen = 0,
  } = stravaData;

  // ===== ZONE SYSTEEM BEPALEN =====
  let zoneSystemTekst = '';
  let zoneAnalyseTekst = '';

  if (heeftVermogensmeter && ftp) {
    // FTP ZONES
    const ftpBron = bestE20min
      ? `beste 20min inspanning (${bestE20min}W × 95%)`
      : bestE12min
      ? `beste 12min inspanning (${bestE12min}W × 88%)`
      : 'schatting op basis van trainingsdata';

    zoneSystemTekst = `ZONESYSTEEM: FTP-gebaseerd
FTP: ${ftp}W (berekend via ${ftpBron})

JOUW FTP ZONES:
- Herstel:   <${Math.round(ftp * 0.55)}W  (<55% FTP)
- Duur:      ${Math.round(ftp * 0.56)}-${Math.round(ftp * 0.75)}W  (56-75% FTP) ← hier moet 80% van trainingen zitten
- Tempo:     ${Math.round(ftp * 0.76)}-${Math.round(ftp * 0.85)}W  (76-85% FTP) ← GRIJS GEBIED, vermijden
- Sweetspot: ${Math.round(ftp * 0.86)}-${Math.round(ftp * 0.95)}W  (86-95% FTP)
- FTP:       ${Math.round(ftp * 0.96)}-${Math.round(ftp * 1.05)}W  (96-105% FTP)
- VO2max:    >${Math.round(ftp * 1.05)}W  (>105% FTP) ← hier moet 20% van kwaliteitstrainingen zitten`;

    const duurPct = zones[1] || 0;
    const tempoPct = zones[2] || 0;
    const vo2Pct = (zones[4] || 0) + (zones[5] || 0);

    zoneAnalyseTekst = `ZONE ANALYSE:
- Duur (Z2): ${duurPct}% van trainingen ${duurPct >= 60 ? '✓ goed' : duurPct >= 40 ? '⚠ te weinig' : '✗ veel te weinig — dit is de basis'}
- Tempo (grijs): ${tempoPct}% ${tempoPct > 30 ? '✗ te veel grijs gebied — dit maakt je moe zonder progressie' : '✓ onder controle'}
- VO2max kwaliteit: ${vo2Pct}% / ${vo2maxSessies} sessies ${vo2maxSessies >= 3 ? '✓ goed' : '✗ te weinig groeiprikkel'}
- 80/20 check: ${duurPct >= 70 && vo2Pct >= 15 ? '✓ goed' : '✗ niet in balans'}`;

  } else if (omslagpunt && maxHf) {
    // HARTSLAG ZONES
    zoneSystemTekst = `ZONESYSTEEM: Hartslag-gebaseerd
Max HF: ${maxHf} bpm (gemiddelde top 3 metingen)
Omslagpunt: ${omslagpunt} bpm (max HF × 90%)

JOUW HARTSLAG ZONES:
- Herstel: <${Math.round(omslagpunt * 0.75)} bpm  (<75% omslagpunt)
- D1 Duur: ${Math.round(omslagpunt * 0.75)}-${Math.round(omslagpunt * 0.85)} bpm  (75-85% omslagpunt) ← hier moet 80% van trainingen zitten
- D2 Sweetspot: ${Math.round(omslagpunt * 0.85)}-${Math.round(omslagpunt * 0.95)} bpm  (85-95% omslagpunt)
- D3 Drempel: ${Math.round(omslagpunt * 0.95)}-${omslagpunt} bpm  (95-100% omslagpunt)
- Weerstand: >${omslagpunt} bpm  (>100% omslagpunt) ← VO2max prikkel

BELANGRIJK: Adviseer deze sporter een vermogensmeter aan te schaffen voor nauwkeurigere analyse. Hartslag is beïnvloedbaar door vermoeidheid, temperatuur en cafeïne — vermogen is objectief.`;

    const d1Pct = zones[1] || 0;
    const d2Pct = zones[2] || 0;
    const weerstandPct = zones[4] || 0;
    const gemHrVsOmslagpunt = gemHr ? Math.round((gemHr / omslagpunt) * 100) : null;

    zoneAnalyseTekst = `ZONE ANALYSE (hartslag):
- Gem. HF: ${gemHr || '?'} bpm ${gemHrVsOmslagpunt ? `(${gemHrVsOmslagpunt}% van omslagpunt)` : ''}
- D1 Duur: ${d1Pct}% ${d1Pct >= 60 ? '✓ goed' : '⚠ te weinig basistraining'}
- D2 Sweetspot: ${d2Pct}% ${d2Pct > 35 ? '⚠ veel tijd in grijs gebied' : '✓ ok'}
- Weerstand/VO2max: ${weerstandPct}% / ${vo2maxSessies} sessies ${vo2maxSessies >= 3 ? '✓ goed' : '✗ te weinig groeiprikkel'}`;

  } else {
    // GEEN DATA
    zoneSystemTekst = `ZONESYSTEEM: Onvoldoende data
Geen vermogensmeter en geen hartslag data beschikbaar. Analyseer op basis van volume en structuur.
Adviseer sterk: vermogensmeter voor nauwkeurige FTP-gebaseerde training.`;
    zoneAnalyseTekst = `ZONE ANALYSE: Niet mogelijk zonder hartslag of vermogensdata.`;
  }

  // ===== STRUCTUUR ANALYSE =====
  const structuurAnalyse = maxGapDagen >= 14
    ? `KRITIEK: ${maxGapDagen} dagen niet getraind — verlies van 5-10% conditie. Supercompensatie volledig verstoord.`
    : maxGapDagen >= 10
    ? `WAARSCHUWING: ${maxGapDagen} dagen gap — supercompensatie onderbroken.`
    : maxGapDagen >= 7
    ? `LET OP: ${maxGapDagen} dagen gap — net aan de grens.`
    : 'Structuur regelmatig — goed.';

  const rittenPerWeek = Math.round(aantalActiviteiten / 13 * 10) / 10;
  const structuurAdvies = rittenPerWeek < 3
    ? 'Te weinig trainingen per week. Minimaal 3x per week voor structurele progressie.'
    : rittenPerWeek <= 5
    ? 'Goed aantal trainingen. Controleer of rustdagen goed verdeeld zijn (Ma rust, Di/Do/Za/Zo trainen).'
    : 'Hoog trainingsvolume. Zorg voor minimaal 2 echte rustdagen per week en nooit 2 intensieve trainingen op rij.';

  // ===== SCHEMA AANBEVELING =====
  // Directe WooCommerce checkout URLs per niveau
  const baseUrl = 'https://michelkredercoaching.nl/checkout/?add-to-cart';
  let schemaAanbeveling;
  if (urenPerWeek < 4) {
    schemaAanbeveling = { niveau: 'Beginner', weken: 8, prijs: 39, url: `https://michelkredercoaching.nl/checkout/?add-to-cart=6440&variation_id=11084`, reden: 'eerst structuur en basisconditie opbouwen' };
  } else if (urenPerWeek < 8) {
    schemaAanbeveling = { niveau: 'Gevorderd', weken: 12, prijs: 59, url: `https://michelkredercoaching.nl/checkout/?add-to-cart=8387&variation_id=11091`, reden: 'basisconditie aanwezig, juiste zones en periodisering toepassen' };
  } else {
    schemaAanbeveling = { niveau: 'Expert', weken: 16, prijs: 79, url: `https://michelkredercoaching.nl/checkout/?add-to-cart=8388&variation_id=11108`, reden: 'hoog volume vereist precieze periodisering en zone-controle' };
  }

  const prompt = `Je bent Michel Kreder — voormalig profwielrenner (9 jaar) en coach (8+ jaar). 17 jaar ervaring. Je analyseert Strava data en schrijft een persoonlijk, direct en eerlijk rapport. Geen motivatiequotes. Geen vage taal. Concrete cijfers. Klink als een coach die de data heeft gezien.

JOUW TRAININGSFILOSOFIE:
1. 80/20 REGEL: 80% lage intensiteit (Duur/D1), 20% hoge kwaliteit (VO2max/Weerstand). Het grijze gebied (Tempo/D2) is de vijand — te zwaar voor duuradaptatie, te licht voor VO2max prikkel. Resultaat van te veel grijs: chronisch moe, geen progressie.

2. ${zoneSystemTekst}

3. ${zoneAnalyseTekst}

4. STRUCTUUR:
${structuurAnalyse}
${structuurAdvies}
- Supercompensatie: 48-72u herstel na zware prikkel voor adaptatie
- Nooit 2 intensieve trainingen op rij
- Intensief op bijv. donderdag → volgende intensief zondag (minimaal 2-3 dagen ertussen)
- Consistentie > volume: liever 3x per week structureel dan chaos

5. WETENSCHAPPELIJKE BASIS: Meer Z2/D1 = meer mitochondriën = meer uithoudingsvermogen. Combinatie duur + kwaliteit = maximale progressie met minimale vermoeidheid. Bewezen bij honderden sporters in 17 jaar.

SPORTER DATA:
- Naam: ${naam}
- Activiteiten (90 dagen): ${aantalActiviteiten} (gem. ${rittenPerWeek}x/week)
- Trainingsuren/week: ${urenPerWeek}u
- Grootste gap: ${maxGapDagen} dagen
- VO2max/Weerstand sessies: ${vo2maxSessies}
- Gem. intensiteit: ${gemIntensiteit ? gemIntensiteit + '% van max HF' : 'onbekend'}
- Herstelratio: ${herstelRatio || 'onbekend'}
- Langste rit: ${langsteRit}km
- Gem. afstand/week: ${gemAfstandPerWeek}km
- Vermogensmeter: ${heeftVermogensmeter ? 'ja' : 'nee'}
- FTP: ${ftp ? ftp + 'W' : 'onbekend'}
- Max HF: ${maxHf ? maxHf + ' bpm' : 'onbekend'}
- Omslagpunt: ${omslagpunt ? omslagpunt + ' bpm' : 'onbekend'}
- Prestatiescore: ${prestatiescore}/100
- Duurvermogen: ${duurvermogen}
- Herstelbalans: ${herstelbalans}
- Intensiteitsverdeling: ${intensiteitsverdeling}

SCHEMA AANBEVELING: ${schemaAanbeveling.niveau} ${schemaAanbeveling.weken} weken €${schemaAanbeveling.prijs} — ${schemaAanbeveling.reden}

Schrijf het rapport nu. Gebruik naam. Wees specifiek met cijfers. Klink als Michel.

Geef ALLEEN dit JSON terug, geen uitleg, geen markdown:

{
  "lekkenGevonden": <1-4>,
  "alertTekst": "<1 directe zin met naam en specifiek probleem>",
  "diagnose": [
    "<hoofdprobleem met cijfers>",
    "<tweede probleem of gevolg>",
    "<kern in één zin met HTML strong tags>"
  ],
  "kritiekeBevinding": "<HTML string, meest kritieke bevinding met strong tags>",
  "persoonlijkeAnalyse": "<3-4 zinnen in Michel's stem. Naam gebruiken. Wat goed gaat. Wat fout gaat. Koppel aan 80/20 en structuur. Eindig met wat er verandert als hij het aanpakt.>",
  "actieplan": [
    "<stap 1: concreet, specifiek, met cijfers en zone-namen>",
    "<stap 2>",
    "<stap 3>"
  ],
  "trainingsblokken": [
    {
      "titel": "<zone naam — bijv. 'Duurtraining Z2' of 'D1 Basisrit' of 'VO2max Interval'>",
      "omschrijving": "<concreet format>",
      "detail": "<waarom + hoe uitvoeren, koppel aan filosofie>"
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
    "url": "${schemaAanbeveling.url}",
    "tekst": "<2-3 zinnen waarom dit schema de oplossing is voor DEZE sporter specifiek. Naam gebruiken. Koppel aan gevonden problemen. Klink als Michel die persoonlijk adviseert.>",
    "ctaTekst": "<knoptekst max 6 woorden>"
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
