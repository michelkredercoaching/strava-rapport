// /api/betaling-webhook.js
// Mollie belt dit adres server-naar-server zodra een betaling binnen is.
// Bij status 'paid' levert het het Power Profile-rapport af (PDF naar de klant,
// interne verkoopmelding naar jou, koper naar Mailchimp). De feitelijke
// aflevering zit in lib/lever-rapport.js, zodat de GRATIS servicelink (€0, die
// Mollie overslaat) exact hetzelfde rapport kan versturen.
//
// Deze file houdt zich alleen bezig met het BETAAL-specifieke deel:
//   - de betaling verifiëren bij Mollie (we vertrouwen de webhook-body niet)
//   - terugbetalingen negeren
//   - ontdubbelen + locken (Redis) zodat één betaling niet dubbel afgeleverd wordt
//   - de eenmalige kortingslink als verzilverd markeren
//
// Vereist in Vercel: MOLLIE_API_KEY, RESEND_API_KEY
// Voor de nurture:   MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID, PP_TOKEN_SECRET
// Optioneel in Vercel: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// Voor Meta-tracking: META_CAPI_TOKEN  (optioneel META_PIXEL_ID; default 928014910335428)
// Vereist in package.json: "pdf-lib"
import crypto from 'node:crypto';
import { markeerKortingGebruikt } from '../lib/korting.js';
import { leverRapport, stuurMail, interneHtml, kapitaal, AFZENDER, INTERNE_MAIL } from '../lib/lever-rapport.js';
import { maakMollieFactuur } from '../lib/mollie-factuur.js';

// ===== REDIS (Upstash REST) — ontdubbeling & lock =====
// De Vercel-marketplace-koppeling van Upstash maakt variabelen met KV_-namen
// aan; een handmatige Upstash-koppeling gebruikt UPSTASH_-namen. We accepteren
// allebei, zodat het werkt ongeacht hoe de database is aangesloten.
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redisAan    = !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd) {
  if (!redisAan) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) { console.error('Redis fout:', r.status); return { ok: false }; }
    const j = await r.json();
    return { ok: true, result: j.result };
  } catch (e) { console.error('Redis exception:', e); return { ok: false }; }
}

async function alVerstuurd(id) {
  const r = await redis(['GET', `pp:done:${id}`]);
  return r.ok && r.result === '1';
}
async function markeerVerstuurd(id) {
  await redis(['SET', `pp:done:${id}`, '1', 'EX', '2592000']); // 30 dagen
}
async function pakLock(id) {
  const r = await redis(['SET', `pp:lock:${id}`, '1', 'NX', 'EX', '120']);
  if (!r.ok) return 'vrij';
  return r.result === 'OK' ? 'vrij' : 'bezig';
}
async function geefLockVrij(id) { await redis(['DEL', `pp:lock:${id}`]); }
async function magWaarschuwen(id) {
  const r = await redis(['SET', `pp:warned:${id}`, '1', 'NX', 'EX', '3600']);
  if (!r.ok) return true;
  return r.result === 'OK';
}

// ===== META CONVERSION API — server-side Purchase =====
// Stuurt de aankoop rechtstreeks naar Meta zodra de betaling 'paid' is, los van
// of de klant terugkeert op een bedankpagina (vangt iDEAL, net als de shop).
// Vuurt alleen als META_CAPI_TOKEN in Vercel staat. event_id = Mollie-betaal-id,
// zodat een eventuele browser-pixel op de funnel (die hetzelfde id moet gebruiken)
// niet dubbel telt. Dezelfde pixel als de shop -> alle conversies op één plek.
const META_PIXEL_ID = process.env.META_PIXEL_ID || '928014910335428';

function metaHash(v) {
  if (!v) return undefined;
  const s = String(v).trim().toLowerCase();
  return s ? crypto.createHash('sha256').update(s).digest('hex') : undefined;
}

async function stuurMetaPurchase(m, betaling, id) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return; // geen token = tracking uit

  const naamDelen = String(m.naam || '').trim().split(/\s+/).filter(Boolean);
  const fn   = naamDelen[0];
  const ln   = naamDelen.length > 1 ? naamDelen.slice(1).join(' ') : '';
  const land = (m.land && String(m.land).trim().length === 2) ? m.land : undefined;

  const userData = {};
  const em  = metaHash(m.email);    if (em)  userData.em = em;
  const fnh = metaHash(fn);         if (fnh) userData.fn = fnh;
  const lnh = metaHash(ln);         if (lnh) userData.ln = lnh;
  const ct  = metaHash(m.plaats);   if (ct)  userData.ct = ct;
  const zp  = metaHash(m.postcode); if (zp)  userData.zp = zp;
  const co  = metaHash(land);       if (co)  userData.country = co;

  const event = {
    event_name:       'Purchase',
    event_time:       Math.floor(Date.now() / 1000),
    event_id:         id,
    event_source_url: 'https://strava-rapport.michelkredercoaching.nl/',
    action_source:    'website',
    user_data:        userData,
    custom_data: {
      currency:     (betaling.amount && betaling.amount.currency) || 'EUR',
      value:        parseFloat((betaling.amount && betaling.amount.value) || '0'),
      content_name: 'Power Profile analyse',
      content_type: 'product'
    }
  };

  const r = await fetch(
    `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ data: [event] }),
      signal:  AbortSignal.timeout(10000)
    }
  );
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.events_received) {
    console.log('Meta CAPI Purchase OK:', id, '| received:', j.events_received);
  } else {
    console.error('Meta CAPI Purchase fout:', id, r.status, JSON.stringify(j));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');
  const id = (req.body && req.body.id) || (req.query && req.query.id);
  if (!id) return res.status(200).send('geen id');

  // 1) Verifieer de betaling bij Mollie (we vertrouwen de webhook-body niet).
  let betaling;
  try {
    const mr = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`, {
      headers:{ Authorization:`Bearer ${process.env.MOLLIE_API_KEY}` },
      signal: AbortSignal.timeout(15000)
    });
    betaling = await mr.json();
  } catch (err) {
    console.error('Mollie ophalen faalde:', err);
    return res.status(503).send('mollie onbereikbaar');
  }

  console.log('Webhook:', id, '| status:', betaling.status, '| email:', (betaling.metadata && betaling.metadata.email) || 'GEEN');
  if (betaling.status !== 'paid') return res.status(200).send('niet betaald');

  // ===== TERUGBETAALD? DAN NIKS DOEN =====
  // Mollie roept deze webhook óók aan bij statuswijzigingen van een refund;
  // de betaling blijft dan gewoon 'paid'. Zonder deze check wordt het rapport
  // dan opnieuw verstuurd — precies wat er bij Ed gebeurde (3 juli 2026).
  // Een (deels) terugbetaalde betaling is per definitie al lang afgehandeld.
  const terugbetaald = parseFloat((betaling.amountRefunded && betaling.amountRefunded.value) || '0');
  if (terugbetaald > 0) {
    console.log('Webhook: betaling is (deels) terugbetaald, geen actie', id);
    return res.status(200).send('terugbetaald - geen actie');
  }

  if (await alVerstuurd(id)) {
    console.log('Webhook: al verstuurd, skip', id);
    return res.status(200).send('al verstuurd');
  }

  if (await pakLock(id) === 'bezig') {
    console.log('Webhook: andere invocatie is bezig, later opnieuw', id);
    return res.status(503).send('bezig - retry');
  }

  try {
    const m = betaling.metadata || {};
    const naam = kapitaal(m.naam);
    const bedrag = betaling.amount && betaling.amount.value ? `€${betaling.amount.value}` : '—';

    // 2) Rapport afleveren (PDF + klantmail + interne mail + Mailchimp-nurture).
    const r = await leverRapport(m, { bedrag, id });

    // PDF mislukt → jou (max 1x/uur) waarschuwen en Mollie later laten retryen.
    if (!r.pdfOk) {
      if (await magWaarschuwen(id)) {
        await stuurMail({
          from: AFZENDER, to: INTERNE_MAIL,
          subject: `PDF MISLUKT - ${naam} - betaald maar geen rapport`,
          html: interneHtml(m, bedrag, id, false)
        });
      }
      return res.status(503).send('pdf mislukt - retry');
    }

    // Klantmail mislukt → Mollie later laten retryen (klant mag niet leeg blijven).
    if (m.email && !r.klantMailGelukt) {
      return res.status(503).send('klantmail mislukt - retry');
    }

    // 3) Succes → vastleggen zodat een latere retry niks dubbel doet.
    await markeerVerstuurd(id);

    // 3b) Meta Conversion API: aankoop server-side naar Meta melden (fail-safe:
    //     het rapport is al geleverd en de betaling al gemarkeerd, dus een
    //     Meta-fout mag hier niks blokkeren).
    try { await stuurMetaPurchase(m, betaling, id); }
    catch (e) { console.error('Meta CAPI wierp een fout (genegeerd):', e); }

    // 4) Servicekorting-link verzilveren: deze betaling is rond, dus het
    //    eenmalige linkje mag vanaf nu geweigerd worden.
    if (m.kortingId) await markeerKortingGebruikt(m.kortingId);

    // 5) Verkoopfactuur via Mollie Invoicing (vervangt de geblokkeerde
    //    WooCommerce-route; zie lib/woo-factuur.js). Mollie maakt de factuur-PDF,
    //    regelt nummering + btw + bedrijfsgegevens en mailt 'm naar de klant.
    //
    //    Bewust ACHTER een schakelaar (MOLLIE_FACTUUR='aan') én fail-safe: het
    //    rapport is hierboven al geleverd en de betaling is al gemarkeerd, dus
    //    een factuurfout mag niks blokkeren. Draait maar één keer per betaling
    //    (na deze regel is 'alVerstuurd' waar, dus een webhook-retry komt hier
    //    niet nog eens). Bij een fout krijg jij een interne mail om 'm handmatig
    //    in Mollie aan te maken. De Sales Invoice API is nog beta: zet 'm pas op
    //    'aan' nadat je Mollie Invoicing hebt ingericht en in testmode getest.
    if ((process.env.MOLLIE_FACTUUR || '').toLowerCase() === 'aan') {
      try {
        const f = await maakMollieFactuur({
          naam: m.naam,
          achternaam: m.achternaam,
          email: m.email,
          bedrag: (betaling.amount && betaling.amount.value) || '',
          betaalId: id,
          land: m.land,
          postcode: m.postcode,
          huisnummer: m.huisnummer,
          straat: m.straat,
          plaats: m.plaats
        });
        if (f.ok) {
          // Mollie mailt de factuur zelf naar de klant én BCC't 'm naar de
          // boekhouding (ingesteld in het Mollie-dashboard: Invoicing ->
          // E-mailinstellingen -> Standaard BCC). Dus hier hoeven we niks te doen.
          console.log('Mollie-factuur aangemaakt:', f.nummer || f.id, 'voor', id);
        } else {
          console.error('Mollie-factuur mislukt:', f.fout);
          await stuurMail({
            from: AFZENDER, to: INTERNE_MAIL,
            subject: `FACTUUR MISLUKT - ${naam} - maak handmatig aan in Mollie`,
            html: interneHtml(m, bedrag, id, true) +
              `<p style="font-family:Arial,sans-serif;color:#c0392b;margin-top:16px;">` +
              `Automatische Mollie-factuur mislukte: ${f.fout || 'onbekende fout'}. ` +
              `Het rapport is wél geleverd. Maak de factuur even handmatig aan in het Mollie-dashboard.</p>`
          });
        }
      } catch (e) {
        console.error('Mollie-factuur wierp een fout (genegeerd):', e);
      }
    }

    return res.status(200).send('ok');

  } finally {
    await geefLockVrij(id);
  }
}
