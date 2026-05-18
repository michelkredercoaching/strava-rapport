export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stravaData } = req.body;

  try {
    // Maak Mollie betaling aan
    const mollieRes = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: {
          currency: 'EUR',
          value: '19.00'
        },
        description: 'Strava Trainingsrapport — Michel Kreder Coaching',
        redirectUrl: `https://rapport.michelkredercoaching.nl/api/betaling-callback?data=${encodeURIComponent(JSON.stringify(stravaData))}`,
        webhookUrl: 'https://rapport.michelkredercoaching.nl/api/betaling-webhook',
        metadata: {
          stravaData: JSON.stringify(stravaData)
        }
      })
    });

    const betaling = await mollieRes.json();

    if (betaling._links?.checkout?.href) {
      return res.status(200).json({ checkoutUrl: betaling._links.checkout.href });
    } else {
      console.error('Mollie error:', betaling);
      return res.status(500).json({ error: 'Betaling aanmaken mislukt' });
    }

  } catch (err) {
    console.error('Betaling error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
