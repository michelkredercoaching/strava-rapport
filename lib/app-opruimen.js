// lib/app-opruimen.js
// Appgegevens wissen na een jaar niet actief (09-10-2026), zoals beloofd in de
// privacyverklaring (#app): "Ben je een jaar niet meer actief geweest, of vraag
// je erom, dan verwijderen we ze. Betaal- en factuurgegevens bewaren we 7 jaar."
//
// Activiteit: elke keer dat iemand de app of de Core-app opent komt er een
// tijdstempel in de sorted set app:actief (meld(email)). De wekelijkse cron
// wist de appgegevens van wie langer dan 365 dagen niets deed.
//
// Wat weg gaat: bandenprofiel, ritten, coachgesprek, meldingen, push-adres, het
// schema-kopje (als het schema al afgelopen is) en zijn regels in de lijsten
// voor Michel (coach-antwoorden nakijken, medische opvolging).
// Wat blijft: lid:<email> (lidmaatschap, akkoord, factuuradres: bewaarplicht),
// Mollie en de facturen zelf. Core-dossiers verlopen al vanzelf 400 dagen na de
// laatste activiteit (api/core.js BEWAAR_S).
// Nooit gewist: wie nog toegang heeft (lid, coaching of een lopend schema).

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const JAAR = 365 * 86400000;

async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    const j = await r.json();
    return { ok: r.ok && !j.error, result: j.result };
  } catch { return { ok: false }; }
}
const json = (r) => { try { return r.ok && r.result ? JSON.parse(r.result) : null; } catch { return null; } };

// Bij elke keer openen: laatste activiteit bijwerken.
export async function meld(email) {
  email = String(email || '').toLowerCase();
  if (email) await redis(['ZADD', 'app:actief', String(Date.now()), email]);
}

// Lijst voor Michel: regels van dit mailadres eruit halen.
async function uitLijst(sleutel, email) {
  const l = await redis(['LRANGE', sleutel, '0', '-1']);
  const alles = (l.ok && l.result) || [];
  const blijft = alles.filter((x) => { try { return String(JSON.parse(x).email || '').toLowerCase() !== email; } catch { return true; } });
  if (blijft.length === alles.length) return 0;
  await redis(['DEL', sleutel]);
  for (let i = 0; i < blijft.length; i += 50) await redis(['RPUSH', sleutel, ...blijft.slice(i, i + 50)]);
  return alles.length - blijft.length;
}

// Heeft iemand nog toegang? Dan nooit wissen.
async function heeftToegang(email) {
  const lid = json(await redis(['GET', `lid:${email}`]));
  if (lid && lid.tot && Date.parse(lid.tot) > Date.now()) return true;
  if (lid && lid.subscriptionId && lid.status !== 'opgezegd') return true;
  const c = await redis(['SISMEMBER', 'lid:coaching', email]);
  if (c.ok && c.result === 1) return true;
  const s = json(await redis(['GET', `schema:${email}`]));
  const h = s && s.huidig;
  if (h && h.start && h.weken && Date.parse(h.start + 'T00:00:00Z') + (h.weken * 7 + 30) * 86400000 > Date.now()) return true;
  return false;
}

// Alle appgegevens van één persoon wissen (cron, of op verzoek via Beheer).
export async function wisPersoon(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { ok: false };
  const sleutels = [`app:banden:${email}`, `app:bandenritten:${email}`, `app:coach:${email}`, `app:push:${email}`, `app:meldingen:${email}`, `schema:${email}`];
  let weg = 0;
  for (const k of sleutels) { const r = await redis(['DEL', k]); if (r.ok) weg += Number(r.result) || 0; }
  await redis(['SREM', 'app:push:alle', email]);
  const regels = (await uitLijst('app:antwoorden', email)) + (await uitLijst('opvolgen:medisch', email));
  await redis(['ZREM', 'app:actief', email]);
  return { ok: true, sleutels: weg, regels };
}

// Wie nog niet in app:actief staat (van voor deze teller) krijgt 'nu' als start,
// zodat niemand meteen gewist wordt en iedereen een vol jaar krijgt.
async function aanvullen() {
  const emails = new Set();
  for (const set of ['lid:alle', 'app:push:alle', 'lid:schema', 'lid:coaching']) {
    const r = await redis(['SMEMBERS', set]); for (const e of (r.ok && r.result) || []) emails.add(String(e).toLowerCase());
  }
  for (const patroon of ['app:banden:*', 'app:coach:*', 'app:meldingen:*', 'schema:*']) {
    let cursor = '0', rondes = 0;
    do {
      const r = await redis(['SCAN', cursor, 'MATCH', patroon, 'COUNT', '500']);
      if (!r.ok || !Array.isArray(r.result)) break;
      cursor = String(r.result[0]);
      for (const k of r.result[1] || []) { const e = k.slice(k.lastIndexOf(':') + 1); if (e.includes('@')) emails.add(e.toLowerCase()); }
    } while (cursor !== '0' && ++rondes < 200);
  }
  const nu = String(Date.now());
  const lijst = [...emails];
  for (let i = 0; i < lijst.length; i += 100) await redis(['ZADD', 'app:actief', 'NX', ...lijst.slice(i, i + 100).flatMap((e) => [nu, e])]);
  return lijst.length;
}

// De wekelijkse ronde. proef: alleen tellen, niets wissen.
export async function opruimen({ proef = false } = {}) {
  const bekend = await aanvullen();
  const r = await redis(['ZRANGEBYSCORE', 'app:actief', '0', String(Date.now() - JAAR), 'LIMIT', '0', '200']);
  const oud = (r.ok && r.result) || [];
  let gewist = 0, overgeslagen = 0;
  for (const email of oud) {
    if (await heeftToegang(email)) { overgeslagen++; await redis(['ZADD', 'app:actief', String(Date.now() - JAAR + 30 * 86400000), email]); continue; }
    if (!proef) await wisPersoon(email);
    gewist++;
  }
  return { ok: true, proef, bekend, oud: oud.length, gewist, overgeslagen };
}
