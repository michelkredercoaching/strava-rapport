// lib/stat.js
// Gebruik van de MKC-app per dag (09-10-2026), voor Michels beheer: hoeveel
// mensen zaten er vandaag in de app en wat deden ze. Los van het lidmaatschap.
// Per dag (Nederlandse datum) per gebeurtenis een teller en een set unieke
// mensen. Bewaard 120 dagen. Michels eigen adressen tellen niet mee.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const BEWAAR = 120 * 86400;
const NIET_TELLEN = ['michel.kredercoaching@gmail.com', 'michel.kreder@gmail.com', 'info@michelkredercoaching.nl'];

// De gebeurtenissen, in de volgorde van het overzicht.
export const GEBEURTENISSEN = [
  ['open', 'App geopend'],
  ['nieuw', 'Nieuw account'],
  ['banden-gast', 'Bandenspanning zonder account'],
  ['banden-lead', 'Uitkomst gemaild (lead)'],
  ['banden', 'Bandenspanning (gratis)'],
  ['banden-slim', 'Bandenspanning (lid)'],
  ['kleding', 'Kledingadvies'],
  ['rit', 'Rit bewaard'],
  ['schema', 'Schema bekeken'],
  ['core-open', 'Core-app geopend'],
  ['core-sessie', 'Core-sessie gedaan'],
  ['coach', 'Coachvraag'],
  ['bandvraag', 'Bandenvraag'],
  ['analyse', 'Analyse bekeken'],
  ['deel', 'Ritkaart gedeeld'],
  ['groepsrit-maak', 'Groepsrit gepland'],
  ['groepsrit', 'Groepsrit-link geopend'],
  ['push-aan', 'Meldingen aangezet'],
  ['feedback', 'Feedback gegeven']
];
export const CLIENT_GEBEURTENISSEN = ['banden', 'kleding', 'schema', 'analyse', 'deel', 'groepsrit'];
export const GAST_GEBEURTENISSEN = ['banden-gast', 'banden-lead', 'deel', 'groepsrit'];

async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });
    if (!r.ok) return { ok: false };
    return { ok: true, result: (await r.json()).result };
  } catch { return { ok: false }; }
}
export const nlDag = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(d);

// Tel een gebeurtenis. Faalt stil: tellen mag de app nooit ophouden.
export async function tel(email, gebeurtenis) {
  try {
    email = String(email || '').toLowerCase();
    if (!email || NIET_TELLEN.includes(email)) return;
    if (!GEBEURTENISSEN.some(([k]) => k === gebeurtenis)) return;
    const dag = nlDag();
    await Promise.all([
      redis(['INCR', `stat:${dag}:${gebeurtenis}`]),
      redis(['SADD', `stat:${dag}:${gebeurtenis}:u`, email]),
      redis(['SADD', `stat:${dag}:actief`, email])
    ]);
    // Verlooptijd één keer per dag zetten is genoeg, maar dubbel kan geen kwaad.
    await Promise.all([
      redis(['EXPIRE', `stat:${dag}:${gebeurtenis}`, BEWAAR]),
      redis(['EXPIRE', `stat:${dag}:${gebeurtenis}:u`, BEWAAR]),
      redis(['EXPIRE', `stat:${dag}:actief`, BEWAAR])
    ]);
  } catch {}
}

// Overzicht van de laatste `dagen` dagen: per dag actieve mensen en per
// gebeurtenis het aantal keer en het aantal unieke mensen.
export async function overzicht(dagen = 14) {
  const lijst = [];
  for (let i = 0; i < dagen; i++) {
    const dag = nlDag(new Date(Date.now() - i * 86400000));
    const [actief, ...rest] = await Promise.all([
      redis(['SCARD', `stat:${dag}:actief`]),
      ...GEBEURTENISSEN.flatMap(([k]) => [redis(['GET', `stat:${dag}:${k}`]), redis(['SCARD', `stat:${dag}:${k}:u`])])
    ]);
    const per = {};
    GEBEURTENISSEN.forEach(([k], j) => { per[k] = { keer: Number(rest[j * 2].result) || 0, mensen: Number(rest[j * 2 + 1].result) || 0 }; });
    lijst.push({ dag, actief: Number(actief.result) || 0, per });
  }
  return { dagen: lijst, namen: GEBEURTENISSEN };
}
