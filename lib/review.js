// lib/review.js
// Review-moment (09-10-2026): vraag om een Google-review op een blij moment,
// via een pushbericht en een kaartje in de app. Eén keer per persoon; tikt
// iemand "Later", dan mag het na 45 dagen nog één keer.
// Aanleidingen: rompscore (steeg), rit (banden of kleding precies goed),
// lid (4 weken lid).

import { appMelding } from './app-melding.js';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const REVIEW_LINK = 'https://search.google.com/local/writereview?placeid=ChIJL4GVNwjOxUcRWIK_VY7woU0';

async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    const j = await r.json();
    return { ok: r.ok && !j.error, result: j.result };
  } catch { return { ok: false }; }
}
const sleutel = (e) => `app:review:${String(e).toLowerCase()}`;

export async function reviewStand(email) {
  const r = await redis(['GET', sleutel(email)]);
  try { return r.ok && r.result ? JSON.parse(r.result) : null; } catch { return null; }
}
// Open = gevraagd en nog niet geklikt of weggeklikt.
export async function reviewOpen(email) {
  const s = await reviewStand(email);
  return !!(s && s.status === 'gevraagd');
}

const TEKST = {
  rompscore: 'Je Rompscore ging omhoog, mooi werk! Zou je me willen helpen met een korte Google-review? Het kost je een minuut en helpt andere renners kiezen.',
  rit: 'Fijn dat je banden en kleding goed zaten vandaag. Zou je me willen helpen met een korte Google-review? Het kost je een minuut en helpt andere renners kiezen.',
  lid: 'Je bent nu een maand lid van de MKC-app. Zou je me willen helpen met een korte Google-review? Het kost je een minuut en helpt andere renners kiezen.'
};

export async function reviewMoment(email, aanleiding) {
  if (!email || !TEKST[aanleiding]) return false;
  const s = await reviewStand(email);
  if (s && (s.status === 'gevraagd' || s.status === 'geklikt')) return false;
  if (s && s.status === 'later' && Date.now() - Date.parse(s.op) < 45 * 86400000) return false;
  if (s && s.status === 'later' && s.tweede) return false;
  await redis(['SET', sleutel(email), JSON.stringify({ status: 'gevraagd', aanleiding, op: new Date().toISOString(), tweede: !!(s && s.status === 'later') })]);
  await appMelding(email, { soort: 'review', titel: 'Help je me met een review?', tekst: TEKST[aanleiding], link: '/app#review' });
  return true;
}

export async function reviewKeuze(email, keuze) {
  const s = (await reviewStand(email)) || {};
  if (!['geklikt', 'later'].includes(keuze)) return false;
  await redis(['SET', sleutel(email), JSON.stringify({ ...s, status: keuze, op: new Date().toISOString() })]);
  return true;
}
