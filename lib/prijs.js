// /lib/prijs.js
// ÉÉN bron van waarheid voor de prijs. Zowel /api/betaling (het bedrag dat
// Mollie afschrijft) als /api/prijs (wat de pagina toont) gebruiken dit.
// Pas ALLEEN hier de datum/bedragen aan — dan kunnen pagina en afschrijving
// nooit meer uit elkaar lopen.
//
// LET OP tijdzone: de deal loopt t/m 30 juni 2026. We zetten het einde op het
// UTC-moment dat overeenkomt met 1 juli 2026, 00:00 in Amsterdam (zomertijd =
// UTC+2), dus 30 juni 22:00 UTC. Daarna automatisch €29.
export const DEAL_EINDE = new Date('2026-06-30T22:00:00Z');

export function huidigePrijs(now = new Date()) {
  const isDeal = now < DEAL_EINDE;
  return {
    isDeal,
    prijs: isDeal ? 19 : 29,        // getal, voor weergave
    ankerPrijs: 29,                 // doorgestreepte "van"-prijs
    bedrag: isDeal ? '19.00' : '29.00', // string in Mollie-formaat
    eindeISO: DEAL_EINDE.toISOString()
  };
}
