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

/**
 * Maakt de verkoopfactuur aan bij Mollie en laat 'm mailen naar de klant.
 *
 * Gooit nooit een fout omhoog: het rapport is op dit moment al geleverd, en een
 * storing aan de factuurkant mag die levering nooit alsnog laten mislukken.
 * Geeft { ok:true, id, nummer } terug, of { ok:false, status, fout, tekst }.
 *
 * @param {object} p
 * @param {string} p.naam       naam van de koper (uit de Mollie-metadata)
 * @param {string} p.email      e-mailadres van de koper
 * @param {string} p.bedrag     betaald bedrag INCL. btw, numeriek, bijv. '29.00'
 * @param {string} p.betaalId   Mollie betaling-id (tr_...), komt op de factuur
 */
export async function maakMollieFactuur({ naam, email, bedrag, betaalId }) {
  const KEY = process.env.MOLLIE_API_KEY;
  if (!KEY) return { ok: false, fout: 'MOLLIE_API_KEY ontbreekt in Vercel' };
  if (!email) return { ok: false, fout: 'geen e-mailadres bekend, factuur kan niet naar de klant' };

  // Bedrag normaliseren naar Mollie-formaat: twee decimalen, punt als scheiding.
  const bruto = Number(String(bedrag).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!(bruto > 0)) return { ok: false, fout: `ongeldig bedrag: ${bedrag}` };
  const waarde = bruto.toFixed(2);

  const { voornaam, achternaam } = splitNaam(naam);
  const adres = String(email).trim().toLowerCase();

  const body = {
    // 'paid': de klant heeft al betaald, dus de factuur staat meteen op voldaan.
    status: 'paid',
    // Stabiele sleutel per klant, zodat Mollie dezelfde ontvanger herkent.
    recipientIdentifier: adres,
    recipient: {
      // De funnel vraagt geen adres uit. Bij een bedrag <= EUR 100 mag een
      // vereenvoudigde factuur zonder klantadres (NL). We sturen daarom alleen
      // wat we hebben; Mollie's eigen bedrijfsgegevens staan al op de factuur.
      type: 'consumer',
      givenName: voornaam,
      familyName: achternaam || voornaam,
      email: adres,
      locale: 'nl_NL',
      country: 'NL'
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
    paymentTerm: '14',
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
