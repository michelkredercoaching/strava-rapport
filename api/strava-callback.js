import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { id, sid } = req.query;

  if (!id || !sid) {
    return res.redirect('/?error=missing_params');
  }

  try {
    // Controleer betaalstatus bij Mollie
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}` }
    });
    const betaling = await mollieRes.json();

    if (betaling.status === 'paid') {
      // Haal Strava data op uit KV store
      const rawData = await kv.get(`rapport:${sid}`);
      if (!rawData) {
        return res.redirect('/?error=data_verlopen');
      }
      const stravaData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      const dataParam = encodeURIComponent(JSON.stringify(stravaData));
      return res.redirect(`/?betaald=true&data=${dataParam}`);

    } else if (betaling.status === 'pending' || betaling.status === 'open') {
      return res.redirect('/?betaald=pending');

    } else {
      // Geannuleerd of mislukt
      return res.redirect('/?error=betaling_mislukt');
    }
  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect('/?error=server_error');
  }
}
