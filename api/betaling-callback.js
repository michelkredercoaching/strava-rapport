export default async function handler(req, res) {
  const { data, id } = req.query;

  // Controleer betaalstatus bij Mollie
  if (id) {
    try {
      const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}`
        }
      });
      const betaling = await mollieRes.json();

      if (betaling.status === 'paid') {
        // Betaling geslaagd - stuur naar rapport
        const stravaData = betaling.metadata?.stravaData || data;
        return res.redirect(`/?betaald=true&data=${encodeURIComponent(stravaData)}#rapport`);
      } else if (betaling.status === 'failed' || betaling.status === 'canceled' || betaling.status === 'expired') {
        return res.redirect('/?error=betaling_mislukt');
      } else {
        // Pending - stuur naar bedankt pagina
        return res.redirect('/?betaald=pending');
      }
    } catch (err) {
      console.error('Callback error:', err);
      return res.redirect('/?error=server_error');
    }
  }

  // Geen ID - fallback
  if (data) {
    return res.redirect(`/?betaald=true&data=${data}#rapport`);
  }

  return res.redirect('/?error=betaling_mislukt');
}
