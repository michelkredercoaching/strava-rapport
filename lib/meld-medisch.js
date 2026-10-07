// /lib/meld-medisch.js
// Seintje aan Michel zodra iemand van een coach (MKC-coach in de app, of de
// Core-coach) het medische antwoord krijgt: "laat het checken door je arts of
// fysio". Dan kan Michel zelf contact opnemen. 07-10-2026.
//
// Doet twee dingen:
//   1. mail naar Michel met de vraag, wie het is en een kant-en-klaar antwoord
//      (mailto-knop met tekst erin), en bij Core-deelnemers de link naar het
//      coachscherm, waar hij in de app kan reageren
//   2. zet het op de opvolglijst in Redis (opvolgen:medisch), zodat de
//      coach-app straks een overzicht kan tonen met wat nog open staat
// Maximaal één mail per persoon per 6 uur, zodat een paar vragen achter elkaar
// geen stapel mails geeft. Fail-safe: een fout hier mag het antwoord aan de
// klant nooit tegenhouden.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const NAAR        = 'michel.kredercoaching@gmail.com';
const AFZENDER    = 'MKC-app <michel@michelkredercoaching.nl>';
const COACHSCHERM = 'https://rapport.michelkredercoaching.nl/coach-afval?programma=core';

async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return { ok: false };
    return { ok: true, result: (await r.json()).result };
  } catch { return { ok: false }; }
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// bron: 'mkc-coach' of 'core-coach'. extra: korte regel met wat we van de
// persoon weten (bv. "Core blok 1 week 3, klachten: onderrug").
export async function meldMedisch({ email, naam, bron, vraag, extra, coreId }) {
  try {
    if (!email) return;
    const op = new Date().toISOString();
    await redis(['LPUSH', 'opvolgen:medisch', JSON.stringify({ email, naam: naam || '', bron, vraag: String(vraag || '').slice(0, 600), extra: extra || '', coreId: coreId || null, op, status: 'open' })]);
    await redis(['LTRIM', 'opvolgen:medisch', '0', '199']);

    const rem = await redis(['SET', `opvolgen:medisch:rem:${email}`, '1', 'NX', 'EX', String(6 * 3600)]);
    if (rem.ok && rem.result !== 'OK') return;
    if (!RESEND_KEY) return;

    const voornaam = String(naam || '').trim().split(' ')[0];
    const waar = bron === 'core-coach' ? 'de Core-coach' : 'de MKC-coach in de app';
    const onderwerp = `Medische vraag: ${voornaam || email} via ${bron === 'core-coach' ? 'Core-coach' : 'MKC-coach'}`;
    const conceptTekst = `Hoi${voornaam ? ' ' + voornaam : ''},\n\nIk zag je vraag in de app voorbij komen en wilde even persoonlijk reageren. Goed dat je het hebt aangegeven.\n\nHoe gaat het nu? Heb je het al kunnen laten checken bij je huisarts of fysio?\n\nLaat maar even weten wat er uitkomt, dan kijken we samen hoe je je training daarop aanpast.\n\nSportieve groet,\nMichel`;
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Even over je vraag in de app')}&body=${encodeURIComponent(conceptTekst)}`;
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
      <p><b>${esc(voornaam || 'Iemand')}</b> (${esc(email)}) kreeg net van ${waar} het advies om het te laten checken door een arts of fysio.</p>
      <p style="margin:0 0 4px;color:#777;font-size:13px">De vraag</p>
      <blockquote style="margin:0 0 14px;padding:10px 14px;background:#f5f3ef;border-left:3px solid #ff6b1a">${esc(vraag)}</blockquote>
      ${extra ? `<p style="color:#555;font-size:14px">${esc(extra)}</p>` : ''}
      <p style="margin:22px 0 10px"><a href="${mailto}" style="background:#ff6b1a;color:#0a0a0a;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:700">Mail ${esc(voornaam || 'deze renner')} (tekst staat klaar)</a></p>
      ${coreId ? `<p><a href="${COACHSCHERM}" style="color:#ff6b1a">Of reageer in de Core-app via je coachscherm</a></p>` : ''}
      <p style="color:#777;font-size:13px">De renner kreeg het vaste veilige antwoord, geen AI-advies. Er is niets beloofd over contact, dus jij bepaalt of en hoe je reageert. Een nieuwe vraag van deze persoon binnen 6 uur geeft geen extra mail, maar staat wel op je opvolglijst.</p></div>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AFZENDER, to: [NAAR], reply_to: email, subject: onderwerp, html }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) { console.error('meldMedisch mislukt (genegeerd):', e); }
}
