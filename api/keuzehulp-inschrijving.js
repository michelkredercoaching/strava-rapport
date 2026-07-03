// /api/keuzehulp-inschrijving.js
// Ontvangt de keuzehulp-inschrijving vanaf michelkredercoaching.nl/trainingsschema-keuzehulp
// en zet het contact in Mailchimp via de API (in plaats van het gewone inschrijfformulier).
//
// Waarom: de welkomst-journey met trigger "meldt zich aan" vuurt alleen bij NIEUWE
// contacten. Dit endpoint werkt met een tag: het verwijdert de tag 'keuzehulp-gedaan'
// en zet hem daarna opnieuw. Een journey met trigger "tag toegevoegd: keuzehulp-gedaan"
// (en herhalen toegestaan) gaat dan af voor iedereen — nieuw én bestaand.
//
// Vereist in Vercel (staan er al voor de betaling-webhook):
//   MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID
import crypto from 'node:crypto';

const MC_KEY  = process.env.MAILCHIMP_API_KEY;      // ...-usXX
const MC_LIST = process.env.MAILCHIMP_LIST_ID;
const MC_DC   = MC_KEY ? MC_KEY.split('-')[1] : null;

const TAG = 'keuzehulp-gedaan';

// Alleen de eigen sites mogen dit endpoint vanuit de browser aanroepen.
const TOEGESTANE_ORIGINS = [
  'https://michelkredercoaching.nl',
  'https://www.michelkredercoaching.nl',
];

function zetCors(req, res) {
  const origin = req.headers.origin || '';
  if (TOEGESTANE_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  zetCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, fout: 'alleen POST' });
  if (!MC_KEY || !MC_LIST || !MC_DC) {
    console.error('Keuzehulp: Mailchimp-config ontbreekt');
    return res.status(500).json({ ok: false, fout: 'configuratie ontbreekt' });
  }

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, fout: 'ongeldig e-mailadres' });
  }

  const hash = crypto.createHash('md5').update(email).digest('hex');
  const base = `https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST}`;
  const auth = 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64');
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };

  // Merge-velden: alleen meesturen wat is ingevuld, zodat we bestaande
  // waarden niet per ongeluk leegmaken bij een tweede inschrijving.
  const merge = {};
  if (b.naam)       merge.FNAME     = String(b.naam).trim().replace(/\b\p{L}/gu, c => c.toUpperCase());
  if (b.schema)     merge.SCHEMA    = String(b.schema);
  if (b.schemaUrl)  merge.SCHURL    = String(b.schemaUrl);
  if (b.registratie) merge.REGISTR  = String(b.registratie);
  if (b.ftpkennis)  merge.FTPKENNIS = String(b.ftpkennis);
  if (b.meetmethode) merge.MEETMETH = String(b.meetmethode);

  try {
    // 1) Contact toevoegen of bijwerken (PUT = upsert).
    const lid = await fetch(`${base}/members/${hash}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        email_address: email,
        status_if_new: 'subscribed',
        ...(Object.keys(merge).length ? { merge_fields: merge } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!lid.ok) {
      const detail = await lid.text().catch(() => '');
      console.error('Keuzehulp: lid upsert faalde:', lid.status, detail);
      return res.status(502).json({ ok: false, fout: 'mailchimp weigerde het adres' });
    }

    // 2) Tag eerst weghalen... (alleen een NIEUW geplaatste tag triggert de journey)
    await fetch(`${base}/members/${hash}/tags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tags: [{ name: TAG, status: 'inactive' }] }),
      signal: AbortSignal.timeout(10000),
    });

    // 3) ...en daarna opnieuw zetten → journey "tag toegevoegd" gaat af.
    await fetch(`${base}/members/${hash}/tags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tags: [{ name: TAG, status: 'active' }] }),
      signal: AbortSignal.timeout(10000),
    });

    console.log('Keuzehulp OK:', email, '| schema:', b.schema || '-');
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Keuzehulp: Mailchimp faalde:', e);
    return res.status(502).json({ ok: false, fout: 'mailchimp niet bereikbaar' });
  }
}
