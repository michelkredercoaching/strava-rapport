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
    herstelRatio = '1:4',
    prestatiescore = 50,
    duurvermogen = 'matig',
    zonescore = 'slecht',
    herstelbalans = 'matig',
    intensiteitsverdeling = 'slecht',
    zones = [],
    langsteRit = 0,
    gemAfstandPerWeek = 0,
  } = stravaData;

  const prompt = `Je bent Michel Kreder — ex-profwielrenner en coach. Je analyseert Strava trainingsdata van een sporter en schrijft een persoonlijk, direct en eerlijk rapport. 

Je stijl: direct, no-bullshit, prestatiegericht. Geen motivatiequotes. Geen vage taal. Concrete cijfers en acties.

SPORTER DATA:
- Naam: ${naam}
- Activiteiten (90 dagen): ${aantalActiviteiten}
- Trainingsuren per week (gem): ${urenPerWeek}u
- VO2max sessies: ${vo2maxSessies} (van ${aantalActiviteiten} trainingen)
- Gemiddelde intensiteit: ${gemIntensiteit}% van max hartslag
- Herstelratio: ${herstelRatio} (ideaal: 1:2)
- Prestatiescore: ${prestatiescore}/100
- Duurvermogen: ${duurvermogen}
- Zoneverdeling: ${zonescore}
- Herstelbalans: ${herstelbalans}
- Intensiteitsverdeling: ${intensiteitsverdeling}
- Zoneverdeling %: ${zones.length > 0 ? zones.map((z,i) => `Z${i+1}: ${z}%`).join(', ') : 'Niet beschikbaar'}
- Langste rit: ${langsteRit}km
- Gem. afstand/week: ${gemAfstandPerWeek}km

Genereer een rapport in dit exacte JSON formaat. Zorg dat alle teksten specifiek zijn voor DEZE sporter op basis van de data. Niet generiek.

{
  "lekkenGevonden": <getal 1-4, op basis van data>,
  "alertTekst": "<1 zin, specifiek probleem voor deze sporter>",
  "diagnose": [
    "<zin 1: meest kritieke probleem, gebruik echte cijfers>",
    "<zin 2: tweede probleem of gevolg>",
    "<zin 3: kern van het probleem, gebruik HTML strong tags voor getallen>"
  ],
  "kritiekeBevinding": "<HTML string, meest kritieke bevinding met cijfers en strong tags>",
  "persoonlijkeAnalyse": "<3-4 zinnen persoonlijke analyse van dit specifieke trainingspatroon. Gebruik naam. Direct en eerlijk. Benoem wat goed gaat en wat mis gaat. Geen algemeenheden.>",
  "actieplan": [
    "<stap 1: concrete actie met specifieke getallen, aangepast op ${urenPerWeek}u/week>",
    "<stap 2: concrete actie>",
    "<stap 3: concrete actie>"
  ],
  "trainingsblokken": [
    {
      "titel": "Optie A — <niveau label op basis van uren>",
      "omschrijving": "<interval formaat bijv. 10 × 20-10>",
      "detail": "<beschrijving van de uitvoering, waarom deze werkt voor deze sporter>"
    },
    {
      "titel": "Optie B — <niveau label>",
      "omschrijving": "<interval formaat>",
      "detail": "<beschrijving>"
    }
  ]
}

Geef ALLEEN de JSON terug, geen uitleg, geen markdown codeblokken.`;

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
        max_tokens: 1200,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return res.status(500).json({ error: 'Claude API fout', fallback: true });
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text || '';

    // JSON parsen (strip eventuele markdown fences)
    const clean = rawText.replace(/```json|```/g, '').trim();
    const analyse = JSON.parse(clean);

    return res.status(200).json(analyse);

  } catch (err) {
    console.error('Analyse fout:', err);
    return res.status(500).json({ error: 'Analyse mislukt', fallback: true });
  }
}
