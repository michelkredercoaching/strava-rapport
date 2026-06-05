export default async function handler(req, res) {
  // Mollie stuurt payment ID als query param na redirect
  const { id } = req.query;

  if (!id) {
    return res.redirect('/?error=geen_betaling_id');
  }

  try {
    // Haal betaling op bij Mollie
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}`
      }
    });
    const betaling = await mollieRes.json();

    if (betaling.status === 'paid') {
      // Haal Strava data op uit metadata
      const stravaData = betaling.metadata?.stravaData || '{}';
      const dataParam = encodeURIComponent(stravaData);
      return res.redirect(`/?betaald=true&data=${dataParam}`);
    } else if (betaling.status === 'failed' || betaling.status === 'canceled' || betaling.status === 'expired') {
      return res.redirect('/?error=betaling_mislukt');
    } else {
      // Pending
      return res.redirect('/?betaald=pending');
    }
  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect('/?error=server_error');
  }
}
