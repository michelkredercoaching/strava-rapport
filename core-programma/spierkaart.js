// core-programma/spierkaart.js
// ---------------------------------------------------------------------------
// Spierkaart voor de Core-app: een voor- en achteraanzicht van een lichaam
// waarop oranje oplicht wat een oefening of sessie traint. Eigen tekenstijl,
// in dezelfde kleuren als de animaties (figuur.js).
//
// Globaal: window.CoreSpierkaart = { SPIEREN, NAMEN, vanOefening, vanSessie,
//                                   svg, namenLijst }
//   SPIEREN[id] = { buik: 'p', bil: 's', ... }  p = hoofdspier, s = helpt mee
//   svg(kaart, opties) geeft een <svg> met voor- en achteraanzicht.
//
// De id's zijn dezelfde als in lib/core.js (OEFENINGEN) en animaties.js.
// Warming-up en cooling-down staan er bewust niet in: die trainen niets op,
// ze maken los.
(function () {
  // Spiergroepen. Volgorde = volgorde in de namenlijst onder de kaart.
  var NAMEN = {
    buik: 'Buik',
    schuin: 'Schuine buikspieren',
    onderrug: 'Onderrug',
    bil: 'Bilspieren',
    heupzij: 'Zijkant heup',
    heupbuiger: 'Heupbuigers',
    hamstring: 'Hamstrings',
    bovenrug: 'Bovenrug',
    schouders: 'Schouders',
    quads: 'Bovenbenen'
  };

  var SPIEREN = {
    // Lijn 1: voorkant
    'deadbug-gebogen':   { buik: 'p', schuin: 's', heupbuiger: 's' },
    'deadbug-gestrekt':  { buik: 'p', schuin: 's', heupbuiger: 's' },
    'hollow-hold':       { buik: 'p', heupbuiger: 's', quads: 's' },
    'hollow-fietsen':    { buik: 'p', heupbuiger: 'p', quads: 's' },
    // Lijn 2: plank
    'plank-knieen':      { buik: 'p', schouders: 's' },
    'plank':             { buik: 'p', schouders: 's', bil: 's' },
    'plank-schoudertik': { buik: 'p', schuin: 'p', schouders: 's' },
    'plank-lang':        { buik: 'p', schouders: 's', bil: 's' },
    'body-saw':          { buik: 'p', schouders: 'p' },
    // Lijn 3: zijkant
    'zijplank-knieen':   { schuin: 'p', heupzij: 's', schouders: 's' },
    'zijplank':          { schuin: 'p', heupzij: 's', schouders: 's' },
    'zijplank-heupdip':  { schuin: 'p', heupzij: 'p', schouders: 's' },
    'zijplank-been':     { schuin: 'p', heupzij: 'p', schouders: 's' },
    // Lijn 4: bil
    'bridge':            { bil: 'p', hamstring: 's', onderrug: 's' },
    'bridge-mars':       { bil: 'p', hamstring: 's', buik: 's' },
    'bridge-eenbeen':    { bil: 'p', hamstring: 's', heupzij: 's' },
    'bridge-eenbeen-traag': { bil: 'p', hamstring: 'p', heupzij: 's' },
    // Lijn 5: onderrug en fietshouding
    'scharnier-stok':    { onderrug: 'p', bil: 's', hamstring: 's' },
    'fietshouding':      { onderrug: 'p', bovenrug: 's', bil: 's' },
    'fietshouding-reiken': { onderrug: 'p', bovenrug: 'p', schouders: 's' },
    'fietshouding-eenbeen': { onderrug: 'p', bil: 'p', hamstring: 's' },
    // Lijn 6: anti-rotatie
    'birddog':           { onderrug: 'p', bil: 's', buik: 's', schouders: 's' },
    'birddog-pauze':     { onderrug: 'p', bil: 'p', buik: 's', schouders: 's' },
    'birddog-elleboog':  { buik: 'p', onderrug: 's', bil: 's' },
    'bear-tik':          { buik: 'p', schouders: 's', bil: 's' },
    // Lijn 7: zijkant heup
    'zijlig-been':       { heupzij: 'p' },
    'zijlig-been-hold':  { heupzij: 'p', bil: 's' },
    'zijplank-knie-been': { heupzij: 'p', schuin: 'p' },
    'eenbeen-scharnier': { bil: 'p', hamstring: 'p', heupzij: 's' },
    // Lijn 8
    'climber-traag':     { buik: 'p', heupbuiger: 's', schouders: 's' }
  };

  function vanOefening(id) { return SPIEREN[id] || {}; }

  // Sessie = alle oefeningen samen. Een spier is "hoofdspier" zodra hij dat in
  // minstens één oefening is.
  function vanSessie(ids) {
    var k = {};
    (ids || []).forEach(function (id) {
      var s = SPIEREN[id] || {};
      Object.keys(s).forEach(function (m) { if (s[m] === 'p' || !k[m]) k[m] = s[m]; });
    });
    return k;
  }

  // Namen op volgorde: hoofdspieren eerst.
  function namenLijst(kaart) {
    var p = [], s = [];
    Object.keys(NAMEN).forEach(function (m) {
      if (kaart[m] === 'p') p.push(NAMEN[m]); else if (kaart[m] === 's') s.push(NAMEN[m]);
    });
    return { hoofd: p, mee: s };
  }

  // ---- Tekening -----------------------------------------------------------
  // Eén figuur is 120 x 250. Links-delen worden getekend, de rechterkant is
  // dezelfde groep gespiegeld rond x = 60.
  var BASIS = '#262626', LIJN = '#0c0c0c', HUID = '#1b1b1b';
  var KLEUR = { p: '#FF6B1A', s: 'rgba(255,107,26,.42)' };

  function deel(d, spier, kaart) {
    var f = spier && kaart[spier] ? KLEUR[kaart[spier]] : BASIS;
    return '<path d="' + d + '" fill="' + f + '" stroke="' + LIJN + '" stroke-width="1.2" stroke-linejoin="round"/>';
  }
  function spiegel(inhoud) {
    return inhoud + '<g transform="translate(120 0) scale(-1 1)">' + inhoud + '</g>';
  }

  function silhouet() {
    // Ondergrond zodat er geen gaten tussen de spierdelen vallen.
    return '<ellipse cx="60" cy="19" rx="12.5" ry="14.5" fill="' + HUID + '"/>' +
      '<path d="M53 31 h14 v10 h-14z" fill="' + HUID + '"/>' +
      '<path d="M38 44 Q60 38 82 44 L85 70 Q81 96 79 114 L80 178 L78 240 L66 242 L62 180 L60 132 L58 180 L54 242 L42 240 L40 178 L41 114 Q39 96 35 70 Z" fill="' + HUID + '"/>' +
      spiegel('<path d="M33 52 Q24 56 22 80 L19 140 L26 141 L31 100 L35 70 Z" fill="' + HUID + '"/>');
  }

  var ABS = function (y, hoog) { return "M53 " + y + " h5 q1.5 0 1.5 1.5 v" + (hoog - 3) + " q0 1.5 -1.5 1.5 h-5 q-1.5 0 -1.5 -1.5 v-" + (hoog - 3) + " q0 -1.5 1.5 -1.5z"; };
  var ARMEN = function (k) {
    return deel("M27 60 C31 62 35 63 37 66 C37 78 36 88 34 97 C30 99 26 98 25 95 C24 82 25 70 27 60 Z", null, k) +
      deel("M25 100 C29 101 32 101 34 100 C33 112 32 126 30 138 L23 138 C22 124 22 111 25 100 Z", null, k);
  };
  var SCHOUDER = "M27 50 C27 43 35 40 43 44 C41 50 39 56 36 60 C31 61 27 57 27 50 Z";

  function voor(k) {
    var links =
      deel(SCHOUDER, "schouders", k) +
      deel("M44 45 C50 43 57 44 59 46 L59 61 C54 64 47 64 42 60 C41 54 42 49 44 45 Z", null, k) +           // borst
      ARMEN(k) +
      deel("M42 64 C45 68 48 70 50 71 L50 105 C47 109 45 110 43 106 C41 92 41 78 42 64 Z", "schuin", k) +  // schuine buik
      deel(ABS(66, 11), "buik", k) + deel(ABS(79, 11), "buik", k) + deel(ABS(92, 14), "buik", k) +
      deel("M44 111 C49 113 54 114 58 115 L56 127 C51 123 47 118 44 111 Z", "heupbuiger", k) +
      deel("M41 117 C47 121 53 126 57 131 C58 145 58 160 57 174 C53 179 47 180 43 176 C39 158 38 136 41 117 Z", "quads", k) +
      deel("M44 180 C48 183 53 183 56 180 L55 189 C51 192 47 192 44 189 Z", null, k) +                      // knie
      deel("M44 193 C48 196 52 196 55 193 C55 208 54 222 53 236 L46 236 C43 222 42 207 44 193 Z", null, k); // scheen
    return "<g>" + silhouet() + spiegel(links) + "</g>";
  }

  function achter(k) {
    var links =
      deel("M50 38 L60 36 L60 73 C55 69 52 63 49 58 C45 54 40 52 36 49 C40 44 45 40 50 38 Z", "bovenrug", k) + // trapezius
      deel(SCHOUDER, "schouders", k) +
      deel("M40 60 C44 68 50 74 58 80 L58 96 C51 96 45 92 42 86 C39 78 39 68 40 60 Z", "bovenrug", k) +        // brede rugspier
      ARMEN(k) +
      deel("M52 80 L59 80 L59 108 C56 111 53 110 52 107 Z", "onderrug", k) +                                    // lange rugspier
      deel("M40 101 C45 104 48 107 51 110 L49 120 C44 118 41 115 39 111 Z", "heupzij", k) +
      deel("M41 114 C47 113 54 115 59 119 L59 140 C53 146 46 145 42 139 C39 131 39 122 41 114 Z", "bil", k) +
      deel("M42 145 C47 149 52 150 57 147 C57 158 57 169 56 180 C52 184 47 184 43 179 C41 168 41 156 42 145 Z", "hamstring", k) +
      deel("M43 188 C47 185 52 186 55 189 C55 203 54 216 53 230 C50 233 46 232 44 228 C41 214 41 200 43 188 Z", null, k); // kuit
    return "<g>" + silhouet() + spiegel(links) + "</g>";
  }

  // opties: { labels: true } toont "voor" en "achter" onder de figuren.
  function svg(kaart, opties) {
    kaart = kaart || {}; opties = opties || {};
    var lab = opties.labels !== false;
    var h = lab ? 268 : 250;
    var tekst = function (x, t) { return '<text x="' + x + '" y="263" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="11" letter-spacing="1.5" fill="rgba(245,243,239,.45)">' + t + '</text>'; };
    return '<svg viewBox="0 0 260 ' + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spierkaart">' +
      '<g transform="translate(6 0)">' + voor(kaart) + '</g>' +
      '<g transform="translate(134 0)">' + achter(kaart) + '</g>' +
      (lab ? tekst(66, 'VOOR') + tekst(194, 'ACHTER') : '') + '</svg>';
  }

  window.CoreSpierkaart = { SPIEREN: SPIEREN, NAMEN: NAMEN, vanOefening: vanOefening, vanSessie: vanSessie, svg: svg, namenLijst: namenLijst };
})();
