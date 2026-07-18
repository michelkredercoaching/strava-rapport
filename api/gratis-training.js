// /api/gratis-training.js
// Ontvangt aanvragen voor de gratis-training lead magnet op michelkredercoaching.nl.
// Flow: e-mail + meetmethode binnen -> Mailchimp upsert + MEETMETH + nieuwe tag
// 'gratis-training' (triggert de welkomst-/nurture-journey) -> de JUISTE downloadlink
// (vermogen of hartslag) per mail (Resend) EN terug aan de pagina, zodat de bezoeker
// meteen kan downloaden.
//
// Zelfde stramien als keuzehulp-inschrijving.js (CORS, upsert, hertag, Resend).
//
// Vereist in Vercel (staan er al, behalve de laatste drie):
//   MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID, RESEND_API_KEY
//   GRATIS_TRAINING_URL_VERMOGEN  -> download-URL van de VERMOGEN-workout (watt-doelen)
//   GRATIS_TRAINING_URL_HARTSLAG  -> download-URL van de HARTSLAG-workout (HR-zones)
//   (optioneel) GRATIS_TRAINING_URL  -> fallback als een van beide (nog) ontbreekt
import crypto from 'node:crypto';

const MC_KEY  = process.env.MAILCHIMP_API_KEY;      // ...-usXX
const MC_LIST = process.env.MAILCHIMP_LIST_ID;
const MC_DC   = MC_KEY ? MC_KEY.split('-')[1] : null;

const TAG = 'gratis-training';

const URL_VERMOGEN = process.env.GRATIS_TRAINING_URL_VERMOGEN || process.env.GRATIS_TRAINING_URL || '';
const URL_HARTSLAG = process.env.GRATIS_TRAINING_URL_HARTSLAG || process.env.GRATIS_TRAINING_URL || '';

// Waar mensen zonder bekende FTP/omslagpunt eerst hun waarden bepalen (€29).
const ANALYSE_URL = 'https://strava-analyse.michelkredercoaching.nl/';

const AFZENDER = 'Michel Kreder Coaching <rapport@michelkredercoaching.nl>';
const REPLY_TO = 'info@michelkredercoaching.nl';

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
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) { console.error('Resend fout:', r.status, await r.text()); return false; }
    console.log('Resend OK ->', payload.to, '|', payload.subject);
    return true;
  } catch (e) { console.error('Resend exception:', e); return false; }
}

// De mail past zich aan op meetmethode: bij vermogen draait het om FTP/watt,
// bij hartslag om het omslagpunt/HR-zones. In beide gevallen de brug naar de
// analyse voor wie de eigen waarden niet kent.
function downloadMailHtml(naam, url, meetmethode) {
  const veiligeNaam = escHtml((naam || '').split(' ')[0] || 'daar');
  const isVermogen = meetmethode === 'vermogen';
  const waarde   = isVermogen ? 'FTP' : 'omslagpunt';
  const eenheid  = isVermogen ? 'de watt-doelen' : 'de hartslagzones';
  const laadInfo = isVermogen
    ? `<li style="margin:0 0 6px;"><strong>Zwift:</strong> zet het .zwo-bestand in Documents/Zwift/Workouts/[jouw nummer]. Het staat dan onder Custom Workouts.</li>
       <li style="margin:0 0 6px;"><strong>Garmin / buiten:</strong> importeer het bestand in Garmin Connect (Training &gt; Workouts) en stuur het naar je fietscomputer.</li>`
    : `<li style="margin:0 0 6px;"><strong>Garmin / fietscomputer:</strong> importeer het bestand in Garmin Connect (Training &gt; Workouts) en stuur het naar je toestel. Je krijgt de zones op basis van je hartslag.</li>
       <li style="margin:0 0 6px;"><strong>Sporthorloge:</strong> laad de workout via de app van je merk in als gestructureerde training.</li>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.65;max-width:560px;">
    <p style="font-size:16px;margin:0 0 14px;">Hi ${veiligeNaam},</p>
    <p style="font-size:15px;margin:0 0 14px;">Hier is je gratis training (${escHtml(isVermogen ? 'vermogen' : 'hartslag')}-versie). Klik op de knop om het bestand te downloaden.</p>
    <p style="margin:0 0 20px;">
      <a href="${escHtml(url)}" style="display:inline-block;background:#e63329;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:8px;">Download je training</a>
    </p>
    <p style="font-size:15px;margin:0 0 6px;"><strong>Hoe laad je 'm in?</strong></p>
    <ul style="font-size:15px;margin:0 0 14px;padding-left:20px;">
      ${laadInfo}
      <li style="margin:0 0 6px;"><strong>TrainingPeaks:</strong> upload het bestand bij een geplande dag.</li>
    </ul>
    <div style="border:1px solid #eee;border-radius:10px;padding:14px 16px;margin:0 0 16px;background:#fafafa;">
      <p style="font-size:15px;margin:0 0 8px;"><strong>Weet je je ${waarde} niet?</strong></p>
      <p style="font-size:15px;margin:0 0 12px;">Dan kloppen ${eenheid} in deze training niet — en train je op de verkeerde intensiteit. Bepaal eerst je ${waarde} met de Power Profile-analyse (&euro;29), dan voer je 'm perfect uit.</p>
      <p style="margin:0;">
        <a href="${escHtml(ANALYSE_URL)}" style="display:inline-block;color:#e63329;text-decoration:none;font-weight:700;font-size:15px;">Bepaal mijn ${waarde} &rarr;</a>
      </p>
    </div>
    <p style="font-size:15px;margin:0 0 14px;">Kom je er niet uit? Reageer gewoon op deze mail, ik help je op weg.</p>
    <p style="font-size:14px;margin:18px 0 0;color:#666;">Sterke kilometers,<br><strong style="color:#1a1a1a;">Michel</strong><br>Michel Kreder Coaching</p>
  </div>`;
  return naarHtmlEntities(html);
}

// Tag eerst weghalen en dan opnieuw zetten: alleen een NIEUW geplaatste tag
// triggert een journey, ook bij contacten die de training eerder aanvroegen.
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
    console.error('Gratis-training: Mailchimp-config ontbreekt');
    return res.status(500).json({ ok: false, fout: 'configuratie ontbreekt' });
  }

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, fout: 'ongeldig e-mailadres' });
  }

  // Meetmethode bepaalt welk bestand de bezoeker krijgt.
  const meetmethode = b.meetmethode === 'hartslag' ? 'hartslag' : 'vermogen';
  const downloadUrl = meetmethode === 'hartslag' ? URL_HARTSLAG : URL_VERMOGEN;
  if (!downloadUrl) {
    console.error('Gratis-training: download-URL ontbreekt voor meetmethode', meetmethode);
    return res.status(500).json({ ok: false, fout: 'download nog niet ingesteld' });
  }

  const hash = crypto.createHash('md5').update(email).digest('hex');
  const base = `https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST}`;
  const auth = 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64');
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };

  // Merge-velden: alleen meesturen wat is ingevuld, zodat we bestaande
  // waarden niet per ongeluk leegmaken bij een tweede aanvraag.
  const merge = { MEETMETH: meetmethode };
  if (b.naam) merge.FNAME = String(b.naam).trim().replace(/\b\p{L}/gu, c => c.toUpperCase());

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
    if (!lid.ok) {
      // Vangnet: bestaat MEETMETH (nog) niet als merge-veld, dan weigert de API
      // de upsert. Liever het contact binnen zonder dat veld dan de lead kwijt.
      const detail = await lid.text().catch(() => '');
      console.error('Gratis-training: upsert met MEETMETH faalde, retry zonder:', lid.status, detail);
      const { MEETMETH, ...rest } = merge;
      lid = await upsert(rest);
    }
    if (!lid.ok) {
      const detail = await lid.text().catch(() => '');
      console.error('Gratis-training: lid upsert faalde:', lid.status, detail);
      return res.status(502).json({ ok: false, fout: 'mailchimp weigerde het adres' });
    }

    // 2) Journey-tag.
    await hertag(base, headers, hash, TAG);

    // 3) De juiste downloadlink meteen mailen (bevestigt het adres + funnel-touch).
    await stuurMail({
      from: AFZENDER, to: email, reply_to: REPLY_TO,
      subject: 'Je gratis training staat klaar 🚴',
      html: downloadMailHtml(b.naam, downloadUrl, meetmethode),
    });

    console.log('Gratis-training OK:', email, '| meetmethode:', meetmethode);
    // Link ook terug aan de pagina, zodat de bezoeker direct kan downloaden.
    return res.status(200).json({ ok: true, downloadUrl, meetmethode });
  } catch (e) {
    console.error('Gratis-training: Mailchimp faalde:', e);
    return res.status(502).json({ ok: false, fout: 'mailchimp niet bereikbaar' });
  }
}
