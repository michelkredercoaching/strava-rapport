// /api/prijs.js
// Geeft de actuele prijs/deal-status terug. De frontend gebruikt dit om te
// bepalen of de wachtlijst-deal getoond wordt — i.p.v. de browserklok.
import { huidigePrijs } from '../lib/prijs.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(huidigePrijs());
}
