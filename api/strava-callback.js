// Mollie stuurt de klant na betaling hierheen. De echte verificatie gebeurt
// server-side in /api/rapport (die checkt bij Mollie of de betaling 'paid' is
// vóór het ontsleutelen). Hier sturen we de klant simpelweg door naar het
// rapport-scherm; zonder geldige betaalde transactie krijgt 'ie daar niks te zien.
export default async function handler(req, res) {
  return res.redirect('/?betaald=true');
}
