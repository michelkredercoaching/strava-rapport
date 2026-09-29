// /api/betaling.js
import crypto from 'node:crypto';
import { huidigePrijs } from '../lib/prijs.js';
import { unseal } from '../lib/gate.js';
import { controleerKortingToken, kortingAlGebruikt, markeerKortingGebruikt } from '../lib/korting.js';
import { leverRapport } from '../lib/lever-rapport.js';

// ===== META-BROWSERCONTEXT (voor de Conversions API) =====
// Het Purchase-event naar Meta gaat de deur uit vanuit /api/betaling-webhook.js,
// en die draait op een aanroep van Mollie's server. Daar is geen browser: geen
// cookies, geen IP, geen user agent. Juist die velden bepalen of Meta de aankoop
// aan een echt profiel kan koppelen; zonder ze kwam de Event Match Quality op
// dit account eerder op 0,0 uit en telde Meta de aankopen niet mee.
//
// Hier, bij het aanmaken van de betaling, zit de bezoeker er nog wél achter. We
// leggen zijn browsercontext daarom nu vast in Redis onder het Mollie-betaal-ID,
// zodat de webhook 'm straks kan ophalen. Bewust NIET in de Mollie-metadata:
// die zit al tegen de limiet van ~1 kB aan.
//
// De _fbp/_fbc-cookies zijn hier leesbaar omdat de Meta-pixel ze op het hele
// domein .michelkredercoaching.nl zet, dus ook op dit subdomein.
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
    if (!r.ok) { console.error('Redis fout:', r.status); return { ok: false }; }
    return { ok: true, result: (await r.json()).result };
  } catch (e) { console.error('Redis exception:', e); return { ok: false }; }
}

// ===== AL BETAALD IN DE WEBSHOP? =====
// Wie het analyse-product (12131) in de webshop koopt, krijgt per mail een
// persoonlijke link met ?korting= waarmee het rapport hier €0 is. Gebruikt hij
// die link niet, maar komt hij zelf naar de funnel, dan zag de funnel een
// gewone bezoeker en vroeg opnieuw €29. Dat overkwam order #280 op 29-09-2026:
// betaald om 15:34, link gemaild om 15:34, en toch stond hij aan het eind
// weer voor een betaalscherm.
//
// Dat gebeurt makkelijker dan je denkt. Het token wordt in localStorage
// bewaard, en dat overleeft de Strava-omweg alleen binnen dezelfde browser.
// Opent iemand de mail in de Gmail-app en start Strava daarna in Safari, dan
// is het token weg.
//
// Deze controle kijkt daarom naar het E-MAILADRES in plaats van naar het
// token. Bron is de Mailchimp-store 'pp-analyse', waar elke betaalde analyse
// in staat. De WooCommerce-bestellingen hebben daar een id dat met 'woo-'
// begint, en dat is precies de groep waarbij het rapport nog NIET is geleverd:
// een Mollie-directe aankoop (tr_...) kreeg zijn rapport al bij het afrekenen.
//
// WooCommerce zelf kunnen we hier niet bevragen; Cloudflare blokkeert die API
// vanaf Vercel. Mailchimp wel, en die sleutel staat er al voor de nurture.
const MC_SLEUTEL = (process.env.MAILCHIMP_API_KEY || '').trim();
const MC_DC      = MC_SLEUTEL.split('-')[1] || 'us3';
const MC_STORE   = process.env.MAILCHIMP_PP_STORE || 'pp-analyse';
// Hoe ver we terugkijken. Ruim genoeg voor iemand die zijn link pas weken
// later opzoekt, kort genoeg om een aankoop van vorig jaar niet opnieuw te
// laten gelden.
const GRATIS_VENSTER_DAGEN = 90;

function mailSleutel(email) {
  return crypto.createHash('md5').update(String(email).trim().toLowerCase()).digest('hex');
}

// Hoeveel betaalde webshop-analyses staan er op dit adres binnen het venster?
async function betaaldeWebshopAnalyses(email) {
  if (!MC_SLEUTEL) return 0;
  try {
    const id = mailSleutel(email);
    const r = await fetch(
      `https://${MC_DC}.api.mailchimp.com/3.0/ecommerce/stores/${MC_STORE}/orders?customer_id=${id}&count=50`,
      {
        headers: { Authorization: 'Basic ' + Buffer.from('any:' + MC_SLEUTEL).toString('base64') },
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!r.ok) return 0;
    const j = await r.json();
    const grens = Date.now() - GRATIS_VENSTER_DAGEN * 24 * 60 * 60 * 1000;
    return (j.orders || []).filter(o => {
      if (!String(o.id || '').startsWith('woo-')) return false; // Mollie-direct kreeg zijn rapport al
      const d = Date.parse(o.processed_at_foreign || '');
      return !d || d >= grens;
    }).length;
  } catch (e) {
    console.error('Webshop-controle mislukt (genegeerd):', e);
    return 0;
  }
}

// Hoeveel gratis rapporten heeft dit adres al opgehaald?
async function gratisAlOpgehaald(email) {
  const r = await redis(['GET', `pp:gratis:${mailSleutel(email)}`]);
  return r.ok && r.result ? parseInt(r.result, 10) || 0 : 0;
}
async function markeerGratisOpgehaald(email) {
  // Teller met dezelfde houdbaarheid als het venster, plus wat marge.
  const sleutel = `pp:gratis:${mailSleutel(email)}`;
  await redis(['INCR', sleutel]);
  await redis(['EXPIRE', sleutel, String((GRATIS_VENSTER_DAGEN + 30) * 24 * 60 * 60)]);
}

function leesCookie(kop, naam) {
  const m = String(kop || '').match(new RegExp('(?:^|;\\s*)' + naam + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

// ===== COOKIETOESTEMMING =====
// Exact dezelfde beoordeling als wordpress-snippets/meta-consent-koppeling.php,
// die op de hoofdsite de Meta-pixel stilzet bij een geweigerde banner. Zonder
// deze check zou het subdomein datzelfde lek terugbrengen: de webhook stuurt
// een gehasht mailadres, postcode en woonplaats naar Meta, ook van iemand die
// op de cookiebanner nee heeft gezegd.
//
// De cookies zijn hier leesbaar omdat CookieYes ze op .michelkredercoaching.nl
// zet, dus ook op dit subdomein.
//
// Eerste bron is wp_consent_marketing (WP Consent API), met cookieyes-consent
// als terugval. GEEN keuze = GEEN toestemming: zwijgen is geen toestemming.
// Let op wat dat betekent voor bezoekers die rechtstreeks op dit subdomein
// binnenkomen zonder ooit de hoofdsite te hebben gezien: die hebben geen
// cookie, dus voor hen gaat er niets naar Meta. Dat is bewust. Wil je ze wel
// meetellen, dan hoort daar een eigen cookiebanner op dit subdomein bij, geen
// soepelere regel hier.
function magMarketing(cookies) {
  const wp = leesCookie(cookies, 'wp_consent_marketing');
  if (wp) return wp === 'allow';

  const cy = leesCookie(cookies, 'cookieyes-consent');
  if (cy) return cy.indexOf('advertisement:yes') !== -1;

  return false;
}

// Fail-safe: lukt het opslaan niet, dan valt de webhook gewoon terug op alleen
// de gehashte NAW-velden. Een betaling mag hier nooit op stuklopen.
async function bewaarBrowserContext(req, betaalId, fbclid) {
  try {
    const cookies = req.headers?.cookie || '';

    // Geweigerd of nooit gevraagd? Dan leggen we alleen die uitkomst vast en
    // verder niets. De webhook ziet 'toestemming: false' en slaat het hele
    // Purchase-event over. Bewust wél opslaan in plaats van niets: anders kan
    // de webhook 'geweigerd' niet onderscheiden van 'Redis lag er even uit'.
    if (!magMarketing(cookies)) {
      await redis(['SET', `pp:meta:${betaalId}`, JSON.stringify({ toestemming: false }), 'EX', '2592000']);
      return;
    }

    let fbc = leesCookie(cookies, '_fbc');
    // Geen _fbc-cookie maar wel een fbclid uit de advertentielink? Dan bouwen we
    // 'm zelf, in het formaat dat Meta verwacht: fb.1.<milliseconden>.<fbclid>.
    if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;

    const ctx = {
      toestemming: true,
      fbp: leesCookie(cookies, '_fbp'),
      fbc,
      ip:  String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim(),
      ua:  String(req.headers?.['user-agent'] || '').slice(0, 400)
    };
    await redis(['SET', `pp:meta:${betaalId}`, JSON.stringify(ctx), 'EX', '2592000']); // 30 dagen
  } catch (e) {
    console.error('Browsercontext bewaren mislukt (genegeerd):', e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { blob, email, gewicht, land, postcode, huisnummer, straat, plaats, korting: kortingToken, bron, fbclid } = req.body || {};

  // Klik-ID uit een advertentielink. Client-input die in een Meta-event belandt,
  // dus alleen het tekenbereik toelaten dat Meta zelf gebruikt.
  const fbclidSchoon = /^[A-Za-z0-9_.-]{1,255}$/.test(String(fbclid || '')) ? String(fbclid) : '';

  // Waar kwam deze bezoeker vandaan? Vastgelegd door de funnel vóór de Strava-
  // koppeling (localStorage 'pp_bron'), want na die omweg is fbclid/referrer
  // allang weg. Alleen bekende, onschuldige waarden overnemen (client-input).
  const bronSchoon = /^[a-z0-9_]{1,20}$/.test(String(bron || '')) ? String(bron) : 'onbekend';

  // De volledige analyse zit versleuteld in 'blob' (door strava-callback gemaakt).
  // We ontsleutelen 'm hier server-side om de Mollie-metadata + PDF te kunnen bouwen.
  let stravaData;
  try {
    stravaData = unseal(blob);
  } catch (e) {
    console.error('Blob ontsleutelen mislukt:', e);
    return res.status(400).json({ error: 'Ongeldige sessie. Koppel Strava opnieuw.' });
  }

  // ===== SERVICEKORTING — eenmalige persoonlijke kortingslink =====
  // Token komt uit ?korting= op de funnelpagina. Handtekening + houdbaarheid
  // worden hier gecheckt, en of de link al eens verzilverd is (Redis).
  // Een kapotte/gebruikte link weigeren we expliciet, zodat de klant nooit
  // ongemerkt de volle prijs betaalt terwijl hij korting verwachtte.
  let korting = null;
  if (kortingToken) {
    const check = controleerKortingToken(kortingToken);
    if (!check.geldig) {
      return res.status(400).json({ error: 'Deze kortingslink is verlopen of ongeldig. Stuur even een mailtje, dan krijg je een nieuwe.', kortingOngeldig: true });
    }
    if (await kortingAlGebruikt(check.id)) {
      return res.status(400).json({ error: 'Deze kortingslink is al een keer gebruikt. Stuur even een mailtje als dat niet klopt.', kortingOngeldig: true });
    }
    korting = check;
  }

  const slim = {
    naam: stravaData?.naam || 'Sporter',
    // Alleen voor de factuur. Leeg als Strava geen achternaam teruggaf, of bij
    // oudere blobs van vóór deze wijziging; mollie-factuur.js vangt dat op.
    achternaam: stravaData?.achternaam || '',
    aantalActiviteiten: stravaData?.aantalActiviteiten || 0,
    urenPerWeek: stravaData?.urenPerWeek || 0,
    prestatiescore: stravaData?.prestatiescore || 0,
    vo2maxSessies: stravaData?.vo2maxSessies || 0,
    zones: stravaData?.zones || [],
    ftp: stravaData?.ftp || null,
    ftpBetrouwbaarheid: stravaData?.ftpBetrouwbaarheid || null,
    gemIntensiteit: stravaData?.gemIntensiteit || null,
    herstelScore: stravaData?.herstelScore ?? null,
  };

  // ===== GEWICHT voor W/kg =====
  // Voorkeur: gewicht uit het Strava-profiel (zit in de blob). Ontbreekt dat,
  // dan het handmatig ingevulde gewicht van de betaalpagina. Zo komt W/kg ook
  // in de PDF terecht — niet alleen op de webpagina.
  const stravaW = (stravaData?.weight >= 35 && stravaData?.weight <= 200) ? stravaData.weight : null;
  const handmatigW = (Number(gewicht) >= 35 && Number(gewicht) <= 200) ? Math.round(Number(gewicht) * 10) / 10 : null;
  const finalW = stravaW || handmatigW || '';

  // ===== PRIJS — server-side, datum-afhankelijk (één bron van waarheid) =====
  // Het bedrag dat Mollie afschrijft komt HIER vandaan, niet uit de browser.
  // Zo kan de getoonde prijs nooit afwijken van wat er afgeschreven wordt.
  // Een geldige servicekorting-link overschrijft de normale prijs.
  const p = huidigePrijs();
  const bedrag = korting ? korting.bedrag : p.bedrag;
  const prijsGetal = korting ? korting.prijs : p.prijs;

  // Metadata die bij de betaling hoort — Mollie bewaart 'm en geeft 'm terug aan
  // de webhook, die er het rapport uit bouwt. Bij een gratis link (€0) slaan we
  // Mollie over en voeren we dezelfde metadata rechtstreeks aan leverRapport.
  const metadata = {
    naam: slim.naam,
    achternaam: slim.achternaam,
    email: (email || '').toString().slice(0, 120),
    // BINDING (punt 6): nonce uit de versleutelde blob. /api/rapport eist
    // dat deze overeenkomt voordat het rapport wordt vrijgegeven.
    nonce: stravaData?.nonce || '',
    ftp: slim.ftp,
    ftpBetrouwbaarheid: slim.ftpBetrouwbaarheid,
    uren: slim.urenPerWeek,
    score: slim.prestatiescore,
    vo2max: slim.vo2maxSessies,
    herstel: slim.herstelScore,
    intensiteit: slim.gemIntensiteit,
    ritten: slim.aantalActiviteiten,
    zones: Array.isArray(slim.zones) ? slim.zones.join('-') : '',
    // ===== W/KG =====
    weight: finalW,
    piek1min: stravaData?.piek1min || '',
    piek5min: stravaData?.piek5min || '',
    piek12min: stravaData?.piek12min || '',
    piek20min: stravaData?.piek20min || '',
    // ===== HARTSLAG-DECOUPLING ===== Pw:HR-drift op de langste duurrit (alleen
    // gezet als strava-callback een kwalificerende rit vond, anders leeg).
    decoupling: stravaData?.decoupling ?? '',
    decouplingMinuten: stravaData?.decouplingMinuten || '',
    // Datum (YYYY-MM-DD) van de rit waarop de decoupling gemeten is, zodat de
    // klant "over je rit van 12 augustus" leest i.p.v. een anoniem percentage.
    decouplingDatum: stravaData?.decouplingDatum || '',
    // 'te_kort' | 'te_onregelmatig' — waarom decoupling niet gemeten kon
    // worden, plus de langste rit tot nu toe (in minuten, los van of die
    // rit kwalificeerde). Samen personaliseren ze de "kon niet worden
    // gedetecteerd"-kaart i.p.v. een generieke tekst (Leon, 23-09-2026).
    decouplingReden: stravaData?.decouplingReden || '',
    langsteRitMinuten: stravaData?.langsteRitMinuten || '',
    // ===== HARTSLAG-SPOOR DECOUPLING (Pa:HR) ===== snelheid:HR-drift, alleen
    // gezet op het hartslag-spoor. Korte veldnamen i.v.m. de Mollie-
    // metadata-limiet (~1kB in totaal over alle velden samen).
    decouplingHr: stravaData?.decouplingHr ?? '',
    decouplingHrMin: stravaData?.decouplingHrMinuten || '',
    decouplingHrBetr: stravaData?.decouplingHrBetrouwbaarheid || '',
    decouplingHrDatum: stravaData?.decouplingHrDatum || '',
    decouplingHrReden: stravaData?.decouplingHrReden || '',
    // ===== HR-SPOOR =====
    // Zonder deze velden kan de webhook alleen een vermogens-rapport bouwen.
    // 'meetmethode' vertelt de webhook welk rapport hij moet maken; het
    // omslagpunt + max-HF zijn de kerngetallen voor het hartslag-rapport.
    // heeftVermogensmeter is in strava-callback het EFFECTIEVE spoor (na de
    // 60%-power-dekkingsdrempel), dus precies de juiste vlag om op te sturen.
    meetmethode: stravaData?.heeftVermogensmeter ? 'vermogen' : 'hartslag',
    omslagpunt: stravaData?.omslagpunt || '',
    maxHf: stravaData?.maxHf || '',
    omslagpuntBetrouwbaarheid: stravaData?.omslagpuntBetrouwbaarheid || '',
    piek12minHr: stravaData?.piek12minHr || '',
    piek20minHr: stravaData?.piek20minHr || '',
    // ===== SERVICEKORTING =====
    // De webhook markeert dit ID als verzilverd zodra de betaling 'paid' is.
    kortingId: korting ? korting.id : '',
    // ===== ATTRIBUTIE ===== instagram/facebook/google(_ads)/organisch/direct.
    bron: bronSchoon,
    // ===== FACTUURADRES =====
    // NL: postcode + huisnummer; de factuurcode zoekt straat + plaats erbij via
    // PDOK. BE (en overig): straat + postcode + plaats komen rechtstreeks mee,
    // want daar is geen postcode-API. Mollie eist een volledig adres.
    land: (land || 'NL').toString().trim().toUpperCase().slice(0, 2),
    postcode: (postcode || '').toString().trim().slice(0, 10),
    huisnummer: (huisnummer || '').toString().trim().slice(0, 12),
    straat: (straat || '').toString().trim().slice(0, 80),
    plaats: (plaats || '').toString().trim().slice(0, 60)
  };

  // ===== GRATIS LINK (€0) — Mollie overslaan, rapport direct mailen =====
  // Mollie kan geen €0-betaling maken, dus voor een volledig gratis servicelink
  // leveren we het rapport hier meteen af (PDF + klantmail + interne mail +
  // Mailchimp), net als de webhook doet na een betaling. De link is eenmalig:
  // hierboven is al gecheckt dat 'ie niet gebruikt is; na een geslaagde mail
  // markeren we 'm als verzilverd.
  if (korting && korting.prijs === 0) {
    if (!email) {
      return res.status(400).json({ error: 'Vul je e-mailadres in, dan sturen we je rapport (PDF) daarheen.' });
    }
    try {
      const r = await leverRapport(metadata, { bedrag: '0.00', id: `gratis-${korting.id}` });
      if (!r.pdfOk) {
        return res.status(500).json({ error: 'Rapport genereren lukte niet. Probeer het zo nog eens.' });
      }
      if (!r.klantMailGelukt) {
        return res.status(500).json({ error: 'Rapport mailen lukte niet. Controleer je e-mailadres en probeer opnieuw.' });
      }
      await markeerKortingGebruikt(korting.id);
      // Ook hier de teller ophogen, anders zou iemand die zijn rapport netjes
      // via de gemailde link ophaalt daarna nog een keer gratis kunnen leveren
      // via het webshop-vangnet verderop. Eén betaling blijft één rapport.
      if (email) await markeerGratisOpgehaald(email);
      // gratis:true → de funnel stuurt de bezoeker naar het 'check je mail'-scherm.
      return res.status(200).json({ gratis: true, prijs: 0 });
    } catch (err) {
      console.error('Gratis aflevering mislukt:', err);
      return res.status(500).json({ error: 'Er ging iets mis bij het maken van je rapport. Probeer het opnieuw.' });
    }
  }

  // ===== AL BETAALD IN DE WEBSHOP, MAAR ZONDER PERSOONLIJKE LINK BINNEN =====
  // Vangnet voor wie wel betaalde maar de ?korting=-link uit zijn mail niet
  // gebruikte. Zie de uitleg bij betaaldeWebshopAnalyses() hierboven.
  //
  // Het recht hangt aan het AANTAL betaalde webshop-bestellingen, niet aan het
  // adres. Eén betaling is dus één gratis rapport, en wie twee keer koopt
  // krijgt er twee. Een harde "één per e-mailadres" zou terugkerende klanten
  // opnieuw in dezelfde val laten lopen; Erik Snijders kocht in september
  // bijvoorbeeld twee keer een analyse.
  //
  // Misbruik levert niets op: het rapport gaat naar het ingevulde adres, dus
  // wie het adres van een ander invult stuurt diegene een rapport en zichzelf
  // niets.
  if (!korting && email) {
    try {
      const rechten  = await betaaldeWebshopAnalyses(email);
      const gebruikt = rechten > 0 ? await gratisAlOpgehaald(email) : 0;

      if (rechten > gebruikt) {
        console.log('Gratis rapport op basis van webshop-aankoop:', email, '| betaald:', rechten, '| al opgehaald:', gebruikt);
        const r = await leverRapport(metadata, { bedrag: '0.00', id: `gratis-webshop-${mailSleutel(email)}-${gebruikt + 1}` });
        if (!r.pdfOk) {
          return res.status(500).json({ error: 'Rapport genereren lukte niet. Probeer het zo nog eens.' });
        }
        if (!r.klantMailGelukt) {
          return res.status(500).json({ error: 'Rapport mailen lukte niet. Controleer je e-mailadres en probeer opnieuw.' });
        }
        // Pas ophogen NA een geslaagde levering. Gaat het mis, dan houdt de
        // klant zijn recht en kan hij het gewoon opnieuw proberen.
        await markeerGratisOpgehaald(email);
        return res.status(200).json({ gratis: true, prijs: 0, alBetaald: true });
      }
    } catch (err) {
      // Nooit de verkoop blokkeren op dit vangnet. Gaat het mis, dan valt de
      // bezoeker gewoon terug op de normale betaling.
      console.error('Webshop-vangnet mislukt (genegeerd):', err);
    }
  }

  try {
    const mollieRes = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: bedrag },
        description: 'Strava Trainingsrapport — Michel Kreder Coaching',
        // Geen 'method' meegegeven: Mollie toont automatisch alle betaalmethodes
        // die in het dashboard actief staan. Het dashboard is dus de enige bron
        // van waarheid — methode toevoegen/weghalen hoeft nooit meer in de code.
        locale: 'nl_NL',
        redirectUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-callback',
        webhookUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-webhook',
        metadata
      })
    });

    const betaling = await mollieRes.json();
    console.log('Mollie response:', JSON.stringify(betaling).substring(0, 200));

    if (betaling._links?.checkout?.href && betaling.id) {
      // Browsercontext vastleggen zolang de bezoeker er nog achter zit; de
      // webhook heeft 'm straks nodig voor een bruikbaar Meta-event.
      await bewaarBrowserContext(req, betaling.id, fbclidSchoon);

      // prijs + isDeal + korting teruggeven zodat de frontend hetzelfde kan tonen.
      return res.status(200).json({
        checkoutUrl: betaling._links.checkout.href,
        pid: betaling.id,
        prijs: prijsGetal,
        isDeal: p.isDeal,
        korting: !!korting
      });
    }

    console.error('Mollie error:', JSON.stringify(betaling));
    return res.status(500).json({ error: 'Betaling aanmaken mislukt' });
  } catch (err) {
    console.error('Betaling error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
