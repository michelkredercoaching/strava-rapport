// /lib/prijs.js
// ÉÉN bron van waarheid voor de prijs. Zowel /api/betaling (het bedrag dat
// Mollie afschrijft) als /api/prijs (wat de pagina toont) gebruiken dit.
//
// De wachtlijst-deal is afgelopen: de prijs is vast €29 eenmalig.
// (Wil je later opnieuw een tijdelijke actie? Zet dan een einddatum terug en
//  maak huidigePrijs weer datum-afhankelijk — de structuur is bewaard gebleven.)
export const DEAL_EINDE = null;

export function huidigePrijs(now = new Date()) {
  return {
    isDeal: false,
    prijs: 29,            // getal, voor weergave
    ankerPrijs: 29,       // geen doorgestreepte "van"-prijs meer
    bedrag: '29.00',      // string in Mollie-formaat
    eindeISO: null
  };
}
