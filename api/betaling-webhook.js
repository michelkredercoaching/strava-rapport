// /api/betaling-webhook.js
// Mollie belt dit adres server-naar-server zodra een betaalstatus verandert.
// Bij status 'paid' sturen we een interne verkoop-mail naar Michel (naam + FTP + data).
//
// LET OP — pas deze twee regels aan:
//  - INTERNE_MAIL : het adres waar JIJ de verkoopmelding wilt ontvangen.
//  - AFZENDER     : zolang je domein in Resend nog niet geverifieerd is, MOET dit
//                   'onboarding@resend.dev' blijven en mag de mail alleen naar je
//                   eigen Resend-accountadres. Zodra michelkredercoaching.nl
//                   geverifieerd is, zet dit op bv. 'rapport@michelkredercoaching.nl'.
const INTERNE_MAIL = 'michel.kredercoaching@gmail.com';
const AFZENDER = 'onboarding@resend.dev';

export default async function handler(req, res) {
  // Mollie verwacht ALTIJD een 200, anders blijft hij het opnieuw proberen.
  try {
    if (req.method !== 'POST') {
      return res.status(200).send('ok');
    }

    // Mollie stuurt het payment-id als form-veld 'id' in de body.
    const id = (req.body && req.body.id) || (req.query && req.query.id);
    if (!id) {
      return res.status(200).send('geen id');
    }

    // Haal de betaling op bij Mollie om de échte status te checken.
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
      headers: { Authorization: `Bearer ${process.env.MOLLIE_API_KEY}` }
    });
    const betaling = await mollieRes.json();

    if (betaling.status !== 'paid') {
      // Niet betaald (open/expired/failed/canceled) → niks doen, wel 200 geven.
      return res.status(200).send('niet betaald');
    }

    const m = betaling.metadata || {};
    const naam = m.naam || 'Sporter';
    const ftp = m.ftp || '?';
    const uren = m.uren != null ? m.uren : '?';
    const score = m.score != null ? m.score : '?';
    const vo2max = m.vo2max != null ? m.vo2max : '?';
    const zones = m.zones || '';
    const bedrag = betaling.amount ? `€${betaling.amount.value}` : '€19,00';

    const html = `
      <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6;">
        <h2 style="margin:0 0 4px;">🚴 Nieuwe verkoop</h2>
        <p style="margin:0 0 16px;color:#666;">Strava Trainingsrapport · ${bedrag} betaald</p>
        <table style="border-collapse:collapse;font-size:15px;">
          <tr><td style="padding:4px 16px 4px 0;color:#666;">Naam</td><td style="padding:4px 0;font-weight:700;">${naam}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666;">FTP</td><td style="padding:4px 0;font-weight:700;">${ftp} W</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666;">Uren/week</td><td style="padding:4px 0;">${uren}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666;">Trainingsscore</td><td style="padding:4px 0;">${score}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666;">VO2max-sessies</td><td style="padding:4px 0;">${vo2max}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666;">Zones (H-D-T-S-FTP-VO2)</td><td style="padding:4px 0;">${zones}</td></tr>
        </table>
        <p style="margin:16px 0 0;color:#999;font-size:12px;">Mollie betaling-id: ${id}</p>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Trainingsrapport <${AFZENDER}>`,
        to: INTERNE_MAIL,
        subject: `🚴 Nieuwe verkoop — ${naam} · FTP ${ftp}W`,
        html
      })
    });

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook error:', err);
    // Toch 200 — anders blijft Mollie eindeloos opnieuw proberen.
    return res.status(200).send('ok');
  }
}
