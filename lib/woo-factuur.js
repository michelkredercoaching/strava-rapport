// /lib/woo-factuur.js
// Maakt na een betaalde Strava-analyse een AFGERONDE bestelling aan in
// WooCommerce. WordPress doet daarna de rest vanzelf: de plugin PDF Invoices &
// Packing Slips maakt er een factuur van met het volgende nummer uit dezelfde
// doorlopende reeks als de trainingsschema's, mailt die naar de klant, en de
// BCC-snippet stuurt een kopie naar de inbox van eAccounting.
//
// Waarom via WooCommerce en niet zelf een PDF maken? Omdat de nummering maar op
// ÉÉN plek mag ontstaan. Zodra Vercel eigen nummers zou uitdelen, loopt de reeks
// uit de pas met de schema's en klopt de boekhouding niet meer.
//
// Vereist in Vercel: WC_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET
// Optioneel:         WC_PRODUCT_ANALYSE (standaard 12131, het verborgen product
//                    "Strava-analyse" van €29 inclusief btw)

const WC_URL     = (process.env.WC_URL || 'https://michelkredercoaching.nl').replace(/\/+$/, '');
const KEY        = process.env.WC_CONSUMER_KEY;
const SECRET     = process.env.WC_CONSUMER_SECRET;
const PRODUCT_ID = Number(process.env.WC_PRODUCT_ANALYSE || 12131);

// De webshop rekent met prijzen INCLUSIEF btw; WooCommerce verwacht in de API
// het regelbedrag EXCLUSIEF btw en rekent de btw er zelf bij op.
const BTW = 1.21;

// De analyse vraagt geen achternaam uit, dus we splitsen wat Strava teruggeeft.
// Zonder naam wordt het 'Klant', want de factuur moet altijd iets tonen.
function splitNaam(naam) {
  const delen = String(naam || '').trim().split(/\s+/).filter(Boolean);
  if (delen.length === 0) return { voornaam: 'Klant', achternaam: '' };
  if (delen.length === 1) return { voornaam: delen[0], achternaam: '' };
  return { voornaam: delen[0], achternaam: delen.slice(1).join(' ') };
}

/**
 * Maakt de bestelling aan in WooCommerce.
 *
 * Gooit nooit een fout omhoog: de aanroeper heeft het rapport op dat moment al
 * geleverd, en een storing aan de WordPress-kant mag die levering nooit alsnog
 * laten mislukken. Bij een probleem komt dat terug als { ok:false, fout }.
 *
 * @param {object} p
 * @param {string} p.naam      naam van de koper (uit de Mollie-metadata)
 * @param {string} p.email     e-mailadres van de koper
 * @param {string} p.bedrag    betaald bedrag inclusief btw, bijv. '29.00'
 * @param {string} p.betaalId  Mollie-betaling-id, komt op de bestelling te staan
 * @param {string} [p.methode] betaalmethode van Mollie, bijv. 'ideal'
 */
export async function maakWooFactuur({ naam, email, bedrag, betaalId, methode }) {
  if (!KEY || !SECRET) {
    return { ok: false, fout: 'WC_CONSUMER_KEY of WC_CONSUMER_SECRET ontbreekt in Vercel' };
  }
  if (!email) {
    return { ok: false, fout: 'geen e-mailadres bekend, factuur kan niet naar de klant' };
  }

  const bruto = Number(bedrag);
  if (!(bruto > 0)) {
    return { ok: false, fout: `ongeldig bedrag: ${bedrag}` };
  }

  // Het werkelijk betaalde bedrag is leidend, niet de productprijs. Zo klopt de
  // factuur ook als er met een kortingslink minder is afgerekend.
  const exclBtw = (Math.round((bruto / BTW) * 100) / 100).toFixed(2);

  const { voornaam, achternaam } = splitNaam(naam);

  const bestelling = {
    status: 'completed',   // triggert de klantmail mét factuur-PDF als bijlage
    set_paid: true,
    currency: 'EUR',
    payment_method: 'mollie',
    payment_method_title: methode ? `${methode} via Mollie` : 'Mollie',
    transaction_id: betaalId || '',
    billing: {
      first_name: voornaam,
      last_name: achternaam,
      email: email,
      country: 'NL'
    },
    line_items: [
      { product_id: PRODUCT_ID, quantity: 1, total: exclBtw }
    ],
    customer_note: 'Strava-analyse, automatisch geboekt na betaling via de rapportpagina.',
    meta_data: [
      { key: '_mkc_mollie_betaling', value: betaalId || '' }
    ]
  };

  try {
    const r = await wooPost('/wp-json/wc/v3/orders', bestelling);

    if (!r.ok) {
      return { ok: false, fout: r.fout };
    }

    return { ok: true, orderId: r.data.id, nummer: r.data.number };

  } catch (e) {
    return { ok: false, fout: `WooCommerce onbereikbaar: ${e.message}` };
  }
}

// ===== LAAG ERONDER: het verzoek zelf =====
// Apart gehouden zodat /api/woo-test exact dezelfde route kan aflopen, inclusief
// dezelfde headers. Anders test je iets anders dan wat er in productie gebeurt.
export function wooHeaders() {
  const auth = Buffer.from(`${KEY}:${SECRET}`).toString('base64');
  return {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // Zonder herkenbare User-Agent zien firewalls als Cloudflare of Wordfence
    // een kaal serververzoek en blokkeren ze het soms met een HTML-pagina.
    'User-Agent': 'MKC-Vercel/1.0 (+https://rapport.michelkredercoaching.nl)'
  };
}

// Leest het antwoord ALTIJD eerst als tekst. Een firewall antwoordt met HTML en
// niet met JSON; door dat stukje mee te sturen zie je meteen wie er blokkeert in
// plaats van een nietszeggende 'onbekende fout'.
export async function wooVerzoek(pad, opties = {}) {
  const r = await fetch(`${WC_URL}${pad}`, {
    ...opties,
    headers: wooHeaders(),
    signal: AbortSignal.timeout(20000)
  });

  const tekst = await r.text();
  let data = null;
  try { data = JSON.parse(tekst); } catch { /* geen JSON: waarschijnlijk een blokkadepagina */ }

  if (!r.ok) {
    const uitleg = data && data.message
      ? data.message
      : `geen JSON terug, eerste stuk van het antwoord: ${tekst.replace(/\s+/g, ' ').slice(0, 200)}`;
    return { ok: false, status: r.status, tekst, fout: `WooCommerce gaf ${r.status}: ${uitleg}` };
  }

  return { ok: true, status: r.status, tekst, data };
}

async function wooPost(pad, body) {
  return wooVerzoek(pad, { method: 'POST', body: JSON.stringify(body) });
}
