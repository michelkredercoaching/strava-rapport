// /api/betaling.js
import { huidigePrijs } from '../lib/prijs.js';
import { unseal } from '../lib/gate.js';
import { controleerKortingToken, kortingAlGebruikt, markeerKortingGebruikt } from '../lib/korting.js';
import { leverRapport } from '../lib/lever-rapport.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { blob, email, gewicht, land, postcode, huisnummer, straat, plaats, korting: kortingToken } = req.body || {};

  // De volledige analyse zit versleuteld in 'blob' (door strava-callback gemaakt).
  // We ontsleutelen 'm hier server-side om de Mollie-metadata + PDF te kunnen bouwen.
  let stravaData;
  try {
    stravaData = unseal(blob);
  } catch (e) {
    console.error('Blob ontsleutelen mislukt:', e);
    return res.status(400).json({ error: 'Ongeldige sessie. Koppel Strava opnieuw.' });
  }

  // ===== SERVICEKORTING — eenmalige persoonlijke kortingslink =====
  // Token komt uit ?korting= op de funnelpagina. Handtekening + houdbaarheid
  // worden hier gecheckt, en of de link al eens verzilverd is (Redis).
  // Een kapotte/gebruikte link weigeren we expliciet, zodat de klant nooit
  // ongemerkt de volle prijs betaalt terwijl hij korting verwachtte.
  let korting = null;
  if (kortingToken) {
    const check = controleerKortingToken(kortingToken);
    if (!check.geldig) {
      return res.status(400).json({ error: 'Deze kortingslink is verlopen of ongeldig. Stuur even een mailtje, dan krijg je een nieuwe.', kortingOngeldig: true });
    }
    if (await kortingAlGebruikt(check.id)) {
      return res.status(400).json({ error: 'Deze kortingslink is al een keer gebruikt. Stuur even een mailtje als dat niet klopt.', kortingOngeldig: true });
    }
    korting = check;
  }

  const slim = {
    naam: stravaData?.naam || 'Sporter',
    // Alleen voor de factuur. Leeg als Strava geen achternaam teruggaf, of bij
    // oudere blobs van vóór deze wijziging; mollie-factuur.js vangt dat op.
    achternaam: stravaData?.achternaam || '',
    aantalActiviteiten: stravaData?.aantalActiviteiten || 0,
    urenPerWeek: stravaData?.urenPerWeek || 0,
    prestatiescore: stravaData?.prestatiescore || 0,
    vo2maxSessies: stravaData?.vo2maxSessies || 0,
    zones: stravaData?.zones || [],
    ftp: stravaData?.ftp || null,
    ftpBetrouwbaarheid: stravaData?.ftpBetrouwbaarheid || null,
    gemIntensiteit: stravaData?.gemIntensiteit || null,
    herstelScore: stravaData?.herstelScore ?? null,
  };

  // ===== GEWICHT voor W/kg =====
  // Voorkeur: gewicht uit het Strava-profiel (zit in de blob). Ontbreekt dat,
  // dan het handmatig ingevulde gewicht van de betaalpagina. Zo komt W/kg ook
  // in de PDF terecht — niet alleen op de webpagina.
  const stravaW = (stravaData?.weight >= 35 && stravaData?.weight <= 200) ? stravaData.weight : null;
  const handmatigW = (Number(gewicht) >= 35 && Number(gewicht) <= 200) ? Math.round(Number(gewicht) * 10) / 10 : null;
  const finalW = stravaW || handmatigW || '';

  // ===== PRIJS — server-side, datum-afhankelijk (één bron van waarheid) =====
  // Het bedrag dat Mollie afschrijft komt HIER vandaan, niet uit de browser.
  // Zo kan de getoonde prijs nooit afwijken van wat er afgeschreven wordt.
  // Een geldige servicekorting-link overschrijft de normale prijs.
  const p = huidigePrijs();
  const bedrag = korting ? korting.bedrag : p.bedrag;
  const prijsGetal = korting ? korting.prijs : p.prijs;

  // Metadata die bij de betaling hoort — Mollie bewaart 'm en geeft 'm terug aan
  // de webhook, die er het rapport uit bouwt. Bij een gratis link (€0) slaan we
  // Mollie over en voeren we dezelfde metadata rechtstreeks aan leverRapport.
  const metadata = {
    naam: slim.naam,
    achternaam: slim.achternaam,
    email: (email || '').toString().slice(0, 120),
    // BINDING (punt 6): nonce uit de versleutelde blob. /api/rapport eist
    // dat deze overeenkomt voordat het rapport wordt vrijgegeven.
    nonce: stravaData?.nonce || '',
    ftp: slim.ftp,
    ftpBetrouwbaarheid: slim.ftpBetrouwbaarheid,
    uren: slim.urenPerWeek,
    score: slim.prestatiescore,
    vo2max: slim.vo2maxSessies,
    herstel: slim.herstelScore,
    intensiteit: slim.gemIntensiteit,
    ritten: slim.aantalActiviteiten,
    zones: Array.isArray(slim.zones) ? slim.zones.join('-') : '',
    // ===== W/KG =====
    weight: finalW,
    piek1min: stravaData?.piek1min || '',
    piek5min: stravaData?.piek5min || '',
    piek12min: stravaData?.piek12min || '',
    piek20min: stravaData?.piek20min || '',
    // ===== HR-SPOOR =====
    // Zonder deze velden kan de webhook alleen een vermogens-rapport bouwen.
    // 'meetmethode' vertelt de webhook welk rapport hij moet maken; het
    // omslagpunt + max-HF zijn de kerngetallen voor het hartslag-rapport.
    // heeftVermogensmeter is in strava-callback het EFFECTIEVE spoor (na de
    // 60%-power-dekkingsdrempel), dus precies de juiste vlag om op te sturen.
    meetmethode: stravaData?.heeftVermogensmeter ? 'vermogen' : 'hartslag',
    omslagpunt: stravaData?.omslagpunt || '',
    maxHf: stravaData?.maxHf || '',
    omslagpuntBetrouwbaarheid: stravaData?.omslagpuntBetrouwbaarheid || '',
    piek12minHr: stravaData?.piek12minHr || '',
    piek20minHr: stravaData?.piek20minHr || '',
    // ===== SERVICEKORTING =====
    // De webhook markeert dit ID als verzilverd zodra de betaling 'paid' is.
    kortingId: korting ? korting.id : '',
    // ===== FACTUURADRES =====
    // NL: postcode + huisnummer; de factuurcode zoekt straat + plaats erbij via
    // PDOK. BE (en overig): straat + postcode + plaats komen rechtstreeks mee,
    // want daar is geen postcode-API. Mollie eist een volledig adres.
    land: (land || 'NL').toString().trim().toUpperCase().slice(0, 2),
    postcode: (postcode || '').toString().trim().slice(0, 10),
    huisnummer: (huisnummer || '').toString().trim().slice(0, 12),
    straat: (straat || '').toString().trim().slice(0, 80),
    plaats: (plaats || '').toString().trim().slice(0, 60)
  };

  // ===== GRATIS LINK (€0) — Mollie overslaan, rapport direct mailen =====
  // Mollie kan geen €0-betaling maken, dus voor een volledig gratis servicelink
  // leveren we het rapport hier meteen af (PDF + klantmail + interne mail +
  // Mailchimp), net als de webhook doet na een betaling. De link is eenmalig:
  // hierboven is al gecheckt dat 'ie niet gebruikt is; na een geslaagde mail
  // markeren we 'm als verzilverd.
  if (korting && korting.prijs === 0) {
    if (!email) {
      return res.status(400).json({ error: 'Vul je e-mailadres in, dan sturen we je rapport (PDF) daarheen.' });
    }
    try {
      const r = await leverRapport(metadata, { bedrag: '0.00', id: `gratis-${korting.id}` });
      if (!r.pdfOk) {
        return res.status(500).json({ error: 'Rapport genereren lukte niet. Probeer het zo nog eens.' });
      }
      if (!r.klantMailGelukt) {
        return res.status(500).json({ error: 'Rapport mailen lukte niet. Controleer je e-mailadres en probeer opnieuw.' });
      }
      await markeerKortingGebruikt(korting.id);
      // gratis:true → de funnel stuurt de bezoeker naar het 'check je mail'-scherm.
      return res.status(200).json({ gratis: true, prijs: 0 });
    } catch (err) {
      console.error('Gratis aflevering mislukt:', err);
      return res.status(500).json({ error: 'Er ging iets mis bij het maken van je rapport. Probeer het opnieuw.' });
    }
  }

  try {
    const mollieRes = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: bedrag },
        description: 'Strava Trainingsrapport — Michel Kreder Coaching',
        // Geen 'method' meegegeven: Mollie toont automatisch alle betaalmethodes
        // die in het dashboard actief staan. Het dashboard is dus de enige bron
        // van waarheid — methode toevoegen/weghalen hoeft nooit meer in de code.
        locale: 'nl_NL',
        redirectUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-callback',
        webhookUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-webhook',
        metadata
      })
    });

    const betaling = await mollieRes.json();
    console.log('Mollie response:', JSON.stringify(betaling).substring(0, 200));

    if (betaling._links?.checkout?.href && betaling.id) {
      // prijs + isDeal + korting teruggeven zodat de frontend hetzelfde kan tonen.
      return res.status(200).json({
        checkoutUrl: betaling._links.checkout.href,
        pid: betaling.id,
        prijs: prijsGetal,
        isDeal: p.isDeal,
        korting: !!korting
      });
    }

    console.error('Mollie error:', JSON.stringify(betaling));
    return res.status(500).json({ error: 'Betaling aanmaken mislukt' });
  } catch (err) {
    console.error('Betaling error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
