// lib/meta-capi.js
// Server-side Purchase naar Meta voor het MKC-app lidmaatschap (09-10-2026).
// Leden betalen rechtstreeks via Mollie, dus de pixel op de hoofdsite ziet die
// aankoop niet. Zelfde regels als api/betaling.js en api/betaling-webhook.js:
// alleen met expliciete marketingtoestemming uit de cookiebanner van de
// hoofdsite (CookieYes zet die cookie op .michelkredercoaching.nl, dus ook hier
// leesbaar). Geen keuze = geen toestemming. Vuurt alleen met META_CAPI_TOKEN.

import crypto from 'crypto';

const META_PIXEL_ID = process.env.META_PIXEL_ID || '928014910335428';

function leesCookie(kop, naam) {
  const m = String(kop || '').match(new RegExp('(?:^|;\\s*)' + naam + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function magMarketing(cookies) {
  const wp = leesCookie(cookies, 'wp_consent_marketing');
  if (wp) return wp === 'allow';
  const cy = leesCookie(cookies, 'cookieyes-consent');
  if (cy) return cy.indexOf('advertisement:yes') !== -1;
  return false;
}
function metaHash(v) {
  if (!v) return undefined;
  const s = String(v).trim().toLowerCase();
  return s ? crypto.createHash('sha256').update(s).digest('hex') : undefined;
}

// Bij de start van de betaling: toestemming plus fbp/fbc/IP/user agent.
// app: { meting: true/false/null, fbp, fbc } uit de eigen toestemmingsvraag in de app.
// Een keuze in de app gaat voor; zonder keuze geldt de cookiebanner van de hoofdsite.
export function browserContext(req, fbclid, app = {}) {
  const cookies = req.headers?.cookie || '';
  const mc = leesCookie(cookies, 'mkc_meting');
  const appKeuze = app.meting === true || app.meting === false ? app.meting : (mc === 'ja' ? true : mc === 'nee' ? false : null);
  if (appKeuze === false || (appKeuze !== true && !magMarketing(cookies))) return { toestemming: false };
  const schoon = (x, n) => String(x || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, n);
  let fbc = leesCookie(cookies, '_fbc') || schoon(app.fbc, 300);
  const klik = String(fbclid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 200);
  if (!fbc && klik) fbc = `fb.1.${Date.now()}.${klik}`;
  return {
    toestemming: true,
    fbp: leesCookie(cookies, '_fbp') || schoon(app.fbp, 120),
    fbc,
    ip: String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim(),
    ua: String(req.headers?.['user-agent'] || '').slice(0, 400)
  };
}

// In de webhook, bij een nieuwe aankoop (niet bij verlengingen).
export async function stuurPurchase({ ctx, email, naam, waarde, eventId, product, bronUrl }) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) { console.log('Meta Purchase overgeslagen:', eventId, '| geen META_CAPI_TOKEN'); return; }
  if (!ctx || ctx.toestemming !== true) {
    console.log('Meta Purchase overgeslagen:', eventId, ctx && ctx.toestemming === false ? '| marketingcookies geweigerd of nooit gevraagd' : '| geen browsercontext');
    return;
  }
  const userData = {};
  const em = metaHash(email); if (em) { userData.em = em; userData.external_id = em; }
  const delen = String(naam || '').trim().split(/\s+/).filter(Boolean);
  const fn = metaHash(delen[0]); if (fn) userData.fn = fn;
  const ln = metaHash(delen.slice(1).join(' ')); if (ln) userData.ln = ln;
  if (ctx.fbp) userData.fbp = ctx.fbp;
  if (ctx.fbc) userData.fbc = ctx.fbc;
  if (ctx.ip) userData.client_ip_address = ctx.ip;
  if (ctx.ua) userData.client_user_agent = ctx.ua;
  const event = {
    event_name: 'Purchase', event_time: Math.floor(Date.now() / 1000), event_id: eventId,
    event_source_url: bronUrl, action_source: 'website', user_data: userData,
    custom_data: { currency: 'EUR', value: Number(waarde) || 0, content_name: product, content_type: 'product' }
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [event] }), signal: AbortSignal.timeout(8000)
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.events_received) console.log('Meta Purchase OK |', product, '|', eventId, userData.fbc ? '(met klik-ID)' : '(zonder klik-ID)');
    else console.error('Meta Purchase fout |', product, '|', r.status, JSON.stringify(j).slice(0, 300));
  } catch (e) { console.error('Meta Purchase fout (genegeerd):', e.message); }
}
