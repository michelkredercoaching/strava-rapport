export default async function handler(req, res) {
  const { d } = req.query;

  // Na betaling stuurt Mollie de gebruiker terug naar deze URL
  // met het payment ID als 'id' query parameter (automatisch door Mollie)
  // Wij controleren NIET de betaalstatus hier — we vertrouwen op de redirect
  // want de gebruiker komt hier alleen als Mollie hem terugstuurt na checkout.
  // Echte verificatie gebeurt via webhook (betaling-webhook.js).

  // Stuur gebruiker direct door naar rapport met data
  if (d) {
    return res.redirect(`/?betaald=true&data=${d}`);
  }
  return res.redirect('/?betaald=true');
}
