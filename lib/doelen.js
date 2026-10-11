// lib/doelen.js
// Doelen (11-10-2026): nieuwe gebruikers kiezen waar ze voor trainen. De app
// stemt er tips en meldingen op af. Eén dagelijkse ronde (api/app.js
// actie=doelronde, Vercel Cron) kijkt per persoon welke stap aan de beurt is.
//
// Redis: app:doel:<email> = { doel, naam?, datum?, op, gestuurd: [stap,...], klaar? }
//        app:doel:alle    = set met e-mailadressen
//
// Doelen en stappen:
//   sneller    dag 21-40, geen analyse, geen coaching  -> Strava-analyse
//              dag 45-70, wel analyse, geen schema       -> schema op je analyse
//   evenement  4 weken ervoor -> laatste blok; 1 week ervoor -> groots neerzetten;
//              dag ervoor -> banden en voeding klaar; 2 dagen erna -> hoe ging het + nieuw doel
//   afvallen   bij kiezen: interesse Afvalprogramma; dag 7 -> tip
//   fit        dag 10 -> groepsrit; dag 30, geen schema/coaching -> winter of Startpakket

export const DOELEN = {
  sneller: 'Sneller worden',
  evenement: 'Een tocht of wedstrijd',
  afvallen: 'Afvallen',
  fit: 'Fit blijven en plezier'
};

const DAG = 86400000;
const dagen = (vanaf, tot = Date.now()) => Math.floor((tot - vanaf) / DAG);

export function leesDoel(raw) {
  try { const d = raw ? JSON.parse(raw) : null; return d && DOELEN[d.doel] ? d : null; } catch { return null; }
}

// Controle van wat de app instuurt.
export function nieuwDoel(body, oud) {
  const doel = String(body.doel || '');
  if (!DOELEN[doel]) return { fout: 'Kies een doel.' };
  const d = { doel, op: new Date().toISOString(), gestuurd: [] };
  if (doel === 'evenement') {
    const naam = String(body.naam || '').trim().slice(0, 60);
    const datum = String(body.datum || '').slice(0, 10);
    const t = Date.parse(datum + 'T08:00:00');
    if (!naam) return { fout: 'Hoe heet je tocht of wedstrijd?' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !(t > Date.now() - DAG) || t > Date.now() + 400 * DAG) return { fout: 'Kies een datum binnen een jaar.' };
    d.naam = naam; d.datum = datum;
  }
  // Zelfde doel opnieuw bewaard (bijv. datum aangepast)? Dan de al gestuurde stappen houden.
  if (oud && oud.doel === doel && !oud.klaar) { d.op = oud.op; d.gestuurd = oud.gestuurd || []; if (oud.datum !== d.datum) d.gestuurd = d.gestuurd.filter((s) => !s.startsWith('ev-')); }
  return { doel: d };
}

// Welke melding is vandaag aan de beurt? info = { analyse, schema, coaching }
export function volgendeStap(d, info) {
  if (!d || d.klaar) return null;
  const al = new Set(d.gestuurd || []);
  const sinds = dagen(Date.parse(d.op));
  const st = (id, m) => (al.has(id) ? null : { id, ...m });
  if (d.doel === 'sneller') {
    if (!info.coaching && !info.analyse && sinds >= 21 && sinds <= 40) return st('sn-analyse', {
      titel: 'Drie weken verder. Weet je al waar je staat?',
      tekst: 'Je wilt sneller worden. De Strava-analyse laat uit je eigen ritten zien wat je FTP is, welk type renner je bent en waar jij de meeste winst pakt. Voor €29, in een paar minuten klaar.',
      link: '/app#analyse' });
    if (!info.coaching && info.analyse && !info.schema && sinds >= 45 && sinds <= 70) return st('sn-schema', {
      titel: 'Je weet waar je staat. Nu nog het plan.',
      tekst: 'Met je analyse weet je wat je FTP is en waar je winst zit. Een schema dat daarop aansluit maakt van die kennis echte watts. Je tegoed van de analyse telt mee.',
      link: '/app#analyse' });
  }
  if (d.doel === 'evenement' && d.datum) {
    const tot = -dagen(Date.parse(d.datum + 'T08:00:00'));
    const naam = d.naam || 'je tocht';
    if (tot > 7 && tot <= 28 && sinds >= 2) return st('ev-4wk', {
      titel: `Nog ${Math.ceil(tot / 7)} weken tot ${naam}`,
      tekst: info.coaching ? 'Dit zijn de weken waarin het samenkomt. Twijfel je over je opbouw, stem het even af met Michel.' : 'Dit zijn de weken waarin het samenkomt. Vraag je coach in de app hoe je ze opbouwt, of kies een schema dat precies op je datum eindigt.',
      link: '/app#coach' });
    if (tot > 1 && tot <= 7) return st('ev-1wk', {
      titel: `Volgende week ${naam}. Zet hem groots neer.`,
      tekst: 'Train deze week minder, maar houd een paar korte versnellingen om scherp te blijven. Kijk de dag ervoor in de app naar je bandenspanning, kleding en ritvoeding voor precies die dag.',
      link: '/app#rijden' });
    if (tot === 1) return st('ev-morgen', {
      titel: `Morgen is het zover: ${naam}`,
      tekst: 'Leg vanavond je voeding klaar en check je banden. In de app zie je wat je pompt en hoeveel je meeneemt voor morgen. Heel veel plezier!',
      link: '/app#rijden' });
    if (tot <= -2 && tot >= -10) return st('ev-na', {
      titel: `Hoe ging ${naam}?`,
      tekst: 'Vertel het je coach in de app, en kies meteen je volgende doel. Zo blijft de app met je meedenken.',
      link: '/app#doel', klaar: true });
  }
  if (d.doel === 'afvallen' && sinds >= 7 && sinds <= 30) return st('af-tip', {
    titel: 'Lichter worden zonder watts te verliezen',
    tekst: 'De grootste valkuil: te weinig eten op trainingsdagen. Eet rond je zware ritten gewoon koolhydraten en zoek je tekort op rustige dagen. Het Afvalprogramma met je eigen richtlijn per dag komt begin 2027, jij hoort het als eerste.',
    link: '/app#afval' });
  if (d.doel === 'fit') {
    if (sinds >= 10 && sinds <= 25) return st('fit-groep', {
      titel: 'Samen rijden houdt het leuk',
      tekst: 'Plan een groepsrit in de app en deel de link in je groepsapp. Iedereen ziet het weer, de wind en zijn eigen bandenspanning voor die rit.',
      link: '/app#rijden' });
    if (!info.coaching && !info.schema && sinds >= 30 && sinds <= 50) return st('fit-plan', {
      titel: 'Zin in een doel voor deze winter?',
      tekst: 'Een vast plan maakt het makkelijker om door te blijven rijden, ook als het koud is. Kijk in de app bij Volgende stap wat bij je past.',
      link: '/app' });
  }
  return null;
}

// Korte regel voor de coach (systeemprompt).
export function doelContext(d) {
  if (!d || d.klaar) return '';
  if (d.doel === 'evenement') return `Doel van deze renner: ${d.naam} op ${d.datum} (nog ${-dagen(Date.parse(d.datum + 'T08:00:00'))} dagen). Stem je advies daarop af.`;
  return `Doel van deze renner: ${DOELEN[d.doel].toLowerCase()}. Stem je advies daarop af.`;
}
