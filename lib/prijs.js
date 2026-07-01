// /lib/prijs.js
// ÉÉN bron van waarheid voor de prijs. Zowel /api/betaling (het bedrag dat
// Mollie afschrijft) als /api/prijs (wat de pagina toont) gebruiken dit.
//
// Lanceeractie is afgelopen (1 juli): de prijs is weer €29, geen deal meer.
export const DEAL_EINDE = null;

export function huidigePrijs(now = new Date()) {
  return {
    isDeal: false,
    prijs: 29,            // getal, voor weergave
    ankerPrijs: null,     // geen doorgestreepte "van"-prijs meer
    bedrag: '29.00',      // string in Mollie-formaat
    eindeISO: null
  };
}
