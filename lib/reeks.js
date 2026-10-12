// Tijdelijke reeks-tags (12-10-2026)
//
// Probleem: iemand die in 2+ lead-journeys tegelijk zit, kreeg twee
// mailreeksen door elkaar. Met vaste tags (keuzehulp-gedaan e.d.) sluit je
// iemand voor altijd uit, ook als die keuzehulp al maanden oud is.
//
// Oplossing: naast de starttag van een journey zetten we een tijdelijke
// reeks-tag. De vervolgmails in Mailchimp kijken naar die tags:
// "doesn't have any of" de reeks-tags van de reeksen die voorgaan.
// Een dagelijkse cron (api/app.js, actie 'reeksen') haalt een reeks-tag weg
// zodra de starttag ouder is dan REEKS_DAGEN. Geen eigen wachtrij nodig: de
// datum van de starttag in Mailchimp is de klok (opnieuw gezet = opnieuw 21 dagen).
//
// Voorrang (hoog naar laag):
//   reeks-analysekoper > reeks-analyseverlaten > reeks-keuzehulp >
//   reeks-banden > reeks-proef > reeks-zesuur > reeks-winter / reeks-startpakket
//
// De levermail (eerste mail) blijft in elke journey altijd gaan.
import crypto from 'node:crypto';

export const REEKS_DAGEN = 21;

// starttag van de journey -> tijdelijke reeks-tag
export const REEKS_VAN = {
  'power-profile-koper':      'reeks-analysekoper',
  'pp-niet-afgemaakt':        'reeks-analyseverlaten',
  'keuzehulp-gedaan':         'reeks-keuzehulp',
  'bandenspanning-pdf':       'reeks-banden',
  'gratis-training':          'reeks-proef',
  'zesuur-pdf':               'reeks-zesuur',
  'winter-emailcapture':      'reeks-winter',
  'startpakket-emailcapture': 'reeks-startpakket',
};

const MC_KEY  = process.env.MAILCHIMP_API_KEY;
const MC_LIST = process.env.MAILCHIMP_LIST_ID;
const MC_DC   = MC_KEY ? MC_KEY.split('-')[1] : '';
const lijstUrl = () => `https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST}`;
const kop = () => ({ Authorization: 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64'), 'Content-Type': 'application/json' });
const hashVan = (email) => crypto.createHash('md5').update(String(email).toLowerCase()).digest('hex');

async function zetTags(hash, lijst) {
  const r = await fetch(`${lijstUrl()}/members/${hash}/tags`, {
    method: 'POST', headers: kop(), body: JSON.stringify({ tags: lijst }), signal: AbortSignal.timeout(10000),
  });
  return r.ok;
}
async function mc(pad) {
  const r = await fetch(lijstUrl() + pad, { headers: kop(), signal: AbortSignal.timeout(10000) });
  return r.ok ? r.json() : null;
}

// Zet de reeks-tag die bij een starttag hoort.
// stop: starttags waarvan de reeks meteen moet stoppen (bv. bij een aankoop).
// Blokkeert nooit: fouten worden gelogd en verder genegeerd.
export async function zetReeks(email, starttag, { stop = [] } = {}) {
  try {
    const tag = REEKS_VAN[starttag];
    if (!email || !tag || !MC_KEY || !MC_LIST) return;
    const weg = stop.map((s) => REEKS_VAN[s]).filter(Boolean);
    await zetTags(hashVan(email), [{ name: tag, status: 'active' }, ...weg.map((name) => ({ name, status: 'inactive' }))]);
  } catch (e) { console.error('zetReeks faalde (blokkeert niet):', e); }
}

// Cron: reeks-tags weghalen waarvan de starttag ouder is dan REEKS_DAGEN.
// Stopt na ~45 s; wat overblijft komt de volgende ronde aan bod.
export async function ruimReeksenOp({ proef = false } = {}) {
  if (!MC_KEY || !MC_LIST) return { ok: false, fout: 'geen mailchimp' };
  const t0 = Date.now(), grens = Date.now() - REEKS_DAGEN * 864e5;
  const segs = ((await mc('/segments?type=static&count=1000&fields=segments.id,segments.name')) || {}).segments || [];
  const perTag = {};
  for (const [start, reeks] of Object.entries(REEKS_VAN)) {
    const seg = segs.find((s) => s.name === reeks);
    if (!seg) continue;
    const leden = ((await mc(`/segments/${seg.id}/members?count=1000&fields=members.id`)) || {}).members || [];
    let weg = 0, bekeken = 0;
    const een = async (m) => {
      const tags = ((await mc(`/members/${m.id}/tags?count=100`)) || {}).tags || [];
      const datum = (naam) => { const t = tags.find((x) => x.name === naam); return t ? Date.parse(t.date_added) : 0; };
      // Klok = starttag; ontbreekt die (handmatig weggehaald), dan de reeks-tag zelf.
      const sinds = datum(start) || datum(reeks);
      if (sinds && sinds < grens) {
        if (!proef) await zetTags(m.id, [{ name: reeks, status: 'inactive' }]);
        weg++;
      }
    };
    // Vijf tegelijk, ruim binnen de Mailchimp-limiet van 10 gelijktijdige verbindingen.
    for (let i = 0; i < leden.length && Date.now() - t0 < 45000; i += 5) {
      const groep = leden.slice(i, i + 5);
      await Promise.all(groep.map((m) => een(m).catch(() => {})));
      bekeken += groep.length;
    }
    perTag[reeks] = { leden: leden.length, bekeken, weg };
  }
  return { ok: true, proef, perTag, ms: Date.now() - t0 };
}
