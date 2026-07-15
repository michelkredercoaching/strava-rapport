// /api/maak-korting.js
// Alleen voor jou (Michel): maakt in de browser een persoonlijke, EENMALIGE
// kortingslink voor de Power Profile-funnel. Aanroepen:
//
//   https://rapport.michelkredercoaching.nl/api/maak-korting?sleutel=JOUW_ADMIN_SLEUTEL&prijs=19
//
// Optioneel: &dagen=14 (hoe lang de link geldig blijft, standaard 14 dagen).
// Prijs 0 = VOLLEDIG GRATIS: de funnel slaat Mollie over en mailt het rapport
// direct (Mollie kan geen €0 verwerken). Bv. &prijs=0 voor een gratis link.
// De link werkt precies één keer: zodra de betaling/aflevering is afgerond,
// wordt hij in Redis als verzilverd gemarkeerd en daarna geweigerd.
//
// Vereist in Vercel: ADMIN_SLEUTEL — een zelfgekozen wachtwoord, alleen voor
// deze pagina. Bewust een ANDERE sleutel dan PP_TOKEN_SECRET: die laatste
// ondertekent de tokens zelf en hoort nooit in een browser-URL te staan.
// Zonder de juiste sleutel doet dit adres alsof het niet bestaat (404).
import crypto from 'node:crypto';
import { maakKortingToken } from '../lib/korting.js';

function sleutelKlopt(gegeven, secret) {
  const a = Buffer.from(String(gegeven || ''));
  const b = Buffer.from(String(secret));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default function handler(req, res) {
  const secret = process.env.ADMIN_SLEUTEL || '';
  const q = req.query || {};
  if (!secret || !sleutelKlopt(q.sleutel, secret)) return res.status(404).send('niet gevonden');

  const prijs = q.prijs != null && q.prijs !== '' ? q.prijs : 19;
  const dagen = q.dagen || 14;
  const token = maakKortingToken(prijs, dagen);
  if (!token) return res.status(400).send('Ongeldige prijs — kies een heel bedrag tussen 0 en 29 (0 = gratis).');

  const gratis = Number(prijs) === 0;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`;
  const link = `${baseUrl}/?korting=${token}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>Kortingslink</title>
<meta name="robots" content="noindex,nofollow">
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#0d0d0d;color:#fafafa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;}
  .kaart{background:#161616;border:1px solid #2b2b2b;border-radius:12px;padding:28px;max-width:640px;width:calc(100% - 48px);}
  h1{font-size:16px;color:#ff6b1a;letter-spacing:1px;text-transform:uppercase;margin:0 0 14px;}
  p{font-size:14px;color:#c8c8c8;line-height:1.6;margin:0 0 14px;}
  textarea{width:100%;box-sizing:border-box;background:#0d0d0d;color:#fafafa;border:1px solid #2b2b2b;border-radius:8px;padding:12px;font-size:12px;min-height:88px;word-break:break-all;}
  button{background:#ff6b1a;color:#fff;border:0;border-radius:8px;padding:12px 24px;font-size:15px;font-weight:800;cursor:pointer;margin-top:12px;}
</style></head><body>
<div class="kaart">
  <h1>${gratis ? 'Eenmalige GRATIS link klaar' : 'Eenmalige kortingslink klaar'}</h1>
  <p>Prijs voor de klant: <strong style="color:#ff6b1a;">${gratis ? 'Gratis' : '&euro;' + Number(prijs)}</strong> &middot; <strong>${Number(dagen) || 14} dagen</strong> geldig &middot; werkt precies &eacute;&eacute;n keer. Stuur deze link naar &eacute;&eacute;n persoon.${gratis ? ' Die koppelt Strava, vult zijn e-mailadres in en krijgt het volledige rapport meteen per mail &mdash; zonder te betalen (Mollie wordt overgeslagen).' : ' De funnel rekent automatisch de aangepaste prijs.'}</p>
  <textarea id="link" readonly>${link}</textarea>
  <button onclick="navigator.clipboard.writeText(document.getElementById('link').value).then(()=>{this.textContent='Gekopieerd ✓'})">Kopieer link</button>
</div>
</body></html>`);
}
