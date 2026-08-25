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
// ===== TWEEDE FUNCTIE: WOOCOMMERCE-TEST =====
//   https://rapport.michelkredercoaching.nl/api/maak-korting?sleutel=...&test=woo
// Controleert of Vercel bij de WooCommerce-API kan, zodat je een blokkade kunt
// opsporen zonder elke keer een echte betaling te doen. Dit zit bewust IN dit
// bestand en niet in een eigen endpoint: het Hobby-plan van Vercel staat maximaal
// 12 serverless functions toe en die zijn allemaal in gebruik.
//
// Vereist in Vercel: ADMIN_SLEUTEL — een zelfgekozen wachtwoord, alleen voor
// deze pagina. Bewust een ANDERE sleutel dan PP_TOKEN_SECRET: die laatste
// ondertekent de tokens zelf en hoort nooit in een browser-URL te staan.
// Zonder de juiste sleutel doet dit adres alsof het niet bestaat (404).
import crypto from 'node:crypto';
import { maakKortingToken } from '../lib/korting.js';
import { wooVerzoek } from '../lib/woo-factuur.js';

function sleutelKlopt(gegeven, secret) {
  const a = Buffer.from(String(gegeven || ''));
  const b = Buffer.from(String(secret));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Doet exact hetzelfde verzoek als de factuurcode, maar dan alleen LEZEND: het
// haalt het product Strava-analyse op. Krijg je HTML terug in plaats van JSON,
// dan zit er een firewall (Cloudflare of Wordfence) tussen, en staat in dat
// stukje HTML wie het verzoek tegenhoudt.
async function wooTest(res) {
  const productId = Number(process.env.WC_PRODUCT_ANALYSE || 12131);

  // Alleen melden OF een variabele gevuld is, nooit de waarde zelf.
  const regels = [
    `WC_URL             : ${process.env.WC_URL || '(leeg, valt terug op michelkredercoaching.nl)'}`,
    `WC_CONSUMER_KEY    : ${process.env.WC_CONSUMER_KEY ? 'ingesteld' : 'ONTBREEKT'}`,
    `WC_CONSUMER_SECRET : ${process.env.WC_CONSUMER_SECRET ? 'ingesteld' : 'ONTBREEKT'}`,
    `Product-ID         : ${productId}`,
    ''
  ];

  try {
    const r = await wooVerzoek(`/wp-json/wc/v3/products/${productId}`);

    regels.push(`HTTP-status        : ${r.status}`);
    regels.push('');

    if (r.ok) {
      regels.push('GELUKT. Vercel mag bij de WooCommerce-API.');
      regels.push(`Product gevonden   : ${r.data && r.data.name} (${r.data && r.data.price})`);
    } else {
      regels.push('MISLUKT.');
      regels.push(r.fout);
      regels.push('');
      regels.push('--- eerste 1500 tekens van het antwoord ---');
      regels.push(String(r.tekst || '').slice(0, 1500));
    }
  } catch (e) {
    regels.push(`MISLUKT: ${e.message}`);
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(200).send(regels.join('\n'));
}

// ===== ADMIN-PANEEL =====
// Knoppen-pagina waarmee je met 1 klik een verse link maakt. De pagina roept
// dit endpoint zelf aan via fetch met &json=1 en toont elke link met een
// kopieerknop. De sleutel leest de pagina uit haar eigen URL, dus die komt niet
// extra in de HTML-broncode te staan.
function paneelHtml() {
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>Linkgenerator</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;background:#0d0d0d;color:#fafafa;margin:0;padding:28px 16px;}
  .wrap{max-width:680px;margin:0 auto;}
  h1{font-size:15px;color:#ff6b1a;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;}
  .sub{font-size:13px;color:#9a9a9a;line-height:1.6;margin:0 0 20px;}
  .knoppen{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
  .groot{flex:1;min-width:180px;background:#ff6b1a;color:#fff;border:0;border-radius:10px;padding:18px;font-size:17px;font-weight:800;cursor:pointer;}
  .groot.grijs{background:#232323;color:#fafafa;border:1px solid #333;}
  .groot:active{transform:translateY(1px);}
  details{background:#141414;border:1px solid #262626;border-radius:10px;padding:12px 16px;margin-bottom:20px;}
  summary{cursor:pointer;font-size:13px;color:#c8c8c8;}
  .rij{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-top:14px;}
  .rij label{font-size:12px;color:#9a9a9a;display:flex;flex-direction:column;gap:4px;}
  .rij input{background:#0d0d0d;color:#fafafa;border:1px solid #2b2b2b;border-radius:8px;padding:9px;font-size:14px;width:90px;}
  .rij button{background:#ff6b1a;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:800;cursor:pointer;}
  .res{background:#161616;border:1px solid #2b2b2b;border-radius:10px;padding:12px;margin-bottom:10px;}
  .lab{font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#ff6b1a;margin-bottom:8px;}
  .res .row{display:flex;gap:8px;}
  .lnk{flex:1;background:#0d0d0d;color:#fafafa;border:1px solid #2b2b2b;border-radius:8px;padding:10px;font-size:12px;}
  .kop{background:#ff6b1a;color:#fff;border:0;border-radius:8px;padding:0 16px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;}
</style></head><body>
<div class="wrap">
  <h1>Power Profile &mdash; linkgenerator</h1>
  <p class="sub">Klik en de link staat klaar met kopieerknop. Elke link werkt precies &eacute;&eacute;n keer. Standaard 30 dagen geldig.</p>
  <div class="knoppen">
    <button class="groot" onclick="maak(0,30)">🎁 Gratis link</button>
    <button class="groot grijs" onclick="maak(1,30)">&euro;1 link</button>
  </div>
  <details>
    <summary>Meer opties (eigen bedrag, dagen, meerdere tegelijk)</summary>
    <div class="rij">
      <label>Prijs &euro;<input id="p" type="number" min="0" max="29" value="0"></label>
      <label>Dagen<input id="d" type="number" min="1" max="90" value="30"></label>
      <label>Aantal<input id="n" type="number" min="1" max="50" value="1"></label>
      <button onclick="maakCustom()">Maak</button>
    </div>
  </details>
  <div id="uit"></div>
</div>
<script>
  var KEY = new URLSearchParams(location.search).get('sleutel') || '';
  function rij(link, label){
    var box=document.createElement('div'); box.className='res';
    var lab=document.createElement('div'); lab.className='lab'; lab.textContent=label;
    var row=document.createElement('div'); row.className='row';
    var inp=document.createElement('input'); inp.readOnly=true; inp.value=link; inp.className='lnk';
    var btn=document.createElement('button'); btn.className='kop'; btn.textContent='Kopieer';
    btn.onclick=function(){ navigator.clipboard.writeText(link).then(function(){ btn.textContent='Gekopieerd ✓'; setTimeout(function(){ btn.textContent='Kopieer'; },1500); }); };
    row.appendChild(inp); row.appendChild(btn); box.appendChild(lab); box.appendChild(row);
    var uit=document.getElementById('uit'); uit.insertBefore(box, uit.firstChild);
    inp.focus(); inp.select();
  }
  function maak(prijs, dagen, aantal){
    aantal = aantal || 1;
    fetch('?sleutel='+encodeURIComponent(KEY)+'&prijs='+prijs+'&dagen='+dagen+'&aantal='+aantal+'&json=1')
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(!j.ok){ alert(j.fout || 'Er ging iets mis'); return; }
        var label=(Number(prijs)===0?'Gratis':'\\u20ac'+prijs)+' \\u00b7 '+dagen+' dagen';
        (j.links || [j.link]).forEach(function(l){ rij(l, label); });
      })
      .catch(function(e){ alert('Netwerkfout: '+e.message); });
  }
  function maakCustom(){
    var p=+document.getElementById('p').value;
    var d=+document.getElementById('d').value || 30;
    var n=+document.getElementById('n').value || 1;
    maak(p, d, n);
  }
</script>
</body></html>`;
}

export default async function handler(req, res) {
  const secret = process.env.ADMIN_SLEUTEL || '';
  const q = req.query || {};
  if (!secret || !sleutelKlopt(q.sleutel, secret)) return res.status(404).send('niet gevonden');

  if (q.test === 'woo') return wooTest(res);

  const basis = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`;

  // Kale ?sleutel=... (of &paneel=1) → toon het knoppen-paneel. Bookmark dit
  // adres met je sleutel; daarna maak je met 1 klik links. De json/prijs-routes
  // hieronder blijven werken voor de paneel-fetch en de WordPress-snippet.
  if (q.paneel === '1' || (q.prijs == null && q.json == null)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(paneelHtml());
  }

  // ===== LINK(S) MAKEN =====
  const prijs = q.prijs != null && q.prijs !== '' ? q.prijs : 19;
  const dagen = q.dagen || 14;
  const aantal = Math.max(1, Math.min(50, Number(q.aantal) || 1));
  const links = [];
  for (let i = 0; i < aantal; i++) {
    const token = maakKortingToken(prijs, dagen);
    if (token) links.push(`${basis}/?korting=${token}`);
  }

  // ===== JSON-ANTWOORD (&json=1) =====
  // Voor machines/het paneel in plaats van een mensenpagina. De WordPress-snippet
  // die na een bundelbestelling automatisch een gratis analyse-link mailt, roept
  // dit adres server-side aan met &prijs=0&json=1 en krijgt hier de link terug.
  // Bewust in dit bestand en niet in een eigen endpoint: het Hobby-plan van
  // Vercel staat maximaal 12 serverless functions toe en die zijn allemaal in
  // gebruik. Zelfde ADMIN_SLEUTEL, dus de sleutel blijft server-side.
  if (q.json === '1' || q.json === 'true') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!links.length) return res.status(400).json({ ok: false, fout: 'ongeldige prijs (0 t/m 29)' });
    return res.status(200).json({
      ok: true,
      link: links[0],          // eerste link (achterwaarts compatibel met de snippet)
      links,                   // volledige lijst bij &aantal=
      prijs: Number(prijs),
      dagen: Number(dagen) || 14,
      gratis: Number(prijs) === 0
    });
  }

  if (!links.length) return res.status(400).send('Ongeldige prijs — kies een heel bedrag tussen 0 en 29 (0 = gratis).');

  // Losse HTML-linkpagina (bestaande bookmark met &prijs=...). Bij &aantal>1
  // tonen we de eerste; wie er meerdere wil, gebruikt het paneel.
  const gratis = Number(prijs) === 0;
  const link = links[0];

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
