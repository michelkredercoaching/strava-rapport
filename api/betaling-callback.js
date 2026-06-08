export default async function handler(req, res) {
  const { sid, d } = req.query;

  if (!sid) return res.redirect('/?error=missing_params');

  try {
    // Controleer betaalstatus bij Mollie
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${sid}`, {
      headers: { 'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}` }
    });
    const betaling = await mollieRes.json();

    if (betaling.status === 'paid') {
      if (d) {
        // Data zit in URL parameter
        return res.redirect(`/?betaald=true&data=${d}`);
      }
      return res.redirect('/?betaald=true');
    } else if (betaling.status === 'pending' || betaling.status === 'open') {
      return res.redirect('/?betaald=pending');
    } else {
      return res.redirect('/?error=betaling_mislukt');
    }
  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect('/?error=server_error');
  }
}
