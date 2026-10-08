// lib/schema-prijzen.js
// Schemaprijzen op één plek. Tot de lancering van de MKC-app (vr 16-10-2026
// 12:00) per niveau, daarna één prijs per lengte, inclusief de app voor de
// looptijd van het schema (besluit Michel 09-10-2026). Winterprogramma €99.
// Dezelfde omschakeling zit in de WordPress-pagina's en in het snippet
// wordpress-snippets/lancering-prijzen.php (WooCommerce).

export const LANCERING = Date.parse('2026-10-16T12:00:00+02:00');
export const naLancering = (nu = Date.now()) => nu >= LANCERING;

const OUD = {
  8:  { basis: 39, opbouw: 49, piek: 59 },
  12: { basis: 59, opbouw: 69, piek: 79 },
  16: { basis: 79, opbouw: 89, piek: 99 }
};
const NIEUW = { 8: 59, 12: 79, 16: 99 };

export function schemaPrijs(weken, niveau, nu = Date.now()) {
  if (naLancering(nu)) return NIEUW[weken] || null;
  return (OUD[weken] && OUD[weken][String(niveau || '').toLowerCase()]) || null;
}
export const WINTER_PRIJS = (niveau, nu = Date.now()) => naLancering(nu) ? 99 : (String(niveau).toLowerCase() === 'opbouw' ? 99 : 79);
