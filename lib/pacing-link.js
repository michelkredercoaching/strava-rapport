// /lib/pacing-link.js
// Persoonlijke pacingplan-link (besluit Michel 15-10-2026). Werkt als de link van de
// Strava-analyse: wie het pacingplan koopt, krijgt een link die 5 dagen voor zijn tocht
// opengaat. Dan koppelt hij zelf Strava, wij rekenen pacing en voeding uit en
// ontkoppelen direct (de Strava-app heeft maar 10 plekken, zie core-strava-knop).
//
// Token (base64url): "pacing|<email>|<tochtdatum JJJJ-MM-DD>|<id>|<handtekening>"
// Handtekening = HMAC met PP_TOKEN_SECRET, net als lib/korting.js.
import crypto from 'node:crypto';

const SECRET = process.env.PP_TOKEN_SECRET || '';
export const PACING_DAGEN_VOOR = 5;

const teken = (p) => crypto.createHmac('sha256', SECRET).update(p).digest('hex').slice(0, 16);

export function maakPacingToken(email, datum, id) {
  if (!SECRET || !email || !/^\d{4}-\d{2}-\d{2}$/.test(String(datum || ''))) return null;
  const pid = id || crypto.randomBytes(6).toString('hex');
  const p = `pacing|${String(email).toLowerCase()}|${datum}|${pid}`;
  return Buffer.from(`${p}|${teken(p)}`).toString('base64url');
}

export function leesPacingToken(token) {
  if (!SECRET || !token) return null;
  let t = ''; try { t = Buffer.from(String(token), 'base64url').toString('utf8'); } catch (e) { return null; }
  const d = t.split('|');
  if (d.length !== 5 || d[0] !== 'pacing') return null;
  const p = d.slice(0, 4).join('|');
  const a = Buffer.from(teken(p)), b = Buffer.from(d[4]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { email: d[1], datum: d[2], id: d[3] };
}

// Nederlandse middernacht van een datum (JJJJ-MM-DD) plus n dagen, in ms.
function nlDag(datum, plusDagen) {
  const [j, m, dg] = datum.split('-').map(Number);
  const utc = Date.UTC(j, m - 1, dg + plusDagen, 12);
  const off = new Date(utc).toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/);
  const uur = off ? Number(off[1]) : 1;
  return Date.UTC(j, m - 1, dg + plusDagen, 0) - uur * 3600e3;
}

// Wanneer is de link bruikbaar? Van 5 dagen voor de tocht (00:00) tot en met de dag ervoor.
export function pacingVenster(datum, nu = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datum || ''))) return null;
  const opent = nlDag(datum, -PACING_DAGEN_VOOR), sluit = nlDag(datum, 0);
  return { opent, sluit, status: nu < opent ? 'te-vroeg' : nu < sluit ? 'open' : 'verlopen' };
}
