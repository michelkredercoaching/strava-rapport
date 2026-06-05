export default async function handler(req, res) {
  console.log('Callback query params:', JSON.stringify(req.query));
  
  // Mollie stuurt geen automatische payment ID in redirect
  // We zoeken de meest recente betaling op via de lijst
  const { id } = req.query;

  if (!id || id === '{id}') {
    // Geen ID — zoek meest recente betaling
    try {
      const listRes = await fetch('https://api.mollie.com/v2/payments?limit=1', {
        headers: { 'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}` }
      });
      const lijst = await listRes.json();
      const recenteBetaling = lijst._embedded?.payments?.[0];
      
      console.log('Meest recente betaling:', recenteBetaling?.id, recenteBetaling?.status);
      
      if (recenteBetaling?.status === 'paid') {
        const stravaData = recenteBetaling.metadata?.stravaData || '{}';
        return res.redirect(`/?betaald=true&data=${encodeURIComponent(stravaData)}`);
      } else if (recenteBetaling?.status === 'failed' || recenteBetaling?.status === 'canceled' || recenteBetaling?.status === 'expired') {
        return res.redirect('/?error=betaling_mislukt');
      } else {
        return res.redirect('/?betaald=pending');
      }
    } catch (err) {
      console.error('Callback error:', err);
      return res.redirect('/?error=server_error');
    }
  }

  // ID beschikbaar — haal specifieke betaling op
  try {
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}` }
    });
    const betaling = await mollieRes.json();
    
    console.log('Betaling status:', betaling.id, betaling.status);

    if (betaling.status === 'paid') {
      const stravaData = betaling.metadata?.stravaData || '{}';
      return res.redirect(`/?betaald=true&data=${encodeURIComponent(stravaData)}`);
    } else if (betaling.status === 'failed' || betaling.status === 'canceled' || betaling.status === 'expired') {
      return res.redirect('/?error=betaling_mislukt');
    } else {
      return res.redirect('/?betaald=pending');
    }
  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect('/?error=server_error');
  }
}
