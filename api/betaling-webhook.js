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
// Vereist in package.json: "pdf-lib"
import { markeerKortingGebruikt } from '../lib/korting.js';
import { leverRapport, stuurMail, interneHtml, kapitaal, AFZENDER, INTERNE_MAIL } from '../lib/lever-rapport.js';
import { maakWooFactuur } from '../lib/woo-factuur.js';

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
// Zorgt dat er per betaling hoogstens één bestelling in WooCommerce ontstaat,
// ook als deze functie ooit twee keer tegelijk zou draaien. Zonder Redis laten
// we het gewoon toe: een ontbrekende factuur is vervelender dan een dubbele.
async function magFactureren(id) {
  const r = await redis(['SET', `pp:woo:${id}`, '1', 'NX', 'EX', '2592000']); // 30 dagen
  if (!r.ok) return true;
  return r.result === 'OK';
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

    // 4) Servicekorting-link verzilveren: deze betaling is rond, dus het
    //    eenmalige linkje mag vanaf nu geweigerd worden.
    if (m.kortingId) await markeerKortingGebruikt(m.kortingId);

    // 5) Factuur: bestelling aanmaken in WooCommerce, zodat WordPress er een
    //    PDF-factuur van maakt met het volgende nummer uit dezelfde reeks als de
    //    trainingsschema's. Dit gebeurt bewust ALS LAATSTE en zonder de levering
    //    te blokkeren: het rapport is hier al bij de klant. Gaat het mis, dan
    //    krijg jij een mail zodat je de factuur handmatig kunt maken.
    if (await magFactureren(id)) {
      const f = await maakWooFactuur({
        naam: m.naam,
        email: m.email,
        bedrag: betaling.amount && betaling.amount.value,
        betaalId: id,
        methode: betaling.method
      });

      if (f.ok) {
        console.log('WooCommerce-bestelling aangemaakt:', f.nummer, '| betaling:', id);
      } else {
        console.error('WooCommerce-factuur mislukt:', f.fout, '| betaling:', id);
        await stuurMail({
          from: AFZENDER, to: INTERNE_MAIL,
          subject: `FACTUUR MISLUKT - ${naam} - handmatig aanmaken`,
          html: `<p>De betaling van <strong>${naam}</strong> (${m.email || 'geen e-mail'}) van ${bedrag} is gelukt en het rapport is verstuurd, maar de bestelling in WooCommerce aanmaken lukte niet.</p>
                 <p><strong>Reden:</strong> ${f.fout}</p>
                 <p><strong>Mollie-betaling:</strong> ${id}</p>
                 <p>Maak de factuur handmatig aan in WooCommerce, anders ontbreekt hij straks in de boekhouding.</p>`
        });
      }
    }

    return res.status(200).send('ok');

  } finally {
    await geefLockVrij(id);
  }
}
