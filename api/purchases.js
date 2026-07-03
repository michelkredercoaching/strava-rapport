/* ============================================================
   /api/purchases.js — Vercel serverless function (v2)
   ------------------------------------------------------------
   Haalt betaalde bestellingen op bij Mollie — uit ÉÉN of
   MEERDERE Mollie-profielen — en geeft alleen voornaam +
   product + relatieve tijd terug. AVG-vriendelijk.

   Installatie:
   1. Dit bestand in de map /api van je Vercel-repo
   2. Environment Variables (Vercel dashboard):
      MOLLIE_API_KEYS = live_key1,live_key2
      (één key? gewoon één invullen, zonder komma)
   3. Test: https://strava-analyse.michelkredercoaching.nl/api/purchases

   Optioneel filteren per pagina:
   /api/purchases?product=schema  → alleen schema-bestellingen
   /api/purchases?product=analyse → alleen analyses
   ============================================================ */

const PRODUCT_LABELS = {
  "strava": "Strava-analyse",
  "analyse": "Strava-analyse",
  "schema": "trainingsschema",
  "coaching": "1-op-1 coaching",
  "keuzehulp": "trainingsschema"
};

const MAX_ITEMS = 10;
const CACHE_SECONDS = 300;

export default async function handler(req, res) {
  try {
    const keys = (process.env.MOLLIE_API_KEYS || process.env.MOLLIE_API_KEY || "")
      .split(",").map(k => k.trim()).filter(Boolean);
    if (!keys.length) {
      return res.status(500).json({ error: "MOLLIE_API_KEYS ontbreekt" });
    }

    // Alle profielen parallel ophalen en samenvoegen
    const results = await Promise.all(keys.map(fetchPayments));
    let payments = results.flat().filter(p => p.status === "paid");

    // Nieuwste eerst (over beide profielen heen)
    payments.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

    // Optioneel filter: ?product=schema of ?product=analyse
    const filter = String(req.query?.product || "").toLowerCase();

    const items = [];
    for (const p of payments) {
      const name = firstName(p);
      if (!name) continue;

      const label = productLabel(p.description || "");
      if (filter && !label.toLowerCase().includes(filter) &&
          !(p.description || "").toLowerCase().includes(filter)) continue;

      items.push({ name, product: label, when: relativeTime(p.paidAt) });
      if (items.length >= MAX_ITEMS) break;
    }

    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ error: "Er ging iets mis" });
  }
}

async function fetchPayments(key) {
  try {
    const r = await fetch("https://api.mollie.com/v2/payments?limit=50", {
      headers: { Authorization: "Bearer " + key }
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data?._embedded?.payments || [];
  } catch {
    return [];
  }
}

function firstName(p) {
  const raw =
    p.metadata?.name ||
    p.details?.consumerName ||
    p.details?.cardHolder ||
    p.billingAddress?.givenName ||
    "";
  const first = String(raw).trim().split(/\s+/)[0];
  if (!first || first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function productLabel(description) {
  const d = description.toLowerCase();
  for (const key of Object.keys(PRODUCT_LABELS)) {
    if (d.includes(key)) return PRODUCT_LABELS[key];
  }
  return description || "een bestelling";
}

function relativeTime(paidAt) {
  if (!paidAt) return "onlangs";
  const days = Math.floor((Date.now() - new Date(paidAt)) / 86400000);
  if (days <= 0) return "vandaag";
  if (days === 1) return "gisteren";
  if (days <= 7) return "deze week";
  return "onlangs";
}
