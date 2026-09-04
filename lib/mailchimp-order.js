// /lib/mailchimp-order.js
// Meldt een betaalde Power Profile-analyse als ecommerce-order bij Mailchimp,
// op de Keuzehulp-audience (list 71f21692e0) — dezelfde lijst als de win-back
// journey en de rest van de funnel-mails. Los van WooCommerce, want de
// Mollie-directe checkout maakt daar geen order in aan (zie pp-funnel-meettekort).
//
// Zonder dit ziet Mailchimp nooit een omzet-signaal voor analyse-kopers: elk
// campagne- en journeyrapport (zoals de win-back-mails) toont dan altijd €0,
// ook als de mail wél verkoopt. Store + product zijn eenmalig aangemaakt
// (store-id 'pp-analyse', product-id 'pp-analyse-rapport').
//
// Fail-safe: het rapport is al geleverd en de betaling al gemarkeerd voordat
// dit aangeroepen wordt, dus een fout hier mag niks blokkeren.
import crypto from 'node:crypto';

const MC_KEY   = process.env.MAILCHIMP_API_KEY;
const MC_DC    = MC_KEY ? MC_KEY.split('-')[1] : null;
const MC_LIST  = process.env.MAILCHIMP_LIST_ID || '71f21692e0';
const STORE_ID = 'pp-analyse';
const PRODUCT_ID = 'pp-analyse-rapport';
const VARIANT_ID = 'pp-analyse-rapport-std';

export async function stuurMailchimpOrder(m, betaling, id) {
  if (!MC_KEY || !MC_DC || !m.email) { console.log('Mailchimp-order overslaan (config/email mist)'); return; }

  const base = `https://${MC_DC}.api.mailchimp.com/3.0/ecommerce/stores/${STORE_ID}`;
  const auth = 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64');
  const email = String(m.email).toLowerCase();
  const customerId = crypto.createHash('md5').update(email).digest('hex');
  const bedrag = parseFloat((betaling.amount && betaling.amount.value) || '0');

  try {
    await fetch(`${base}/customers/${customerId}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: customerId,
        email_address: email,
        opt_in_status: false,
        first_name: m.naam || ''
      }),
      signal: AbortSignal.timeout(10000)
    });

    const orderRes = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        customer: { id: customerId, email_address: email, opt_in_status: false },
        currency_code: (betaling.amount && betaling.amount.currency) || 'EUR',
        order_total: bedrag,
        financial_status: 'paid',
        processed_at_foreign: new Date().toISOString(),
        lines: [{
          id: 'regel-1',
          product_id: PRODUCT_ID,
          product_variant_id: VARIANT_ID,
          quantity: 1,
          price: bedrag
        }]
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (orderRes.ok) {
      console.log('Mailchimp-order OK:', id, '| €' + bedrag);
    } else {
      console.error('Mailchimp-order fout:', orderRes.status, await orderRes.text());
    }
  } catch (e) {
    console.error('Mailchimp-order exception (genegeerd):', e);
  }
}
