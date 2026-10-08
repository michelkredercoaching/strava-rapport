// lib/app-melding.js
// Meldingen in de MKC-app (09-10-2026, besluit Michel: "binnen de app houden").
// Elke melding komt in een lijstje bij de klant (Redis app:meldingen:<email>,
// max 20) en verschijnt bovenaan in de app tot hij hem wegtikt. Heeft iemand
// pushberichten aan, dan komt hij ook als pushbericht op de telefoon.
// Geen mail meer: dat spaart Resend (gratis = 100 per dag).
//
// Soorten: 'core' (maandagherinnering Core-app). Per soort kan de klant de
// push uitzetten (app:push:<email> veld core: false); de melding in de app
// blijft dan gewoon staan.

import crypto from 'node:crypto';
import { stuurPush } from './webpush.js';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const MAX = 20;
const BEWAAR_DAGEN = 14;

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
const sleutel = (email) => `app:meldingen:${String(email).toLowerCase()}`;

async function lijst(email) {
  const r = await redis(['LRANGE', sleutel(email), 0, MAX - 1]);
  return ((r.ok && r.result) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
}

// Zet een melding klaar en probeer hem als pushbericht te sturen.
export async function appMelding(email, { soort = 'algemeen', titel, tekst = '', link = '/app' }) {
  const m = { id: crypto.randomBytes(5).toString('hex'), soort, titel: String(titel).slice(0, 120), tekst: String(tekst).slice(0, 400), link, op: new Date().toISOString() };
  // Eén openstaande melding per soort: de nieuwe vervangt de oude.
  const oud = (await lijst(email)).filter((x) => x.soort !== soort || x.gelezen);
  await redis(['DEL', sleutel(email)]);
  for (const x of [m, ...oud].slice(0, MAX).reverse()) await redis(['LPUSH', sleutel(email), JSON.stringify(x)]);
  let push = false;
  const pr = await redis(['GET', `app:push:${String(email).toLowerCase()}`]);
  let p = null; try { p = pr.ok && pr.result ? JSON.parse(pr.result) : null; } catch {}
  if (p && p.sub && p[soort] !== false) {
    const r = await stuurPush(p.sub, { title: m.titel, body: m.tekst, url: link, tag: 'mkc-' + soort });
    if (r.weg) { await redis(['DEL', `app:push:${String(email).toLowerCase()}`]); await redis(['SREM', 'app:push:alle', String(email).toLowerCase()]); }
    push = !!r.ok;
  }
  return { ok: true, push };
}

// Openstaande meldingen voor de app (niet weggetikt, niet ouder dan 14 dagen).
export async function haalMeldingen(email) {
  const grens = Date.now() - BEWAAR_DAGEN * 86400000;
  return (await lijst(email)).filter((m) => !m.gelezen && Date.parse(m.op) > grens).map(({ id, soort, titel, tekst, link, op }) => ({ id, soort, titel, tekst, link, op }));
}

// Weggetikt: markeren als gelezen.
export async function leesMelding(email, id) {
  const l = await lijst(email);
  let raak = false;
  for (const m of l) if (id === 'alle' || m.id === id) { m.gelezen = true; raak = true; }
  if (!raak) return false;
  await redis(['DEL', sleutel(email)]);
  for (const x of l.slice().reverse()) await redis(['LPUSH', sleutel(email), JSON.stringify(x)]);
  return true;
}
