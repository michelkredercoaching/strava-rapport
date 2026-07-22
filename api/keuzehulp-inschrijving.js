// /api/keuzehulp-inschrijving.js
// Ontvangt inschrijvingen vanaf de keuzehulp-pagina's op michelkredercoaching.nl
// en zet het contact in Mailchimp via de API (in plaats van het gewone inschrijfformulier).
//
// Twee routes (veld `route` in de POST-body):
//   - 'schema' (of geen route, backward-compatible met de oude keuzehulp):
//     upsert + merge-velden + journey-tag 'keuzehulp-gedaan'. De welkomst-journey
//     met trigger "tag toegevoegd" gaat af; de tag wordt eerst verwijderd en
//     opnieuw gezet zodat hij ook voor bestaande contacten opnieuw triggert.
//   - 'coaching': eigen tag 'keuzehulp-coaching' (dus GEEN schema-journey met
//     kortingsmail). Bij `inschrijving: 'ja'` (het begeleidingsformulier) gaat
//     er een notificatie naar Michel en een warme bevestiging naar de lead,
//     allebei via Resend.
//   - 'gratis-training': de lead magnet vanaf /gratis-training/. Zet de tag
//     'gratis-training' + mergeveld MEETMETH (vermogen/hartslag), mailt de
//     bijbehorende .fit-download en geeft die link ook terug aan de pagina.
//     Woont hier en niet in een eigen /api/gratis-training.js omdat de Vercel
//     Hobby-limiet van 12 serverless functions al vol zat (zie ook lead.js).
//
// Vereist in Vercel (staan er al voor de betaling-webhook):
//   MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID, PP_TOKEN_SECRET, RESEND_API_KEY
import crypto from 'node:crypto';

const MC_KEY  = process.env.MAILCHIMP_API_KEY;      // ...-usXX
const MC_LIST = process.env.MAILCHIMP_LIST_ID;
const MC_DC   = MC_KEY ? MC_KEY.split('-')[1] : null;

const TAG_SCHEMA   = 'keuzehulp-gedaan';
const TAG_COACHING = 'keuzehulp-coaching';
const TAG_GRATIS   = 'gratis-training';

// ===== Gratis-training lead magnet (route 'gratis-training') =====
// Woont bewust in dit endpoint en niet in een eigen /api/gratis-training.js:
// de Vercel Hobby-limiet is 12 serverless functions en die zat al vol.
// Zelfde truc als in lead.js.
const GT_URL_VERMOGEN = process.env.GRATIS_TRAINING_URL_VERMOGEN || process.env.GRATIS_TRAINING_URL || '';
const GT_URL_HARTSLAG = process.env.GRATIS_TRAINING_URL_HARTSLAG || process.env.GRATIS_TRAINING_URL || '';
const ANALYSE_URL     = 'https://strava-analyse.michelkredercoaching.nl/';

const AFZENDER     = 'Michel Kreder Coaching <rapport@michelkredercoaching.nl>';
const REPLY_TO     = 'info@michelkredercoaching.nl';
const INTERNE_MAIL = 'michel.kredercoaching@gmail.com';

// ===== Kortingstoken voor nurture-mail 5 (€10 op elk schema) =====
// Zelfde HMAC-aanpak als het Power Profile-tegoed, maar met 'kh10' als
// type zodat de twee soorten tokens elkaars snippet niet activeren.
// Opbouw: base64url("kh10|email|exp|sig"), sig = eerste 16 hex tekens van
// HMAC-SHA256(PP_TOKEN_SECRET, "kh10|email|exp").
// Mail 5 valt op dag 8; deadline = dag 11 (dus "nog 3 dagen"), het token
// zelf is 12 dagen geldig als buffer rond tijdzones en late opens.
const PP_SECRET = process.env.PP_TOKEN_SECRET || '';

function maakKeuzehulpKorting(email) {
  if (!PP_SECRET || !email) return { token: '', deadlineNL: '' };
  const exp = Date.now() + 12 * 24 * 3600 * 1000;
  const payload = `kh10|${String(email).toLowerCase()}|${exp}`;
  const sig = crypto.createHmac('sha256', PP_SECRET).update(payload).digest('hex').slice(0, 16);
  const token = Buffer.from(`${payload}|${sig}`).toString('base64url');
  const deadlineNL = new Date(Date.now() + 11 * 24 * 3600 * 1000)
    .toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' });
  return { token, deadlineNL };
}

// Alleen de eigen sites mogen dit endpoint vanuit de browser aanroepen.
const TOEGESTANE_ORIGINS = [
  'https://michelkredercoaching.nl',
  'https://www.michelkredercoaching.nl',
];

function zetCors(req, res) {
  const origin = req.headers.origin || '';
  if (TOEGESTANE_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ===== Mail-helpers (zelfde patroon als de betaling-webhook) =====
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function naarHtmlEntities(s) {
  // Array.from itereert per codepoint, zodat emoji's (surrogaatparen)
  // heel blijven in plaats van als twee kapotte entities te eindigen.
  return Array.from(String(s)).map(ch => {
    const cp = ch.codePointAt(0);
    return cp > 127 ? '&#' + cp + ';' : ch;
  }).join('');
}

async function stuurMail(payload) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) { console.error('Resend fout:', r.status, await r.text()); return false; }
    console.log('Resend OK ->', payload.to, '|', payload.subject);
    return true;
  } catch (e) { console.error('Resend exception:', e); return false; }
}

function interneCoachingHtml(b) {
  const r = (label, val) => `<tr><td style="padding:4px 16px 4px 0;color:#666;">${label}</td><td style="padding:4px 0;font-weight:700;">${val}</td></tr>`;
  return naarHtmlEntities(`
  <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6;">
    <h2 style="margin:0 0 4px;">🚴 Nieuwe coaching-aanvraag</h2>
    <p style="margin:0 0 16px;color:#666;">Via de adviestool · reageer binnen 24 uur</p>
    <table style="border-collapse:collapse;font-size:15px;">
      ${r('Naam', escHtml(b.naam || '—'))}
      ${r('E-mail', escHtml(b.email || '—'))}
      ${r('Telefoon', escHtml(b.telefoon || '—'))}
      ${r('Pakket', escHtml(b.pakket || '—'))}
      ${r('Uren per week', escHtml(b.uren || '—'))}
      ${r('Rijdt wedstrijden', escHtml(b.wedstrijden || '—'))}
    </table>
    <p style="margin:16px 0 4px;color:#666;">Doel of grootste frustratie:</p>
    <p style="margin:0;padding:10px 14px;border-radius:6px;background:#f5f5f5;font-size:15px;">${escHtml(b.doel || '—')}</p>
  </div>`);
}

function bevestigingHtml(naam, pakket) {
  const veiligeNaam = escHtml((naam || '').split(' ')[0] || 'daar');
  const pakketTxt = pakket ? `voor <strong>${escHtml(pakket)}</strong> ` : '';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.65;max-width:560px;">
    <p style="font-size:16px;margin:0 0 14px;">Hi ${veiligeNaam},</p>
    <p style="font-size:15px;margin:0 0 14px;">Goed dat je deze stap zet. Je aanvraag ${pakketTxt}is binnen.</p>
    <p style="font-size:15px;margin:0 0 14px;">Ik neem persoonlijk contact met je op voor een <strong>intakegesprek</strong>. Daarin nemen we je doelen door, kijk ik naar je huidige training en bespreken we hoe we samen aan de slag gaan. Je hoeft nu verder niets te doen.</p>
    <p style="font-size:15px;margin:0 0 18px;">Wil je alvast iets kwijt over je situatie of je doelen? Reageer gewoon op deze mail, ik lees alles zelf.</p>
    <p style="font-size:14px;margin:18px 0 0;color:#666;">Sterke kilometers,<br><strong style="color:#1a1a1a;">Michel</strong><br>Michel Kreder Coaching</p>
  </div>`;
  return naarHtmlEntities(html);
}

// Downloadmail voor de gratis-training lead magnet. Past zich aan op
// meetmethode: bij vermogen draait het om FTP/watt, bij hartslag om het
// omslagpunt/HR-zones. In beide gevallen de brug naar de analyse voor wie
// zijn eigen waarden niet kent.
function gratisTrainingHtml(naam, url, meetmethode) {
  const veiligeNaam = escHtml((naam || '').split(' ')[0] || 'daar');
  const isVermogen = meetmethode !== 'hartslag';
  const waarde  = isVermogen ? 'FTP' : 'omslagpunt';
  const eenheid = isVermogen ? 'de watt-doelen' : 'de hartslagzones';
  const onthoud = isVermogen
    ? 'de blokken lopen op watt, dus stel je FTP goed in op je fietscomputer.'
    : 'de blokken lopen op hartslag, dus stel je zones goed in op je fietscomputer.';

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.65;max-width:560px;">
    <p style="font-size:16px;margin:0 0 14px;">Hi ${veiligeNaam},</p>
    <p style="font-size:15px;margin:0 0 14px;">Hier is je gratis training (${escHtml(isVermogen ? 'vermogen' : 'hartslag')}-versie). Klik op de knop om het bestand te downloaden.</p>
    <p style="margin:0 0 20px;">
      <a href="${escHtml(url)}" style="display:inline-block;background:#ff6b1a;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 30px;border-radius:8px;">Download je training</a>
    </p>
    <p style="font-size:15px;margin:0 0 6px;"><strong>Hoe laad je hem in?</strong></p>
    <ul style="font-size:15px;margin:0 0 14px;padding-left:20px;">
      <li style="margin:0 0 6px;"><strong>Garmin of Wahoo:</strong> importeer het bestand in Garmin Connect (Training &gt; Workouts) en stuur het naar je fietscomputer.</li>
      <li style="margin:0 0 6px;"><strong>TrainingPeaks:</strong> upload het bestand bij een geplande dag in je agenda.</li>
      <li style="margin:0 0 6px;"><strong>Onthoud:</strong> ${onthoud}</li>
    </ul>
    <div style="margin:22px 0;padding:22px;background:#0d0d0d;border-radius:12px;">
      <p style="font-size:12px;font-weight:800;color:#ff6b1a;letter-spacing:1.5px;margin:0 0 10px;text-transform:uppercase;">Aanbevolen eerste stap</p>
      <p style="font-size:18px;line-height:1.4;color:#ffffff;margin:0 0 8px;font-weight:800;">Weet je je ${waarde} nog niet?</p>
      <p style="font-size:14px;color:#c8c8c8;margin:0 0 14px;">Dan kloppen ${eenheid} in deze training niet, en train je op de verkeerde intensiteit. Je rijdt de blokken dan te zwaar of te licht.</p>
      <p style="font-size:15px;color:#ffffff;margin:0 0 16px;">Bepaal eerst je ${waarde} met de <strong style="color:#ff6b1a;">Power Profile-analyse</strong> voor &euro;29. Daarna voer je deze training, en elke volgende, precies goed uit.</p>
      <a href="${escHtml(ANALYSE_URL)}" style="display:inline-block;background:#ff6b1a;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 30px;border-radius:8px;">Bepaal mijn ${waarde} &rarr;</a>
    </div>
    <p style="font-size:15px;margin:0 0 14px;">Kom je er niet uit? Reageer gewoon op deze mail, ik help je op weg.</p>
    <p style="font-size:14px;margin:18px 0 0;color:#666;">Sterke kilometers,<br><strong style="color:#1a1a1a;">Michel</strong><br>Michel Kreder Coaching</p>
  </div>`;
  return naarHtmlEntities(html);
}

// Tag eerst weghalen en dan opnieuw zetten: alleen een NIEUW geplaatste tag
// triggert een journey, ook bij contacten die de keuzehulp eerder deden.
async function hertag(base, headers, hash, tag) {
  await fetch(`${base}/members/${hash}/tags`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tags: [{ name: tag, status: 'inactive' }] }),
    signal: AbortSignal.timeout(10000),
  });
  await fetch(`${base}/members/${hash}/tags`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tags: [{ name: tag, status: 'active' }] }),
    signal: AbortSignal.timeout(10000),
  });
}

export default async function handler(req, res) {
  zetCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, fout: 'alleen POST' });
  if (!MC_KEY || !MC_LIST || !MC_DC) {
    console.error('Keuzehulp: Mailchimp-config ontbreekt');
    return res.status(500).json({ ok: false, fout: 'configuratie ontbreekt' });
  }

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, fout: 'ongeldig e-mailadres' });
  }

  const route = b.route === 'coaching'        ? 'coaching'
              : b.route === 'gratis-training' ? 'gratis-training'
              :                                 'schema';

  // Gratis-training: bepaal meteen welk bestand deze bezoeker krijgt, zodat we
  // niet eerst een contact aanmaken en daarna alsnog stukloepen op een
  // ontbrekende env-var.
  const gtMeetmethode = b.meetmethode === 'hartslag' ? 'hartslag' : 'vermogen';
  const gtDownloadUrl = gtMeetmethode === 'hartslag' ? GT_URL_HARTSLAG : GT_URL_VERMOGEN;
  if (route === 'gratis-training' && !gtDownloadUrl) {
    console.error('Gratis-training: download-URL ontbreekt voor meetmethode', gtMeetmethode);
    return res.status(500).json({ ok: false, fout: 'download nog niet ingesteld' });
  }

  const hash = crypto.createHash('md5').update(email).digest('hex');
  const base = `https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST}`;
  const auth = 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64');
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };

  // Merge-velden: alleen meesturen wat is ingevuld, zodat we bestaande
  // waarden niet per ongeluk leegmaken bij een tweede inschrijving.
  const merge = {};
  if (b.naam)        merge.FNAME     = String(b.naam).trim().replace(/\b\p{L}/gu, c => c.toUpperCase());
  if (b.schema)      merge.SCHEMA    = String(b.schema);
  if (b.schemaUrl)   merge.SCHURL    = String(b.schemaUrl);
  if (b.registratie) merge.REGISTR   = String(b.registratie);
  if (b.ftpkennis)   merge.FTPKENNIS = String(b.ftpkennis);
  if (b.meetmethode) merge.MEETMETH  = String(b.meetmethode);

  // Kortingstoken voor mail 5 — alleen voor de schema-route; coaching-leads
  // horen geen schemakorting te krijgen terwijl Michel ze belt.
  if (route === 'schema') {
    const korting = maakKeuzehulpKorting(email);
    if (korting.token) {
      merge.KHTOKEN    = korting.token;
      merge.KHDEADLINE = korting.deadlineNL;
    }
  }

  // Coaching-route: pakket + terugkeer-link voor de adviesmail
  // (*|KHPAKKET|* en *|KHPURL|* in de coaching-journey).
  if (route === 'coaching') {
    if (b.pakket)    merge.KHPAKKET = String(b.pakket);
    if (b.pakketUrl) merge.KHPURL   = String(b.pakketUrl);
  }

  // Gratis-training: meetmethode altijd vastleggen, zodat de journey erop
  // kan vertakken (vermogen of hartslag).
  if (route === 'gratis-training') merge.MEETMETH = gtMeetmethode;

  try {
    // 1) Contact toevoegen of bijwerken (PUT = upsert).
    const upsert = (velden) => fetch(`${base}/members/${hash}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        email_address: email,
        status_if_new: 'subscribed',
        ...(Object.keys(velden).length ? { merge_fields: velden } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    let lid = await upsert(merge);
    if (!lid.ok && (merge.KHPAKKET || merge.KHPURL)) {
      // Vangnet: bestaan KHPAKKET/KHPURL (nog) niet als merge-veld in
      // Mailchimp, dan weigert de API de hele upsert. Liever het contact
      // binnen zonder die velden dan de lead kwijt.
      const detail = await lid.text().catch(() => '');
      console.error('Keuzehulp: upsert met KH-velden faalde, retry zonder:', lid.status, detail);
      const { KHPAKKET, KHPURL, ...rest } = merge;
      lid = await upsert(rest);
    }
    if (!lid.ok) {
      const detail = await lid.text().catch(() => '');
      console.error('Keuzehulp: lid upsert faalde:', lid.status, detail);
      return res.status(502).json({ ok: false, fout: 'mailchimp weigerde het adres' });
    }

    // 2) Journey-tag per route.
    const tag = route === 'coaching'        ? TAG_COACHING
              : route === 'gratis-training' ? TAG_GRATIS
              :                               TAG_SCHEMA;
    await hertag(base, headers, hash, tag);

    // 2b) Gratis-training: de juiste downloadlink meteen mailen (bevestigt het
    //     adres) en teruggeven aan de pagina voor een directe download.
    if (route === 'gratis-training') {
      await stuurMail({
        from: AFZENDER, to: email, reply_to: REPLY_TO,
        subject: 'Je gratis training staat klaar',
        html: gratisTrainingHtml(b.naam, gtDownloadUrl, gtMeetmethode),
      });
      console.log('Gratis-training OK:', email, '| meetmethode:', gtMeetmethode);
      return res.status(200).json({ ok: true, downloadUrl: gtDownloadUrl, meetmethode: gtMeetmethode });
    }

    // 3) Coaching-inschrijving: notificatie naar Michel + bevestiging naar de lead.
    //    (De e-mailpoort eerder in de flow stuurt geen `inschrijving`, alleen
    //    het begeleidingsformulier doet dat — dus geen dubbele mails.)
    if (route === 'coaching' && String(b.inschrijving || '') === 'ja') {
      await stuurMail({
        from: AFZENDER, to: INTERNE_MAIL,
        reply_to: email,
        subject: `🚴 Coaching-aanvraag: ${String(b.naam || email)} · ${String(b.pakket || 'adviestool')}`,
        html: interneCoachingHtml(b),
      });
      await stuurMail({
        from: AFZENDER, to: email, reply_to: REPLY_TO,
        subject: 'Je aanvraag is binnen — we plannen een intakegesprek',
        html: bevestigingHtml(b.naam, b.pakket),
      });
    }

    console.log('Keuzehulp OK:', email, '| route:', route, '| schema:', b.schema || '-', '| inschrijving:', b.inschrijving || '-');
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Keuzehulp: Mailchimp faalde:', e);
    return res.status(502).json({ ok: false, fout: 'mailchimp niet bereikbaar' });
  }
}
