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
//   - 'gratis-training': de lead magnet vanaf /de-proeftraining/. Zet de tag
//     'gratis-training' + mergeveld MEETMETH (vermogen/hartslag), mailt de
//     bijbehorende Startprotocol-pdf en geeft die link ook terug aan de pagina.
//     Woont hier en niet in een eigen /api/gratis-training.js omdat de Vercel
//     Hobby-limiet van 12 serverless functions al vol zat (zie ook lead.js).
//
// Vereist in Vercel (staan er al voor de betaling-webhook):
//   MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID, PP_TOKEN_SECRET, RESEND_API_KEY
import crypto from 'node:crypto';

const MC_KEY  = process.env.MAILCHIMP_API_KEY;      // ...-usXX
const MC_LIST = process.env.MAILCHIMP_LIST_ID;
const MC_DC   = MC_KEY ? MC_KEY.split('-')[1] : null;

const TAG_SCHEMA      = 'keuzehulp-gedaan';
const TAG_COACHING    = 'keuzehulp-coaching';
const TAG_GRATIS      = 'gratis-training';
const TAG_BEGELEIDING = 'begeleiding-aanvraag';

// ===== Gratis-training lead magnet (route 'gratis-training') =====
// Woont bewust in dit endpoint en niet in een eigen /api/gratis-training.js:
// de Vercel Hobby-limiet is 12 serverless functions en die zat al vol.
// Zelfde truc als in lead.js.
// Het Startprotocol is de download van De Proeftraining: de nulmeting, de zones én
// de proeftraining helemaal uitgeschreven, in een vermogen- en een
// hartslagvariant. Daarmee vervalt het losse .fit-bestand: de training komt nu
// via de TrainingPeaks-koppellink op de fietscomputer, en dat was precies de
// klacht die het .fit-bestand veroorzaakte.
const SP_PDF_VERMOGEN = process.env.PROEFTRAINING_PDF_VERMOGEN
  || 'https://michelkredercoaching.nl/wp-content/uploads/2026/08/Startprotocol-vermogen.pdf';
const SP_PDF_HARTSLAG = process.env.PROEFTRAINING_PDF_HARTSLAG
  || 'https://michelkredercoaching.nl/wp-content/uploads/2026/08/Startprotocol-hartslag.pdf';
const ANALYSE_URL     = 'https://strava-analyse.michelkredercoaching.nl/';

const AFZENDER     = 'Michel Kreder Coaching <rapport@michelkredercoaching.nl>';
const REPLY_TO     = 'info@michelkredercoaching.nl';
const INTERNE_MAIL = 'michel.kredercoaching@gmail.com';

// Persoonlijke TrainingPeaks-link waarmee een nieuwe klant Michel als coach
// koppelt. Staat in de onboarding-mail van de begeleiding-route.
const TP_COACH_LINK = process.env.TP_COACH_LINK
  || 'https://home.trainingpeaks.com/attachtocoach?sharedKey=WVUCQ5NS247P2';
const TP_ANDROID = 'https://play.google.com/store/apps/details?id=com.peaksware.trainingpeaks';
const TP_APPLE   = 'https://apps.apple.com/app/id408047715';

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

// Notificatie naar Michel zodra iemand De Proeftraining aanvraagt. Doel is één
// oogopslag: wie is binnengekomen, welk adres zich zo dadelijk koppelt in
// TrainingPeaks, en welke variant van de proeftraining hij nodig heeft.
function interneProeftrainingHtml({ naam, email, meetmethode }) {
  const r = (label, val) => `<tr><td style="padding:5px 16px 5px 0;color:#666;white-space:nowrap;">${label}</td><td style="padding:5px 0;font-weight:700;">${escHtml(val || '—')}</td></tr>`;
  // Kleurtje per variant, zodat je in je inbox in één blik ziet welke versie
  // van de proeftraining je moet klaarzetten.
  const variant = meetmethode === 'hartslag'
    ? { woord: 'hartslag', tint: '#ffe9e0' }
    : { woord: 'vermogen', tint: '#fff3e6' };
  return naarHtmlEntities(`
  <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6;">
    <h2 style="margin:0 0 4px;">🚴 Nieuwe proeftraining aangevraagd</h2>
    <p style="margin:0 0 16px;color:#666;">Via /de-proeftraining/ · verwacht een koppelverzoek in TrainingPeaks</p>
    <table style="border-collapse:collapse;font-size:15px;">
      ${r('Naam', naam)}
      ${r('E-mail', email)}
      ${r('Traint op', meetmethode === 'hartslag' ? 'Hartslag' : 'Vermogen')}
    </table>
    <p style="margin:18px 0 16px;padding:14px 18px;border-radius:6px;background:${variant.tint};font-size:16px;">
      Zet klaar zodra hij gekoppeld is: <b>de ${variant.woord}-versie</b> van de proeftraining.
    </p>
    <p style="margin:0 0 6px;color:#666;">Te doen:</p>
    <ol style="margin:0;padding-left:18px;font-size:15px;">
      <li>Wacht op het koppelverzoek van <b>${escHtml(email || '—')}</b> in je coachaccount en accepteer het. Blijft het uit, nodig hem dan zelf uit op dit adres.</li>
      <li>Zet de proeftraining in zijn kalender, <b>${variant.woord}</b>.</li>
    </ol>
    <p style="margin:18px 0 0;">
      <a href="https://app.trainingpeaks.com/" style="display:inline-block;background:#FF6B1A;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:6px;">Open TrainingPeaks</a>
    </p>
  </div>`);
}

// Volledige inschrijving via de begeleiding-inschrijfpagina's
// (/trainingsbegeleiding-inschrijven/ en de premium-variant). Toont alle
// ingevulde velden zodat Michel de aanvraag meteen kan verwerken.
function interneBegeleidingHtml(b) {
  const r = (label, val) => `<tr><td style="padding:5px 16px 5px 0;color:#666;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:5px 0;font-weight:700;">${escHtml(val || '—')}</td></tr>`;
  const blok = (label, val) => val ? `<p style="margin:16px 0 4px;color:#666;">${label}</p><p style="margin:0;padding:10px 14px;border-radius:6px;background:#f5f5f5;font-size:15px;white-space:pre-wrap;">${escHtml(val)}</p>` : '';
  return naarHtmlEntities(`
  <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6;">
    <h2 style="margin:0 0 4px;">🚴 Nieuwe inschrijving trainingsbegeleiding</h2>
    <p style="margin:0 0 16px;color:#666;">${escHtml(b.pakket || 'Begeleiding')} · reageer binnen 24 uur</p>
    <table style="border-collapse:collapse;font-size:15px;">
      ${r('Naam', b.naam)}
      ${r('E-mail', b.email)}
      ${r('Telefoon', b.telefoon)}
      ${r('Geboortedatum', b.geboortedatum)}
      ${r('Adres', b.adres)}
      ${r('Postcode', b.postcode)}
      ${r('Woonplaats', b.woonplaats)}
      ${r('Pakket', b.pakket)}
      ${r('Meetmethode', b.meetmethode)}
      ${r('Omslagpunt/FTP', b.ftp)}
      ${r('Trainingen per week', b.frequentie)}
      ${r('Uren per week', b.uren)}
      ${r('Rijdt wedstrijden', b.wedstrijden)}
      ${r('Cadeaubon', b.cadeaubon)}
      ${r('Gevonden via', b.gevonden)}
    </table>
    ${blok('Doel:', b.doel)}
    ${blok('Opmerkingen:', b.opmerkingen)}
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

// Onboarding-mail voor een nieuwe begeleidingsklant. Bevestigt de
// inschrijving en geeft meteen de vliegende start: TrainingPeaks aanmaken,
// Michel als coach koppelen, en het eigen toestel of app (Garmin, Wahoo,
// Zwift, Rouvy) koppelen en synchroniseren. Onderaan een overzicht van de
// inschrijving zodat de klant ziet wat is doorgegeven.
function onboardingBegeleidingHtml(b) {
  const veiligeNaam = escHtml((b.naam || '').trim() || 'renner');
  const stap = (nr, titel) =>
    `<tr><td style="padding:0 12px 0 0;vertical-align:top;"><div style="width:30px;height:30px;border-radius:50%;background:#FF6B00;color:#fff;font-weight:800;font-size:15px;text-align:center;line-height:30px;">${nr}</div></td><td style="padding:0 0 2px;"><p style="margin:0;font-size:16px;font-weight:800;color:#1a1a1a;">${titel}</p></td></tr>`;

  // Overzichtsregel: alleen tonen wat is ingevuld.
  const r = (label, val) => val ? `<tr><td style="padding:4px 16px 4px 0;color:#777;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:4px 0;color:#1a1a1a;font-weight:600;">${escHtml(val)}</td></tr>` : '';

  const koppelBlok = (naam, stappen) => `
    <div style="border:1px solid #eee;border-radius:10px;padding:16px 18px;margin:0 0 12px;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#1a1a1a;">${naam}</p>
      <ol style="margin:0;padding-left:18px;font-size:14px;color:#444;line-height:1.6;">
        ${stappen.map(s => `<li style="margin:0 0 4px;">${s}</li>`).join('')}
      </ol>
    </div>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.65;max-width:600px;">
    <p style="font-size:16px;margin:0 0 14px;">Beste ${veiligeNaam},</p>
    <p style="font-size:15px;margin:0 0 14px;">Bedankt voor je inschrijving en je interesse in trainingsbegeleiding. Wat leuk dat je erbij komt. Hieronder zet ik precies op een rij hoe we een vliegende start maken, zodat alles klaarstaat voor onze eerste belafspraak.</p>

    <table style="border-collapse:collapse;margin:22px 0 6px;"><tbody>
      ${stap('1', 'Maak je gratis TrainingPeaks account aan')}
    </tbody></table>
    <p style="font-size:15px;margin:0 0 12px;">Download de app en maak een gratis account aan:</p>
    <p style="margin:0 0 18px;">
      <a href="${TP_ANDROID}" style="display:inline-block;background:#0d0d0d;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:8px;margin:0 8px 8px 0;">Android downloaden</a>
      <a href="${TP_APPLE}" style="display:inline-block;background:#0d0d0d;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:8px;margin:0 0 8px 0;">Apple downloaden</a>
    </p>

    <table style="border-collapse:collapse;margin:14px 0 6px;"><tbody>
      ${stap('2', 'Koppel mij als jouw coach')}
    </tbody></table>
    <p style="font-size:15px;margin:0 0 12px;">Is je account gelukt? Klik dan op de knop hieronder, dan accepteer je mij als coach in TrainingPeaks:</p>
    <p style="margin:0 0 18px;">
      <a href="${TP_COACH_LINK}" style="display:inline-block;background:#FF6B00;color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 28px;border-radius:8px;">Koppel Michel als coach</a>
    </p>

    <table style="border-collapse:collapse;margin:14px 0 10px;"><tbody>
      ${stap('3', 'Koppel je fietscomputer of app')}
    </tbody></table>
    <p style="font-size:15px;margin:0 0 14px;">TrainingPeaks is de spil. Koppel je toestel of app er één keer aan, dan verschijnen je geplande trainingen automatisch op je apparaat en komen je gereden ritten vanzelf terug in TrainingPeaks. Kies wat jij gebruikt:</p>

    ${koppelBlok('Garmin', [
      'Maak (of gebruik) je gratis Garmin Connect account.',
      'Ga in TrainingPeaks naar je accountinstellingen en kies bij de koppelingen Garmin Connect. Log in en geef toestemming.',
      'Je geplande trainingen verschijnen dan via Garmin Connect op je Garmin, en je ritten uploaden vanzelf terug naar TrainingPeaks.'
    ])}
    ${koppelBlok('Wahoo', [
      'Open de Wahoo app (ELEMNT) op je telefoon.',
      'Ga naar de instellingen en kies Authorized Apps, oftewel gekoppelde apps.',
      'Koppel TrainingPeaks en log in. Je geplande trainingen staan dan klaar op je Wahoo en je ritten komen terug in TrainingPeaks.'
    ])}
    ${koppelBlok('Zwift', [
      'Ga in Zwift naar Settings en dan Connections.',
      'Koppel TrainingPeaks en geef toestemming.',
      'Je trainingen uit TrainingPeaks staan dan in Zwift onder Workouts, en je ritten synchroniseren terug naar TrainingPeaks.'
    ])}
    ${koppelBlok('Rouvy', [
      'Open Rouvy en ga naar je profiel en dan de instellingen of Connections.',
      'Koppel TrainingPeaks en geef toestemming.',
      'Je geplande trainingen synchroniseren dan naar Rouvy en je ritten weer terug naar TrainingPeaks.'
    ])}

    <p style="font-size:15px;margin:18px 0 14px;">Heb je de afgelopen weken of maanden al trainingsdata geregistreerd? Upload die dan in je TrainingPeaks account, dan zie ik meteen waar je nu staat. Heb je dat niet, geen probleem, dat bespreken we samen zodat je alsnog een goede start maakt.</p>

    <p style="font-size:15px;margin:0 0 14px;">Ik neem zo snel mogelijk contact met je op, binnen 1 tot 3 werkdagen, om onze eerste belafspraak in te plannen. Ik kijk ernaar uit om je te mogen begeleiden. Heb je nog vragen, reageer gerust op deze mail.</p>

    <p style="font-size:14px;margin:18px 0 0;color:#555;">Met vriendelijke groet,<br><strong style="color:#1a1a1a;">Michel Kreder</strong><br>06 39771314<br><a href="https://www.michelkredercoaching.nl" style="color:#FF6B00;">www.michelkredercoaching.nl</a></p>

    <div style="margin:26px 0 0;padding:20px 22px;background:#f6f6f6;border-radius:10px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#888;">Overzicht van je inschrijving</p>
      <table style="border-collapse:collapse;font-size:14px;"><tbody>
        ${r('Naam', b.naam)}
        ${r('Geboortedatum', b.geboortedatum)}
        ${r('Adres', b.adres)}
        ${r('Postcode', b.postcode)}
        ${r('Woonplaats', b.woonplaats)}
        ${r('Telefoon', b.telefoon)}
        ${r('E-mail', b.email)}
        ${r('Pakket', b.pakket)}
        ${r('Vermogen of hartslag', b.meetmethode)}
        ${r('Omslagpunt/FTP', b.ftp)}
        ${r('Trainingen per week', b.frequentie)}
        ${r('Uren per week', b.uren)}
        ${r('Doel', b.doel)}
        ${r('Opmerkingen', b.opmerkingen)}
        ${r('Cadeaubon', b.cadeaubon)}
        ${r('Gevonden via', b.gevonden)}
      </tbody></table>
    </div>
  </div>`;
  return naarHtmlEntities(html);
}

// Afleveringsmail van De Proeftraining. Past zich aan op meetmethode: bij vermogen
// draait het om FTP, bij hartslag om het omslagpunt. Bewust zonder pitch, want
// het Startprotocol eindigt zelf al met de stap naar een schema en de
// journey-mails pakken het daarna op.
function proeftrainingHtml(naam, pdfUrl, meetmethode) {
  const veiligeNaam = escHtml((naam || '').split(' ')[0] || 'daar');
  const isVermogen = meetmethode !== 'hartslag';
  const waarde  = isVermogen ? 'FTP' : 'omslagpunt';

  const stap = (nr, titel, tekst) => `
    <tr>
      <td style="width:34px;vertical-align:top;padding:0 12px 18px 0;">
        <div style="width:26px;height:26px;border-radius:6px;background:#ff6b1a;color:#ffffff;font-weight:800;font-size:14px;text-align:center;line-height:26px;">${nr}</div>
      </td>
      <td style="vertical-align:top;padding:0 0 18px;">
        <p style="font-size:15px;font-weight:800;margin:0 0 4px;color:#1a1a1a;">${titel}</p>
        <p style="font-size:14px;margin:0;color:#555;">${tekst}</p>
      </td>
    </tr>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.65;max-width:560px;">
    <p style="font-size:16px;margin:0 0 14px;">Hi ${veiligeNaam},</p>
    <p style="font-size:15px;margin:0 0 18px;">Je proeftraining staat klaar. Twee dingen, en de eerste kun je nu meteen doen.</p>

    <table style="border-collapse:collapse;width:100%;">
      ${stap(1, 'Download het Startprotocol', `Daarin staat de nulmeting waarmee je je eigen ${waarde} bepaalt, je zones met hoe hard ze horen te voelen, en de proeftraining helemaal uitgeschreven. Je kunt dus vandaag al rijden.`)}
      ${stap(2, 'Koppel je TrainingPeaks', 'Klik op de tweede knop hieronder. Je logt in of maakt een gratis account aan, en daarmee hang je aan mijn coachaccount. Kost je een minuut. Zodra je gekoppeld bent zet ik de proeftraining in je kalender, en met je Garmin, Wahoo of Zwift eraan verschijnt hij vanzelf op je stuur, met de blokken en de tijden er al in.')}
    </table>

    <p style="margin:4px 0 12px;">
      <a href="${escHtml(pdfUrl)}" style="display:inline-block;background:#ff6b1a;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 30px;border-radius:8px;">Download het Startprotocol</a>
    </p>
    <p style="margin:0 0 18px;">
      <a href="${TP_COACH_LINK}" style="display:inline-block;border:2px solid #ff6b1a;color:#ff6b1a;text-decoration:none;font-weight:800;font-size:16px;padding:12px 28px;border-radius:8px;">Koppel mijn TrainingPeaks</a>
    </p>

    <div style="border-top:1px solid #eee;padding-top:16px;margin:0 0 4px;">
      <p style="font-size:14px;margin:0 0 8px;color:#444;"><strong>Nog geen TrainingPeaks?</strong> Dan maak je er via diezelfde knop meteen een aan. Je vult je mailadres en een wachtwoord in, en klaar. <strong>Een gratis account is genoeg</strong> voor alles wat je hier nodig hebt, je hoeft nergens je pas voor te trekken.</p>
      <p style="font-size:14px;margin:0 0 8px;color:#444;">Heb je al een account? Log dan gewoon in via de knop, dan koppelt hij vanzelf.</p>
      <p style="font-size:13px;margin:0;color:#888;">Handig voor onderweg: de app voor <a href="${TP_APPLE}" style="color:#ff6b1a;font-weight:700;">iPhone</a> of <a href="${TP_ANDROID}" style="color:#ff6b1a;font-weight:700;">Android</a>.</p>
    </div>

    <div style="margin:22px 0;padding:22px;background:#0d0d0d;border-radius:12px;">
      <p style="font-size:12px;font-weight:800;color:#ff6b1a;letter-spacing:1.5px;margin:0 0 10px;text-transform:uppercase;">Nog één ding</p>
      <p style="font-size:18px;line-height:1.4;color:#ffffff;margin:0 0 8px;font-weight:800;">Rijd hem op een dag dat je fris bent.</p>
      <p style="font-size:14px;color:#c8c8c8;margin:0;">Niet als afsluiter van een drukke week en niet de dag na een zware rit. Deze training is kort maar fel, dus je haalt er alleen iets uit als je benen er zin in hebben. Twijfel je tussen vandaag en overmorgen, kies dan overmorgen.</p>
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
              : b.route === 'begeleiding'     ? 'begeleiding'
              : b.route === 'gratis-training' ? 'gratis-training'
              :                                 'schema';

  // Proeftraining: bepaal meteen welke variant van het Startprotocol deze bezoeker
  // krijgt, zodat we niet eerst een contact aanmaken en daarna alsnog stuklopen
  // op een ontbrekende URL.
  const gtMeetmethode = b.meetmethode === 'hartslag' ? 'hartslag' : 'vermogen';
  const gtDownloadUrl = gtMeetmethode === 'hartslag' ? SP_PDF_HARTSLAG : SP_PDF_VERMOGEN;
  if (route === 'gratis-training' && !gtDownloadUrl) {
    console.error('Proeftraining: Startprotocol-URL ontbreekt voor meetmethode', gtMeetmethode);
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

  // Begeleiding-inschrijving: pakket vastleggen + meetmethode, zodat Michel
  // in Mailchimp ziet welk pakket en (indien ingevuld) waarop iemand traint.
  if (route === 'begeleiding') {
    if (b.pakket)      merge.KHPAKKET = String(b.pakket);
    if (b.meetmethode) merge.MEETMETH = String(b.meetmethode);
  }

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
              : route === 'begeleiding'     ? TAG_BEGELEIDING
              : route === 'gratis-training' ? TAG_GRATIS
              :                               TAG_SCHEMA;
    await hertag(base, headers, hash, tag);

    // 2b) Proeftraining: het juiste Startprotocol meteen mailen (bevestigt het adres)
    //     en teruggeven aan de pagina voor een directe download.
    if (route === 'gratis-training') {
      await stuurMail({
        from: AFZENDER, to: email, reply_to: REPLY_TO,
        subject: 'Je proeftraining staat klaar',
        html: proeftrainingHtml(b.naam, gtDownloadUrl, gtMeetmethode),
      });
      // Notificatie naar Michel, zodat hij in één oogopslag ziet wie er is
      // binnengekomen en wie hij moet uitnodigen in TrainingPeaks. Reply-to
      // staat op de lead, dus antwoorden gaat rechtstreeks naar de renner.
      await stuurMail({
        from: AFZENDER, to: INTERNE_MAIL,
        reply_to: email,
        subject: `🚴 Proeftraining: ${String(b.naam || email)} · ${gtMeetmethode === 'hartslag' ? 'hartslag' : 'vermogen'}`,
        html: interneProeftrainingHtml({ naam: b.naam, email, meetmethode: gtMeetmethode }),
      });
      console.log('Proeftraining OK:', email, '| meetmethode:', gtMeetmethode);
      // downloadUrl en pdfUrl wijzen allebei naar het Startprotocol, zodat de
      // huidige pagina blijft werken zolang die nog niet opnieuw geplakt is.
      // fitUrl geven we bewust niet meer mee: het .fit-bestand is vervallen.
      return res.status(200).json({
        ok: true,
        downloadUrl: gtDownloadUrl,
        pdfUrl: gtDownloadUrl,
        meetmethode: gtMeetmethode,
      });
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

    // 3b) Volledige begeleiding-inschrijving: alle gegevens naar Michel +
    //     warme bevestiging naar de klant. Zelfde mailpatroon als coaching,
    //     maar met het complete inschrijfformulier.
    if (route === 'begeleiding') {
      await stuurMail({
        from: AFZENDER, to: INTERNE_MAIL,
        reply_to: email,
        subject: `🚴 Inschrijving begeleiding: ${String(b.naam || email)} · ${String(b.pakket || 'begeleiding')}`,
        html: interneBegeleidingHtml(b),
      });
      await stuurMail({
        from: AFZENDER, to: email, reply_to: REPLY_TO,
        subject: 'Welkom bij Michel Kreder Coaching, zo maken we een vliegende start',
        html: onboardingBegeleidingHtml({ ...b, email }),
      });
    }

    console.log('Keuzehulp OK:', email, '| route:', route, '| schema:', b.schema || '-', '| inschrijving:', b.inschrijving || '-');
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Keuzehulp: Mailchimp faalde:', e);
    return res.status(502).json({ ok: false, fout: 'mailchimp niet bereikbaar' });
  }
}
