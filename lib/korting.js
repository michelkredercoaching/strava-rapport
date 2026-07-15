// /lib/korting.js
// Persoonlijke, EENMALIGE kortingslinkjes voor service-gevallen (bv. mislukte
// analyse, klant had oude prijs). Zelfde principe als het tegoed-token: een
// HMAC-handtekening met PP_TOKEN_SECRET, dus de link bewijst zichzelf.
//
// Eenmaligheid: elk token krijgt een uniek ID. Of dat ID al verzilverd is,
// wordt bijgehouden in Upstash Redis (dezelfde als de webhook-ontdubbeling):
//   - /api/betaling checkt vóór het aanmaken van de betaling of het ID al
//     gebruikt is (kortingAlGebruikt)
//   - /api/betaling-webhook markeert het ID als gebruikt zodra de betaling
//     status 'paid' heeft (markeerKortingGebruikt)
// Is Redis onbereikbaar, dan laten we de betaling gewoon doorgaan (liever een
// dubbele korting in een zeldzaam randgeval dan een klant die niet kan betalen).
//
// Token-opbouw (base64url): "korting|<prijs>|<vervalt-ms>|<id>|<handtekening>"
import crypto from 'node:crypto';

const SECRET = process.env.PP_TOKEN_SECRET || '';

function handtekening(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
}

// Maakt een token voor een afwijkende prijs (hele euro's), standaard 14 dagen geldig.
// Prijs 0 = volledig gratis: de funnel slaat Mollie dan over en mailt het rapport
// direct (Mollie kan geen €0 verwerken). Zie /api/betaling.
export function maakKortingToken(prijsEuro, dagenGeldig = 14) {
  if (!SECRET) return null;
  const prijs = Number(prijsEuro);
  if (!Number.isFinite(prijs) || prijs < 0 || prijs > 29) return null;
  const dagen = Number(dagenGeldig);
  const exp = Date.now() + (Number.isFinite(dagen) && dagen > 0 ? dagen : 14) * 24 * 3600 * 1000;
  const id = crypto.randomBytes(6).toString('hex');
  const payload = `korting|${prijs.toFixed(2)}|${exp}|${id}`;
  return Buffer.from(`${payload}|${handtekening(payload)}`).toString('base64url');
}

// Controleert een token uit de funnel. Geeft terug:
//   { geldig: true,  prijs: 19, bedrag: '19.00', id: 'a1b2c3d4e5f6' }
//   { geldig: false, prijs: null, bedrag: null, id: null }
// Let op: dit controleert alleen de handtekening en houdbaarheid. Of de link
// al verzilverd is, check je apart met kortingAlGebruikt(id).
export function controleerKortingToken(token) {
  const ongeldig = { geldig: false, prijs: null, bedrag: null, id: null };
  if (!SECRET || !token || typeof token !== 'string' || token.length > 240) return ongeldig;
  let tekst;
  try { tekst = Buffer.from(token, 'base64url').toString('utf8'); } catch { return ongeldig; }
  const delen = tekst.split('|');
  if (delen.length !== 5 || delen[0] !== 'korting') return ongeldig;
  const [, prijsStr, expStr, id, sig] = delen;
  const goed = handtekening(`korting|${prijsStr}|${expStr}|${id}`);
  const a = Buffer.from(String(sig));
  const b = Buffer.from(goed);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return ongeldig;
  if (!/^\d+$/.test(expStr) || Date.now() > Number(expStr)) return ongeldig;
  if (!/^[0-9a-f]{12}$/.test(id)) return ongeldig;
  const prijs = Number(prijsStr);
  if (!Number.isFinite(prijs) || prijs < 0 || prijs > 29) return ongeldig;
  return { geldig: true, prijs, bedrag: prijs.toFixed(2), id };
}

// ===== Verzilvering bijhouden in Upstash Redis =====
// De Vercel-marketplace-koppeling van Upstash maakt variabelen met KV_-namen
// aan; een handmatige Upstash-koppeling gebruikt UPSTASH_-namen. We accepteren
// allebei, zodat het werkt ongeacht hoe de database is aangesloten.
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) { console.error('Redis fout (korting):', r.status); return { ok: false }; }
    const j = await r.json();
    return { ok: true, result: j.result };
  } catch (e) { console.error('Redis exception (korting):', e); return { ok: false }; }
}

// Is deze kortingslink al verzilverd? (bij twijfel/storing: nee → doorlaten)
export async function kortingAlGebruikt(id) {
  if (!id) return false;
  const r = await redis(['GET', `pp:korting:${id}`]);
  return r.ok && r.result === '1';
}

// Markeer de kortingslink als verzilverd (90 dagen bewaren — ruim langer dan
// een token ooit geldig is, daarna mag de sleutel weg).
export async function markeerKortingGebruikt(id) {
  if (!id) return;
  await redis(['SET', `pp:korting:${id}`, '1', 'EX', '7776000']);
}
