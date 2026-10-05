// core-programma/figuur.js
// Het poppetje van het Core-programma. Eén figuur voor alle oefeningen, zodat
// alles er hetzelfde uitziet. Gebruikt door galerij.html en straks door de
// persoonlijke pagina. Gewoon script (geen module), alles hangt aan
// window.CoreFiguur.
//
// Een houding is: heup (punt), romphoek, hoofdhoek, en per ledemaat een doelpunt
// (hand of enkel) plus de kant waar elleboog of knie naartoe buigt. Elleboog en
// knie volgen via inverse kinematica, zodat armen en benen nooit uitrekken.
// Hoeken in graden, 0 = rechts, 90 = omlaag (SVG-coördinaten).
(function () {
  var L = { romp: 54, nek: 7, hoofd: 10, bovenarm: 28, onderarm: 27, dij: 39, scheen: 37, voet: 12 };
  var VLOER = 200;
  var KLEUR = { dichtbij: '#F5F3EF', ver: 'rgba(245,243,239,0.38)', gloed: '#FF6B1A', mat: '#202020', vloer: 'rgba(255,255,255,0.12)' };
  var teller = 0;

  function rad(d) { return d * Math.PI / 180; }
  function punt(p, hoek, len) { return [p[0] + Math.cos(rad(hoek)) * len, p[1] + Math.sin(rad(hoek)) * len]; }
  function f1(n) { return n.toFixed(1); }

  function ik(begin, doel, a, b, buig) {
    var dx = doel[0] - begin[0], dy = doel[1] - begin[1];
    var d = Math.max(Math.abs(a - b) + 0.5, Math.min(Math.hypot(dx, dy), a + b - 0.01));
    var basis = Math.atan2(dy, dx);
    var hoekA = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
    var midden = [begin[0] + Math.cos(basis + buig * hoekA) * a, begin[1] + Math.sin(basis + buig * hoekA) * a];
    var eind = [begin[0] + Math.cos(basis) * d, begin[1] + Math.sin(basis) * d];
    return [midden, eind];
  }

  function lijn(a, b, kleur, dikte) {
    return '<line x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(b[0]) + '" y2="' + f1(b[1]) +
      '" stroke="' + kleur + '" stroke-width="' + dikte + '" stroke-linecap="round"/>';
  }

  function romp(heup, schouder, bol) {
    var dx = schouder[0] - heup[0], dy = schouder[1] - heup[1], len = Math.hypot(dx, dy);
    var n = [-dy / len, dx / len];
    var stops = [[0, 7.5], [0.25, 6.8], [0.45, 6.2], [0.65, 7.4], [0.8, 8.4], [1, 6.5]];
    var a = [], b = [];
    stops.forEach(function (st) {
      // bol > 0: rug bol (kat), bol < 0: rug hol (koe). Grootst in het midden.
      var boog = (bol || 0) * 9 * Math.sin(Math.PI * st[0]);
      var c = [heup[0] + dx * st[0] + n[0] * boog, heup[1] + dy * st[0] + n[1] * boog];
      a.push([c[0] + n[0] * st[1], c[1] + n[1] * st[1]]);
      b.push([c[0] - n[0] * st[1], c[1] - n[1] * st[1]]);
    });
    var pts = a.concat(b.reverse());
    return '<path d="M' + pts.map(function (p) { return f1(p[0]) + ' ' + f1(p[1]); }).join(' L') + ' Z" fill="' + KLEUR.dichtbij +
      '" stroke="' + KLEUR.dichtbij + '" stroke-width="5" stroke-linejoin="round"/>';
  }

  // spier: 'romp' | 'bil' | 'rug' | 'heup' | 'zij'. inspanning: 0 tot 1.
  function teken(h, spier, inspanning, filterId) {
    var schouder = punt(h.heup, h.romp, L.romp);
    var hoofd = punt(schouder, h.hoofd, L.nek + L.hoofd);
    var s = '';
    function arm(a, kleur) {
      var r = ik(schouder, a.naar, L.bovenarm, L.onderarm, a.buig);
      s += lijn(schouder, r[0], kleur, 7.5) + lijn(r[0], r[1], kleur, 6) +
        '<circle cx="' + f1(r[1][0]) + '" cy="' + f1(r[1][1]) + '" r="3.6" fill="' + kleur + '"/>';
    }
    function been(b, kleur) {
      var r = ik(h.heup, b.naar, L.dij, L.scheen, b.buig);
      s += lijn(h.heup, r[0], kleur, 11) + lijn(r[0], r[1], kleur, 8) + lijn(r[1], punt(r[1], b.voet, L.voet), kleur, 5.5);
    }
    arm(h.armVer, KLEUR.ver); been(h.beenVer, KLEUR.ver);
    s += lijn(schouder, punt(schouder, h.hoofd, L.nek), KLEUR.dichtbij, 6);
    s += '<circle cx="' + f1(hoofd[0]) + '" cy="' + f1(hoofd[1]) + '" r="' + L.hoofd + '" fill="' + KLEUR.dichtbij + '"/>';
    been(h.beenDicht, KLEUR.dichtbij);
    s += romp(h.heup, schouder, h.bol);
    // Stok langs de rug (heupscharnier oefenen): van achter het hoofd tot voorbij de heup.
    if (h.stok) {
      var ux = (schouder[0] - h.heup[0]) / L.romp, uy = (schouder[1] - h.heup[1]) / L.romp, nx = -uy, ny = ux;
      var k1 = [h.heup[0] - ux * 14 + nx * 10, h.heup[1] - uy * 14 + ny * 10], k2 = [schouder[0] + ux * 30 + nx * 10, schouder[1] + uy * 30 + ny * 10];
      s += lijn(k1, k2, '#8a6a4a', 4);
    }

    var op = (0.45 + 0.55 * (inspanning || 0)).toFixed(2), flt = ' filter="url(#' + filterId + ')" opacity="' + op + '"';
    if (spier === 'romp' || spier === 'zij') {
      var a1 = punt(h.heup, h.romp, L.romp * 0.18), a2 = punt(h.heup, h.romp, L.romp * 0.62);
      s += '<line x1="' + f1(a1[0]) + '" y1="' + f1(a1[1]) + '" x2="' + f1(a2[0]) + '" y2="' + f1(a2[1]) + '" stroke="' + KLEUR.gloed + '" stroke-width="12" stroke-linecap="round"' + flt + '/>';
    } else if (spier === 'rug') {
      var r1 = punt(h.heup, h.romp, L.romp * 0.05), r2 = punt(h.heup, h.romp, L.romp * 0.5);
      s += '<line x1="' + f1(r1[0]) + '" y1="' + f1(r1[1]) + '" x2="' + f1(r2[0]) + '" y2="' + f1(r2[1]) + '" stroke="' + KLEUR.gloed + '" stroke-width="11" stroke-linecap="round"' + flt + '/>';
    } else if (spier === 'bil' || spier === 'heup') {
      s += '<circle cx="' + f1(h.heup[0]) + '" cy="' + f1(h.heup[1]) + '" r="8.5" fill="' + KLEUR.gloed + '"' + flt + '/>';
    }
    arm(h.armDicht, KLEUR.dichtbij);
    return s;
  }

  // viewBox: standaard het stuk boven de mat; een staande oefening geeft een
  // hoger kader mee.
  function svg(binnen, kader, decor) {
    var id = 'g' + (++teller);
    var vb = kader || [20, 108, 270, 106];
    return '<svg viewBox="' + vb.join(' ') + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><filter id="' + id + '" filterUnits="userSpaceOnUse" x="-50" y="-50" width="420" height="320"><feGaussianBlur stdDeviation="2.4"/></filter></defs>' +
      '<rect x="30" y="' + VLOER + '" width="240" height="6" rx="3" fill="' + KLEUR.mat + '"/>' +
      '<line x1="-50" y1="' + (VLOER + 6) + '" x2="350" y2="' + (VLOER + 6) + '" stroke="' + KLEUR.vloer + '" stroke-width="1"/>' +
      (decor || '') + binnen.replace(/__FILTER__/g, id) + '</svg>';
  }

  function meng(a, b, t) {
    if (typeof a === 'number') return a + (b - a) * (typeof b === 'number' ? t : 0);
    if (typeof a !== 'object' || a === null) return t < 0.5 ? a : b;
    if (Array.isArray(a)) return a.map(function (v, i) { return meng(v, b[i], t); });
    var o = {}; for (var k in a) o[k] = (k === 'buig') ? a[k] : meng(a[k], b[k], t); return o;
  }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // Reeks: lijst van houdingnamen of {h, beweeg, vast} voor eigen tempo.
  // De eerste houding is de rusthouding (geen gloed), de rest is inspanning.
  function stappen(anim) {
    return anim.reeks.map(function (r) {
      var o = typeof r === 'string' ? { h: r } : r;
      return { h: o.h, beweeg: o.beweeg || anim.beweeg || 1100, vast: o.vast != null ? o.vast : (anim.vast != null ? anim.vast : 700) };
    });
  }

  function beeld(anim, nu) {
    var st = stappen(anim), totaal = st.reduce(function (n, s) { return n + s.vast + s.beweeg; }, 0);
    var t = nu % totaal, i = 0;
    while (t >= st[i].vast + st[i].beweeg) { t -= st[i].vast + st[i].beweeg; i++; }
    var van = st[i], naar = st[(i + 1) % st.length];
    var f = t < van.vast ? 0 : ease((t - van.vast) / van.beweeg);
    var rust = anim.reeks.length ? stappen(anim)[0].h : null;
    var iVan = van.h === rust ? 0 : 1, iNaar = naar.h === rust ? 0 : 1;
    return { houding: meng(anim.houdingen[van.h], anim.houdingen[naar.h], f), inspanning: iVan + (iNaar - iVan) * f };
  }

  function still(anim, naam, inspanning) {
    return svg(teken(anim.houdingen[naam], anim.spier, inspanning, '__FILTER__'), anim.kader, anim.decor);
  }

  // Animatie in een element laten lopen. Geeft een stopfunctie terug.
  function speel(el, anim) {
    var actief = true, start = null;
    function frame(nu) {
      if (!actief) return;
      if (start === null) start = nu;
      var b = beeld(anim, nu - start);
      // svg() vervangt __FILTER__ door een uniek id, zodat meerdere animaties
      // op één pagina elkaars gloedfilter niet overnemen.
      el.innerHTML = svg(teken(b.houding, anim.spier, b.inspanning, '__FILTER__'), anim.kader, anim.decor);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return function () { actief = false; };
  }

  window.CoreFiguur = { L: L, VLOER: VLOER, teken: teken, svg: svg, still: still, speel: speel, beeld: beeld };
})();
