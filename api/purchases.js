/* ============================================================
   /api/purchases.js — v3
   Strenger naamfilter: aanhef (Hr/Mw) en bank-initialen
   (J.P.M. / Ijpm / M.) worden overgeslagen. Alleen echte
   voornamen komen door. Liever minder popups dan rare namen.
   ============================================================ */

const PRODUCT_LABELS = {
  "strava": "Strava-analyse",
  "analyse": "Strava-analyse",
  "schema": "trainingsschema",
  "coaching": "1-op-1 coaching",
  "keuzehulp": "trainingsschema",
  "order": "trainingsschema" // hoofdsite-checkout geeft "Order X" mee
};

const MAX_ITEMS = 10;
const CACHE_SECONDS = 300;

// Aanhef en tussenvoegsels die nooit een voornaam zijn
const BLOCKLIST = new Set([
  "hr", "dhr", "mw", "mevr", "mevrouw", "meneer", "heer",
  "de", "van", "der", "den", "mr", "mrs", "ms", "dr", "fam"
]);

export default async function handler(req, res) {
  try {
    const keys = (process.env.MOLLIE_API_KEYS || process.env.MOLLIE_API_KEY || "")
      .split(",").map(k => k.trim()).filter(Boolean);
    if (!keys.length) {
      return res.status(500).json({ error: "MOLLIE_API_KEYS ontbreekt" });
    }

    const results = await Promise.all(keys.map(fetchPayments));
    let payments = results.flat().filter(p => p.status === "paid");
    payments.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

    const filter = String(req.query?.product || "").toLowerCase();

    const items = [];
    for (const p of payments) {
      const name = firstName(p);
      if (!name) continue; // geen bruikbare voornaam → overslaan

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

/* Voornaam bepalen — metadata heeft voorrang, want daar staat
   de naam die de klant zelf intypte. Banknamen (consumerName)
   bevatten vaak alleen initialen en vallen dan af. */
function firstName(p) {
  const candidates = [
    p.metadata?.voornaam,
    p.metadata?.name,
    p.metadata?.firstName,
    p.billingAddress?.givenName,
    p.details?.consumerName,
    p.details?.cardHolder
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    // Pak het eerste woord dat een echte voornaam lijkt
    const words = String(raw).trim().split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[^A-Za-zÀ-ÿ]/g, ""); // punten/cijfers weg
      if (clean.length < 3) continue;                // "M", "JP" → skip
      if (BLOCKLIST.has(clean.toLowerCase())) continue;
      if (!/[aeiouyàáäèéëìíïòóöùúü]/i.test(clean)) continue; // geen klinkers = initialen
      if (w.includes(".")) continue;                 // "J.P.M." → skip
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }
  }
  return null;
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
