// /lib/mollie-factuur.js
// Maakt na een betaalde Strava-analyse een VERKOOPFACTUUR aan via Mollie
// Invoicing (Sales Invoices API) en laat Mollie die als PDF naar de klant
// mailen. Mollie regelt de nummering, de btw-splitsing, je bedrijfsgegevens en
// de PDF-opmaak — die staan allemaal in je Mollie-dashboard, niet in deze code.
//
// Waarom via Mollie en niet zelf een PDF? De oude WooCommerce-route ligt eruit
// (Cloudflare blokkeert Vercel -> Woo met een 403, zie betaling-webhook.js), en
// een eigen PDF zou betekenen dat wij nummering + bedrijfsgegevens + btw moeten
// beheren. Mollie doet dat als bron van waarheid, net zoals het de betaling doet.
//
// LET OP: de Sales Invoices API is bij Mollie nog BETA. Deze module wordt daarom
// pas echt aangeroepen als MOLLIE_FACTUUR op 'aan' staat (zie de webhook), zodat
// je 'm eerst rustig in testmode kunt verifieren.
//
// De kopie naar de boekhouding (eAccounting) regelt Mollie zelf: zet in het
// dashboard onder Invoicing -> E-mailinstellingen -> "Standaard BCC" je Visma/
// eAccounting-inbox. Mollie BCC't dan elke klantfactuur daarheen. Wij hoeven
// dus geen PDF op te halen of door te sturen.
//
// Vereist in Vercel: MOLLIE_API_KEY (dezelfde als voor de betalingen; de key
//                    bepaalt ook test- vs live-modus: test_... of live_...)

const MOLLIE_API = 'https://api.mollie.com/v2/sales-invoices';

// Btw-tarief op de analyse. De prijs (bijv. 29,00) is INCLUSIEF btw, dus we
// zetten vatMode op 'inclusive' en laten Mollie de splitsing rekenen.
const BTW_TARIEF = '21.00';

// De bron van de al-ontvangen betaling. sourceReference wordt het Mollie
// betaling-id (tr_...). Dit is het enige veld dat we nog in testmode moeten
// bevestigen: accepteert Mollie 'payment' voor een reguliere betaling, of moet
// het 'payment-link' / 'bank-transfer' zijn? Bij een 400 zie je dat meteen in
// de foutmelding en passen we deze ene constante aan.
const BETALING_BRON = 'payment';

// De analyse vraagt geen achternaam uit; we splitsen wat Strava teruggaf.
function splitNaam(naam) {
  const delen = String(naam || '').trim().split(/\s+/).filter(Boolean);
  if (delen.length === 0) return { voornaam: 'Klant', achternaam: '' };
  if (delen.length === 1) return { voornaam: delen[0], achternaam: '' };
  return { voornaam: delen[0], achternaam: delen.slice(1).join(' ') };
}

// Zoekt straat + woonplaats bij een NL postcode + huisnummer via de gratis PDOK
// Locatieserver (overheidsdienst, geen API-key nodig). Geeft
// { straatEnNummer, postcode, plaats } terug, of null als er niks gevonden is
// (typfout, buitenlands adres, dienst plat). De aanroeper valt dan terug op een
// placeholder-adres, zodat de factuur nooit blijft hangen.
async function zoekAdres(postcode, huisnummer) {
  const pc = String(postcode || '').toUpperCase().replace(/\s+/g, '');
  const hnr = String(huisnummer || '').trim();
  if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(pc) || !hnr) return null;
  try {
    const url = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free'
      + `?q=${encodeURIComponent(pc + ' ' + hnr)}&fq=type:adres&rows=1`
      + '&fl=straatnaam,huis_nlt,postcode,woonplaatsnaam';
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json();
    const doc = j && j.response && j.response.docs && j.response.docs[0];
    // Alleen vertrouwen als de gevonden postcode exact matcht met de invoer;
    // anders heeft de fuzzy-zoekopdracht een ander adres gepakt.
    if (!doc || String(doc.postcode || '').toUpperCase().replace(/\s+/g, '') !== pc) return null;
    if (!doc.straatnaam || !doc.woonplaatsnaam) return null;
    return {
      straatEnNummer: `${doc.straatnaam} ${doc.huis_nlt || hnr}`.trim(),
      postcode: doc.postcode,
      plaats: doc.woonplaatsnaam
    };
  } catch { return null; }
}

/**
 * Maakt de verkoopfactuur aan bij Mollie en laat 'm mailen naar de klant.
 *
 * Gooit nooit een fout omhoog: het rapport is al geleverd, en een storing aan de
 * factuurkant mag die levering nooit alsnog laten mislukken. Geeft { ok:true, id,
 * nummer } terug, of { ok:false, status, fout, tekst }.
 *
 * @param {object} p
 * @param {string} p.naam       naam van de koper (uit de Mollie-metadata)
 * @param {string} p.email      e-mailadres van de koper
 * @param {string} p.bedrag     betaald bedrag INCL. btw, numeriek, bijv. '29.00'
 * @param {string} p.betaalId   Mollie betaling-id (tr_...), komt op de factuur
 * @param {string} [p.postcode]   NL postcode van de koper (voor het factuuradres)
 * @param {string} [p.huisnummer] huisnummer van de koper (NL, voor de PDOK-lookup)
 * @param {string} [p.land]       'NL' of 'BE' (bepaalt hoe we het adres opbouwen)
 * @param {string} [p.straat]     straat + huisnummer (BE: zelf ingevuld)
 * @param {string} [p.plaats]     gemeente/woonplaats (BE: zelf ingevuld)
 */
export async function maakMollieFactuur({ naam, email, bedrag, betaalId, postcode, huisnummer, land, straat, plaats }) {
  const KEY = process.env.MOLLIE_API_KEY;
  if (!KEY) return { ok: false, fout: 'MOLLIE_API_KEY ontbreekt in Vercel' };
  if (!email) return { ok: false, fout: 'geen e-mailadres bekend, factuur kan niet naar de klant' };

  // Bedrag normaliseren naar Mollie-formaat: twee decimalen, punt als scheiding.
  const bruto = Number(String(bedrag).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!(bruto > 0)) return { ok: false, fout: `ongeldig bedrag: ${bedrag}` };
  const waarde = bruto.toFixed(2);

  const { voornaam, achternaam } = splitNaam(naam);
  const adres = String(email).trim().toLowerCase();

  // Mollie eist een volledig adres (straat, postcode, plaats) op de factuur.
  // NL: we vragen alleen postcode + huisnummer en zoeken straat + woonplaats
  // erbij via PDOK. BE (en overig): de klant vult straat + postcode + gemeente
  // zelf in, want daar is geen gratis postcode-API. Lukt niks (typfout, dienst
  // plat), dan een nette placeholder — juridisch prima voor een bon onder EUR
  // 100 en de factuur moet altijd door kunnen.
  const landCode = String(land || '').toUpperCase() === 'BE' ? 'BE' : 'NL';
  const placeholder = {
    straatEnNummer: 'Particulier (geen adres opgegeven)',
    postcode: '0000 AA',
    plaats: 'Onbekend'
  };
  let factuurAdres;
  if (landCode === 'NL') {
    factuurAdres = (await zoekAdres(postcode, huisnummer)) || placeholder;
  } else {
    const s = String(straat || '').trim();
    const p = String(plaats || '').trim();
    const pc = String(postcode || '').trim();
    factuurAdres = (s && p && pc) ? { straatEnNummer: s, postcode: pc, plaats: p } : placeholder;
  }

  const body = {
    // 'paid': de klant heeft al betaald, dus de factuur staat meteen op voldaan.
    status: 'paid',
    // Stabiele sleutel per klant, zodat Mollie dezelfde ontvanger herkent.
    recipientIdentifier: adres,
    recipient: {
      type: 'consumer',
      givenName: voornaam,
      familyName: achternaam || voornaam,
      email: adres,
      streetAndNumber: factuurAdres.straatEnNummer,
      postalCode: factuurAdres.postcode,
      city: factuurAdres.plaats,
      locale: landCode === 'BE' ? 'nl_BE' : 'nl_NL',
      country: landCode
    },
    lines: [
      {
        description: 'Power Profile™ trainingsrapport (Strava-analyse)',
        quantity: 1,
        vatRate: BTW_TARIEF,
        unitPrice: { currency: 'EUR', value: waarde }
      }
    ],
    vatScheme: 'standard',
    vatMode: 'inclusive',
    // paymentTerm bewust weggelaten: de factuur is al betaald (status 'paid'),
    // dus een betaaltermijn heeft geen functie. Mollie eist bovendien een
    // specifiek formaat dat een simpele '14' niet is (gaf 422), en optioneel
    // laten valt is de schoonste oplossing.
    paymentDetails: {
      source: BETALING_BRON,
      sourceReference: betaalId || ''
    },
    // Mollie mailt de factuur-PDF zelf naar de klant met dit onderwerp/bericht.
    emailDetails: {
      subject: 'Je factuur van Michel Kreder Coaching',
      body: 'Bedankt voor je aankoop. In de bijlage vind je de factuur van je Power Profile trainingsrapport. Sterke kilometers!'
    }
  };

  try {
    const r = await fetch(MOLLIE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        // Voorkomt een dubbele factuur als de webhook door Mollie opnieuw wordt
        // aangeroepen: dezelfde betaling -> dezelfde idempotency-key.
        'Idempotency-Key': `factuur-${betaalId || adres}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });

    const tekst = await r.text();
    let data = null;
    try { data = JSON.parse(tekst); } catch { /* geen JSON: waarschijnlijk een blokkade- of foutpagina */ }

    if (!r.ok) {
      const uitleg = (data && (data.detail || data.title))
        ? `${data.title || ''} ${data.detail || ''}`.trim()
        : `geen JSON terug, eerste stuk: ${tekst.replace(/\s+/g, ' ').slice(0, 200)}`;
      return { ok: false, status: r.status, tekst, fout: `Mollie gaf ${r.status}: ${uitleg}` };
    }

    return { ok: true, id: data.id, nummer: data.invoiceNumber || data.number || '' };
  } catch (e) {
    return { ok: false, fout: `Mollie onbereikbaar: ${e.message}` };
  }
}
