// /lib/prijs.js
// ÉÉN bron van waarheid voor de prijs. Zowel /api/betaling (het bedrag dat
// Mollie afschrijft) als /api/prijs (wat de pagina toont) gebruiken dit.
//
// Actie loopt: de prijs is €19 (i.p.v. €29). Zet huidigePrijs terug naar 29
// zodra de actie stopt — en zet dan ook de €19-teksten in index.html terug.
export const DEAL_EINDE = null;

export function huidigePrijs(now = new Date()) {
  return {
    isDeal: true,
    prijs: 19,            // getal, voor weergave
    ankerPrijs: 29,       // doorgestreepte "van"-prijs
    bedrag: '19.00',      // string in Mollie-formaat
    eindeISO: null
  };
}
