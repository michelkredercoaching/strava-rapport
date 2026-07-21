// /api/woo-test.js
// Alleen voor jou (Michel): controleert of Vercel bij de WooCommerce-API kan.
// Aanroepen:
//
//   https://rapport.michelkredercoaching.nl/api/woo-test?sleutel=JOUW_ADMIN_SLEUTEL
//
// Doet exact hetzelfde verzoek als de factuurcode, maar dan alleen LEZEND: het
// haalt het product Strava-analyse op. Zo kun je een blokkade opsporen zonder
// elke keer een echte betaling te doen.
//
// Het toont de HTTP-status en het begin van het antwoord. Krijg je HTML terug in
// plaats van JSON, dan zit er een firewall (Cloudflare of Wordfence) tussen en
// staat in dat stukje HTML wie het verzoek tegenhoudt.
//
// Vereist in Vercel: ADMIN_SLEUTEL, WC_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET
import crypto from 'node:crypto';
import { wooVerzoek } from '../lib/woo-factuur.js';

function sleutelKlopt(gegeven, secret) {
  const a = Buffer.from(String(gegeven || ''));
  const b = Buffer.from(String(secret));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  const secret = process.env.ADMIN_SLEUTEL || '';
  const q = req.query || {};
  if (!secret || !sleutelKlopt(q.sleutel, secret)) return res.status(404).send('niet gevonden');

  const productId = Number(process.env.WC_PRODUCT_ANALYSE || 12131);

  // Alleen melden OF een variabele gevuld is, nooit de waarde zelf.
  const regels = [
    `WC_URL             : ${process.env.WC_URL || '(leeg, valt terug op michelkredercoaching.nl)'}`,
    `WC_CONSUMER_KEY    : ${process.env.WC_CONSUMER_KEY ? 'ingesteld' : 'ONTBREEKT'}`,
    `WC_CONSUMER_SECRET : ${process.env.WC_CONSUMER_SECRET ? 'ingesteld' : 'ONTBREEKT'}`,
    `Product-ID         : ${productId}`,
    ''
  ];

  try {
    const r = await wooVerzoek(`/wp-json/wc/v3/products/${productId}`);

    regels.push(`HTTP-status        : ${r.status}`);
    regels.push('');

    if (r.ok) {
      regels.push('GELUKT. Vercel mag bij de WooCommerce-API.');
      regels.push(`Product gevonden   : ${r.data && r.data.name} (${r.data && r.data.price})`);
    } else {
      regels.push('MISLUKT.');
      regels.push(r.fout);
      regels.push('');
      regels.push('--- eerste 1500 tekens van het antwoord ---');
      regels.push(String(r.tekst || '').slice(0, 1500));
    }
  } catch (e) {
    regels.push(`MISLUKT: ${e.message}`);
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(200).send(regels.join('\n'));
}
