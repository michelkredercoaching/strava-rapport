// /api/hervat.js
// Haalt een eerder bewaarde analyse terug voor de hervat-link uit de
// verlaten-mails (?hervat=<id> op de funnelpagina). Het id is 24 tekens
// willekeurige hex uit /api/lead en alleen bekend via de mail van de
// eigenaar; de blob zelf is bovendien versleuteld (seal), dus hier lekt
// geen leesbare trainingsdata.
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
    if (!r.ok) { console.error('Redis fout (hervat):', r.status); return { ok: false }; }
    const j = await r.json();
    return { ok: true, result: j.result };
  } catch (e) { console.error('Redis exception (hervat):', e); return { ok: false }; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = String((req.query && req.query.id) || '');
  if (!/^[0-9a-f]{16,48}$/.test(id)) {
    return res.status(400).json({ error: 'Ongeldig id' });
  }

  const r = await redis(['GET', `pp:hervat:${id}`]);
  if (!r.ok || !r.result) {
    return res.status(404).json({ error: 'Niet gevonden of verlopen' });
  }

  let data;
  try { data = JSON.parse(r.result); } catch (e) {
    return res.status(404).json({ error: 'Niet gevonden of verlopen' });
  }

  return res.status(200).json({
    pv: data.pv || {},
    blob: data.blob || '',
    email: data.email || ''
  });
}
