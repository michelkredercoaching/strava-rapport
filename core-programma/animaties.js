// core-programma/animaties.js
// De houdingen per oefening. De id's zijn dezelfde als in lib/core.js
// (OEFENINGEN), zodat de pagina bij elke oefening de juiste animatie vindt.
// Per oefening: spier (waar de gloed zit), reeks (de volgorde van houdingen,
// de eerste is de rusthouding) en de houdingen zelf. Optioneel: beweeg/vast
// (ms) voor het tempo, en kader als de oefening meer hoogte nodig heeft.
(function () {
  var V = 200;          // vloer
  var LIG = V - 8;      // rug op de mat
  var A = {};

  // ---- Bouwstenen op de rug ----
  // Armen recht omhoog, knieën 90/90 (de dead bug-basis).
  function rug(extra) {
    var h = {
      heup: [160, LIG], romp: 180, hoofd: 182,
      armDicht: { naar: [106, LIG - 54.6], buig: 1 }, armVer: { naar: [108, LIG - 54.6], buig: 1 },
      beenDicht: { naar: [196, LIG - 39], buig: -1, voet: -15 }, beenVer: { naar: [194, LIG - 38], buig: -1, voet: -15 }
    };
    for (var k in extra) h[k] = extra[k];
    return h;
  }

  // ===== Lijn 1: voorkant =====
  A['deadbug-gebogen'] = {
    spier: 'romp', reeks: ['basis', 'links', 'basis', 'rechts'],
    houdingen: {
      basis: rug({}),
      links: rug({ armDicht: { naar: [54, LIG - 10], buig: 1 }, beenVer: { naar: [234, LIG - 14], buig: -1, voet: -30 } }),
      rechts: rug({ armVer: { naar: [56, LIG - 10], buig: 1 }, beenDicht: { naar: [234, LIG - 14], buig: -1, voet: -30 } })
    }
  };

  // Benen gestrekt omhoog in plaats van 90/90.
  var gestrekt = {
    beenDicht: { naar: [166, LIG - 75.7], buig: -1, voet: -60 }, beenVer: { naar: [164, LIG - 75.8], buig: -1, voet: -60 }
  };
  A['deadbug-gestrekt'] = {
    spier: 'romp', reeks: ['basis', 'links', 'basis', 'rechts'], beweeg: 1400,
    houdingen: {
      basis: rug(gestrekt),
      links: rug({ armDicht: { naar: [54, LIG - 10], buig: 1 }, beenDicht: gestrekt.beenDicht, beenVer: { naar: [234, LIG - 12], buig: -1, voet: -40 } }),
      rechts: rug({ armVer: { naar: [56, LIG - 10], buig: 1 }, beenVer: gestrekt.beenVer, beenDicht: { naar: [234, LIG - 12], buig: -1, voet: -40 } })
    }
  };

  // Plat liggen en dan de hollow: schouders en benen net van de grond.
  var plat = {
    heup: [160, LIG], romp: 180, hoofd: 180,
    armDicht: { naar: [54, LIG], buig: 1 }, armVer: { naar: [56, LIG], buig: 1 },
    beenDicht: { naar: [234, LIG + 1], buig: -1, voet: -80 }, beenVer: { naar: [233, LIG + 1], buig: -1, voet: -80 }
  };
  var hollow = {
    heup: [160, LIG], romp: 192, hoofd: 198,
    armDicht: { naar: [56, LIG - 26], buig: 1 }, armVer: { naar: [58, LIG - 25], buig: 1 },
    beenDicht: { naar: [231, LIG - 19], buig: -1, voet: -70 }, beenVer: { naar: [230, LIG - 18], buig: -1, voet: -70 }
  };
  A['hollow-hold'] = { spier: 'romp', reeks: [{ h: 'plat', vast: 900 }, { h: 'hollow', vast: 2600 }], houdingen: { plat: plat, hollow: hollow } };

  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  var trapDicht = kopie(hollow); trapDicht.beenDicht = { naar: [198, LIG - 42], buig: -1, voet: -40 };
  var trapVer = kopie(hollow); trapVer.beenVer = { naar: [197, LIG - 41], buig: -1, voet: -40 };
  A['hollow-fietsen'] = {
    spier: 'romp', reeks: [{ h: 'hollow', vast: 300 }, { h: 'dicht', vast: 100 }, { h: 'hollow', vast: 100 }, { h: 'ver', vast: 100 }],
    beweeg: 700, houdingen: { hollow: hollow, dicht: trapDicht, ver: trapVer }
  };

  // ===== Lijn 4: bil =====
  var bridgeLaag = {
    heup: [150, LIG], romp: 180, hoofd: 182,
    armDicht: { naar: [150, LIG + 2], buig: -1 }, armVer: { naar: [148, LIG + 2], buig: -1 },
    beenDicht: { naar: [194, V - 5], buig: -1, voet: 0 }, beenVer: { naar: [192, V - 5], buig: -1, voet: 0 }
  };
  var bridgeHoog = {
    heup: [148, LIG - 30], romp: 150, hoofd: 176,
    armDicht: { naar: [148, LIG + 2], buig: -1 }, armVer: { naar: [146, LIG + 2], buig: -1 },
    beenDicht: { naar: [194, V - 5], buig: -1, voet: 0 }, beenVer: { naar: [192, V - 5], buig: -1, voet: 0 }
  };
  A['bridge'] = { spier: 'bil', reeks: ['laag', { h: 'hoog', vast: 1200 }], houdingen: { laag: bridgeLaag, hoog: bridgeHoog } };

  var marsDicht = kopie(bridgeHoog); marsDicht.beenDicht = { naar: [190, LIG - 58], buig: -1, voet: 10 };
  var marsVer = kopie(bridgeHoog); marsVer.beenVer = { naar: [188, LIG - 57], buig: -1, voet: 10 };
  A['bridge-mars'] = {
    spier: 'bil', reeks: ['laag', { h: 'hoog', vast: 400 }, { h: 'dicht', vast: 500 }, { h: 'hoog', vast: 300 }, { h: 'ver', vast: 500 }, { h: 'hoog', vast: 400 }],
    beweeg: 800, houdingen: { laag: bridgeLaag, hoog: bridgeHoog, dicht: marsDicht, ver: marsVer }
  };

  // Op één been: het dichtbije been gestrekt in het verlengde van de dij.
  var eenLaag = kopie(bridgeLaag); eenLaag.beenDicht = { naar: [210.4, LIG - 45.5], buig: -1, voet: -50 };
  var eenHoog = kopie(bridgeHoog); eenHoog.beenDicht = { naar: [213.5, LIG - 67.8], buig: -1, voet: -40 };
  A['bridge-eenbeen'] = { spier: 'bil', reeks: ['laag', { h: 'hoog', vast: 1000 }], houdingen: { laag: eenLaag, hoog: eenHoog } };
  // Omhoog in één tel, zakken in drie.
  A['bridge-eenbeen-traag'] = {
    spier: 'bil', reeks: [{ h: 'laag', beweeg: 700, vast: 600 }, { h: 'hoog', beweeg: 3000, vast: 700 }],
    houdingen: { laag: eenLaag, hoog: eenHoog }
  };

  // ===== Steunhoudingen: plank, bird dog, bear, climber =====
  // Rekenhulp: punt op afstand len onder hoek (graden) vanaf p.
  function op(p, hoek, len) { var r = hoek * Math.PI / 180; return [p[0] + Math.cos(r) * len, p[1] + Math.sin(r) * len]; }
  function hoekVan(a, b) { return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; }
  // Een rechte plank: enkel en schouder gegeven, heup op het rechte lijntje ertussen.
  function lijfRecht(enkel, schouder, extra) {
    var hk = hoekVan(enkel, schouder);
    var h = {
      heup: op(enkel, hk, 76), romp: hk, hoofd: hk + 4,
      beenDicht: { naar: [enkel[0], enkel[1]], buig: 1, voet: 100 }, beenVer: { naar: [enkel[0] - 2, enkel[1]], buig: 1, voet: 100 }
    };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  var GROND = V - 4;

  // Plank op onderarmen: ellebogen onder de schouders.
  var plankS = [108, GROND - 28];
  var plankOA = lijfRecht([235, V - 6], plankS, {
    armDicht: { naar: [80, GROND], buig: -1 }, armVer: { naar: [82, GROND], buig: -1 }
  });
  // Op de knieën: knie op de grond, onderbeen plat naar achteren.
  var knieS = [101, GROND - 28];
  function opKnieen(heupY) {
    var knie = [190, GROND], hk = hoekVan(knie, knieS);
    var heup = heupY == null ? op(knie, hk, 39) : [op(knie, hk, 39)[0], heupY];
    return {
      heup: heup, romp: hoekVan(heup, knieS), hoofd: hoekVan(heup, knieS) + 4,
      armDicht: { naar: [73, GROND], buig: -1 }, armVer: { naar: [75, GROND], buig: -1 },
      beenDicht: { naar: [227, V - 5], buig: 1, voet: 0 }, beenVer: { naar: [225, V - 5], buig: 1, voet: 0 }
    };
  }
  var knieRecht = opKnieen(null);
  var knieLaag = opKnieen(GROND - 4);
  A['plank-knieen'] = { spier: 'romp', reeks: [{ h: 'laag', vast: 800 }, { h: 'hold', vast: 2600 }], houdingen: { laag: knieLaag, hold: knieRecht } };
  // Plank: vanaf de knieën omhoog en vasthouden.
  var plankVanKnie = kopie(knieRecht);
  plankVanKnie.armDicht = plankOA.armDicht; plankVanKnie.armVer = plankOA.armVer;
  A['plank'] = { spier: 'romp', reeks: [{ h: 'knie', vast: 800 }, { h: 'hold', vast: 2600 }], houdingen: { knie: knieRecht, hold: plankOA } };

  // Hoge plank (op de handen) met schoudertik.
  var hoogS = [116, GROND - 54.5];
  var hoog = lijfRecht([235, V - 6], hoogS, {
    armDicht: { naar: [116, GROND], buig: 1 }, armVer: { naar: [118, GROND], buig: 1 }
  });
  var tikDicht = kopie(hoog); tikDicht.armDicht = { naar: [126, GROND - 50], buig: 1 };
  var tikVer = kopie(hoog); tikVer.armVer = { naar: [128, GROND - 50], buig: 1 };
  A['plank-schoudertik'] = {
    spier: 'romp', beweeg: 600,
    reeks: [{ h: 'hoog', vast: 400 }, { h: 'dicht', vast: 300 }, { h: 'hoog', vast: 300 }, { h: 'ver', vast: 300 }],
    houdingen: { hoog: hoog, dicht: tikDicht, ver: tikVer }
  };

  // Lange plank: ellebogen een stuk voor de schouders.
  var langS = [124, GROND - 24];
  var lang = lijfRecht([238, V - 6], langS, {
    armDicht: { naar: [74, GROND], buig: -1 }, armVer: { naar: [76, GROND], buig: -1 }
  });
  A['plank-lang'] = { spier: 'romp', reeks: [{ h: 'gewoon', vast: 800 }, { h: 'lang', vast: 2600 }], houdingen: { gewoon: plankOA, lang: lang } };

  // Body saw: ellebogen blijven staan, het lijf schuift naar achteren en terug.
  A['body-saw'] = {
    spier: 'romp', beweeg: 1500,
    reeks: [{ h: 'voor', vast: 400 }, { h: 'achter', vast: 500 }],
    houdingen: { voor: plankOA, achter: lang }
  };

  // Bird dog (zelfde houdingen als de proef).
  var BD = {
    basis:  { heup: [176, V - 44], romp: 196, hoofd: 192, armDicht: { naar: [124, V - 5], buig: 1 }, armVer: { naar: [127, V - 5], buig: 1 }, beenDicht: { naar: [214, V - 6], buig: 1, voet: 180 }, beenVer: { naar: [211, V - 6], buig: 1, voet: 180 } },
    links:  { heup: [176, V - 44], romp: 192, hoofd: 190, armDicht: { naar: [70, V - 66], buig: 1 }, armVer: { naar: [127, V - 5], buig: 1 }, beenDicht: { naar: [214, V - 6], buig: 1, voet: 180 }, beenVer: { naar: [250, V - 50], buig: 1, voet: 20 } },
    rechts: { heup: [176, V - 44], romp: 192, hoofd: 190, armDicht: { naar: [124, V - 5], buig: 1 }, armVer: { naar: [73, V - 66], buig: 1 }, beenDicht: { naar: [250, V - 50], buig: 1, voet: 20 }, beenVer: { naar: [211, V - 6], buig: 1, voet: 180 } }
  };
  A['birddog'] = { spier: 'romp', reeks: ['basis', 'links', 'basis', 'rechts'], houdingen: BD };
  A['birddog-pauze'] = {
    spier: 'romp', reeks: ['basis', { h: 'links', vast: 2400 }, 'basis', { h: 'rechts', vast: 2400 }], houdingen: BD
  };
  // Elleboog naar knie: strekken, dan onder je buik naar elkaar toe.
  var bdIn = kopie(BD.links);
  bdIn.romp = 200; bdIn.hoofd = 205;
  bdIn.armDicht = { naar: [156, V - 30], buig: -1 };
  bdIn.beenVer = { naar: [190, V - 22], buig: -1, voet: 120 };
  A['birddog-elleboog'] = {
    spier: 'romp', beweeg: 900,
    reeks: ['basis', { h: 'uit', vast: 500 }, { h: 'in', vast: 500 }, { h: 'uit', vast: 400 }],
    houdingen: { basis: BD.basis, uit: BD.links, in: bdIn }
  };

  // Bear plank: knieën net boven de grond, rug plat. Om en om een voet naar achteren.
  var bear = {
    heup: [176, V - 50], romp: 196, hoofd: 192,
    armDicht: { naar: [124, V - 5], buig: 1 }, armVer: { naar: [127, V - 5], buig: 1 },
    beenDicht: { naar: [208, V - 12], buig: 1, voet: 115 }, beenVer: { naar: [205, V - 12], buig: 1, voet: 115 }
  };
  var bearDicht = kopie(bear); bearDicht.beenDicht = { naar: [246, V - 12], buig: 1, voet: 100 };
  var bearVer = kopie(bear); bearVer.beenVer = { naar: [243, V - 12], buig: 1, voet: 100 };
  A['bear-tik'] = {
    spier: 'romp', beweeg: 700,
    reeks: [{ h: 'bear', vast: 500 }, { h: 'dicht', vast: 300 }, { h: 'bear', vast: 400 }, { h: 'ver', vast: 300 }],
    houdingen: { bear: bear, dicht: bearDicht, ver: bearVer }
  };

  // Langzame mountain climber vanuit de hoge plank.
  var climbDicht = kopie(hoog); climbDicht.beenDicht = { naar: [160, V - 14], buig: 1, voet: 100 };
  var climbVer = kopie(hoog); climbVer.beenVer = { naar: [158, V - 14], buig: 1, voet: 100 };
  A['climber-traag'] = {
    spier: 'romp', beweeg: 1300,
    reeks: [{ h: 'hoog', vast: 300 }, { h: 'dicht', vast: 400 }, { h: 'hoog', vast: 300 }, { h: 'ver', vast: 400 }],
    houdingen: { hoog: hoog, dicht: climbDicht, ver: climbVer }
  };

  // ===== Op je zij (vooraanzicht) =====
  // Zijplank: onderste onderarm op de grond, bovenste hand op de heup. Het
  // dichtbije been en de dichtbije arm zijn hier de bovenkant van het lichaam.
  function zijplank(enkel, schouder, heupDip) {
    var hk = hoekVan(enkel, schouder);
    var heup = op(enkel, hk, 76);
    if (heupDip) heup = [heup[0], heup[1] + heupDip];
    var r = hoekVan(heup, schouder);
    return {
      heup: heup, romp: r, hoofd: r,
      armVer: { naar: [schouder[0] - 27, GROND], buig: -1 },
      armDicht: { naar: [heup[0] + 4, heup[1] - 10], buig: -1 },
      beenDicht: { naar: [enkel[0] + 4, enkel[1] - 4], buig: 1, voet: -70 }, beenVer: { naar: [enkel[0], enkel[1]], buig: 1, voet: -70 }
    };
  }
  var zpS = [108, GROND - 28];
  var zpHold = zijplank([238, V - 6], zpS, 0);
  var zpLaag = zijplank([238, V - 6], zpS, 13);
  var zpRust = zijplank([238, V - 6], zpS, 24);
  A['zijplank'] = { spier: 'zij', reeks: [{ h: 'rust', vast: 800 }, { h: 'hold', vast: 2600 }], houdingen: { rust: zpRust, hold: zpHold } };
  A['zijplank-heupdip'] = {
    spier: 'zij', beweeg: 1000,
    reeks: [{ h: 'rust', vast: 600 }, { h: 'hold', vast: 300 }, { h: 'dip', vast: 300 }, { h: 'hold', vast: 300 }, { h: 'dip', vast: 300 }, { h: 'hold', vast: 300 }],
    houdingen: { rust: zpRust, hold: zpHold, dip: zpLaag }
  };
  var zpBeen = kopie(zpHold); zpBeen.beenDicht = { naar: op(zpHold.heup, -28, 75.5), buig: 1, voet: -60 };
  A['zijplank-been'] = {
    spier: 'zij', beweeg: 900,
    reeks: [{ h: 'rust', vast: 600 }, { h: 'hold', vast: 300 }, { h: 'been', vast: 400 }, { h: 'hold', vast: 300 }],
    houdingen: { rust: zpRust, hold: zpHold, been: zpBeen }
  };

  // Zijplank op de knieën: knie op de grond, onderbenen naar achteren omhoog.
  function zpKnie(heupDip) {
    var knie = [192, GROND], hk = hoekVan(knie, zpS);
    var heup = op(knie, hk, 39); if (heupDip) heup = [heup[0], heup[1] + heupDip];
    var r = hoekVan(heup, zpS), enkel = op(knie, -98, 37);
    return {
      heup: heup, romp: r, hoofd: r,
      armVer: { naar: [zpS[0] - 27, GROND], buig: -1 }, armDicht: { naar: [heup[0] + 4, heup[1] - 10], buig: -1 },
      beenDicht: { naar: [enkel[0] + 3, enkel[1] - 1], buig: 1, voet: 0 }, beenVer: { naar: enkel, buig: 1, voet: 0 }
    };
  }
  A['zijplank-knieen'] = { spier: 'zij', reeks: [{ h: 'rust', vast: 800 }, { h: 'hold', vast: 2600 }], houdingen: { rust: zpKnie(16), hold: zpKnie(0) } };

  // Zijlig: op de onderste arm, hoofd links.
  var ZL = GROND - 7;
  function zijlig(extra) {
    var h = {
      heup: [168, ZL], romp: 180, hoofd: 186,
      armVer: { naar: [92, ZL - 26], buig: 1 },
      armDicht: { naar: [150, ZL - 8], buig: -1 },
      beenDicht: { naar: [243, ZL - 2], buig: 1, voet: -80 }, beenVer: { naar: [243, ZL + 2], buig: 1, voet: -80 }
    };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  var zlPlat = zijlig({});
  var zlOp = zijlig({ beenDicht: { naar: op([168, ZL], -24, 75.5), buig: 1, voet: -70 } });
  A['zijlig-been'] = { spier: 'heup', beweeg: 1000, reeks: [{ h: 'plat', vast: 400 }, { h: 'op', vast: 300 }], houdingen: { plat: zlPlat, op: zlOp } };
  A['zijlig-been-hold'] = { spier: 'heup', beweeg: 1000, reeks: [{ h: 'plat', vast: 400 }, { h: 'op', vast: 2400 }], houdingen: { plat: zlPlat, op: zlOp } };

  // Zijplank op de knieën met het bovenste been gestrekt omhoog.
  var zkHold = zpKnie(0);
  var lijnHoek = zkHold.romp + 180;
  zkHold.beenDicht = { naar: op(zkHold.heup, lijnHoek, 75.5), buig: 1, voet: lijnHoek - 70 };
  var zkOp = kopie(zkHold); zkOp.beenDicht = { naar: op(zkHold.heup, lijnHoek - 26, 75.5), buig: 1, voet: lijnHoek - 96 };
  A['zijplank-knie-been'] = {
    spier: 'heup', beweeg: 900,
    reeks: [{ h: 'rust', vast: 600 }, { h: 'hold', vast: 300 }, { h: 'op', vast: 400 }, { h: 'hold', vast: 300 }],
    houdingen: { rust: (function () { var r = zpKnie(16); r.beenDicht = { naar: [r.heup[0] + 74, GROND - 2], buig: 1, voet: -80 }; return r; })(), hold: zkHold, op: zkOp }
  };

  // Bovenrug draaien op handen en knieën: arm onder je lijf door, dan open
  // naar het plafond. Hoger kader, want de hand gaat boven het hoofd uit.
  var drOnder = kopie(BD.basis); drOnder.armDicht = { naar: [168, V - 16], buig: -1 }; drOnder.hoofd = 215; drOnder.romp = 199;
  var drOpen = kopie(BD.basis); drOpen.armDicht = { naar: [128, V - 112], buig: 1 }; drOpen.hoofd = 175; drOpen.romp = 194;
  A['draai-bovenrug'] = {
    spier: 'rug', beweeg: 1200, kader: [20, 76, 270, 138],
    reeks: [{ h: 'basis', vast: 300 }, { h: 'onder', vast: 500 }, { h: 'open', vast: 900 }],
    houdingen: { basis: BD.basis, onder: drOnder, open: drOpen }
  };

  // ===== Warming-up en cooling-down =====
  // Kat-koe: op handen en knieën, rug bol en hol.
  var koe = kopie(BD.basis); koe.bol = -1; koe.hoofd = 170;
  var kat = kopie(BD.basis); kat.bol = 1; kat.hoofd = 235;
  var kkMid = kopie(BD.basis); kkMid.bol = 0;
  A['kat-koe'] = { spier: 'rug', beweeg: 1300, reeks: [{ h: 'mid', vast: 0 }, { h: 'kat', vast: 500 }, { h: 'mid', vast: 0 }, { h: 'koe', vast: 500 }], houdingen: { mid: kkMid, kat: kat, koe: koe } };

  // Knie naar borst: op je rug, om en om.
  var kbPlat = kopie(plat); kbPlat.armDicht = { naar: [150, LIG + 1], buig: -1 }; kbPlat.armVer = { naar: [148, LIG + 1], buig: -1 };
  var kbDicht = kopie(kbPlat); kbDicht.beenDicht = { naar: [176, LIG - 40], buig: -1, voet: 10 }; kbDicht.armDicht = { naar: [176, LIG - 52], buig: -1 };
  var kbVer = kopie(kbPlat); kbVer.beenVer = { naar: [174, LIG - 39], buig: -1, voet: 10 }; kbVer.armVer = { naar: [174, LIG - 51], buig: -1 };
  A['knie-borst'] = {
    spier: 'bil', beweeg: 1100,
    reeks: [{ h: 'plat', vast: 200 }, { h: 'dicht', vast: 700 }, { h: 'plat', vast: 200 }, { h: 'ver', vast: 700 }],
    houdingen: { plat: kbPlat, dicht: kbDicht, ver: kbVer }
  };

  // Couch-stretch: achterste knie tegen de bank, voet omhoog, heup naar voren.
  var BANK = '<rect x="192" y="146" width="62" height="54" rx="4" fill="#2a2420"/><rect x="186" y="128" width="12" height="72" rx="4" fill="#332b26"/>';
  function couch(heupX, romp) {
    var heup = [heupX, V - 40];
    var sch = op(heup, romp, 54);
    return {
      heup: heup, romp: romp, hoofd: romp,
      beenVer: { naar: [189, V - 44], buig: -1, voet: -95 },
      beenDicht: { naar: [heupX - 46, V - 6], buig: 1, voet: 180 },
      armDicht: { naar: [heupX - 36, V - 44], buig: 1 }, armVer: { naar: [heupX - 34, V - 44], buig: 1 }
    };
  }
  A['couch-stretch'] = {
    spier: 'heup', beweeg: 1400, kader: [20, 70, 270, 142], decor: BANK,
    reeks: [{ h: 'los', vast: 500 }, { h: 'rek', vast: 2200 }],
    houdingen: { los: couch(170, -110), rek: couch(162, -88) }
  };

  // ===== Staand: heupscharnier en fietshouding =====
  var STAAN = [20, 34, 270, 180];
  function staand(heupX, romp, extra) {
    var heup = [heupX, V - 80];
    var h = {
      heup: heup, romp: romp, hoofd: romp,
      beenDicht: { naar: [150, V - 6], buig: -1, voet: 180 }, beenVer: { naar: [153, V - 6], buig: -1, voet: 180 },
      armDicht: { naar: op(op(heup, romp, 54), 100, 54), buig: 1 }, armVer: { naar: op(op(heup, romp, 54), 98, 54), buig: 1 }
    };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  // Met stok: één hand achter de nek, de andere onder in de rug.
  function stokHanden(heupX, romp) {
    var heup = [heupX, V - 80], sch = op(heup, romp, 54);
    var nx = Math.cos((romp + 90) * Math.PI / 180), ny = Math.sin((romp + 90) * Math.PI / 180);
    return {
      stok: true,
      armDicht: { naar: [sch[0] + Math.cos(romp * Math.PI / 180) * 20 + nx * 12, sch[1] + Math.sin(romp * Math.PI / 180) * 20 + ny * 12], buig: 1 },
      armVer: { naar: [heup[0] + nx * 12, heup[1] + ny * 12], buig: 1 }
    };
  }
  A['scharnier-stok'] = {
    spier: 'rug', beweeg: 1500, kader: STAAN,
    reeks: [{ h: 'staan', vast: 500 }, { h: 'scharnier', vast: 700 }],
    houdingen: { staan: staand(150, -90, stokHanden(150, -90)), scharnier: staand(170, 220, stokHanden(170, 220)) }
  };

  // Fietshouding: voorover tot je fietshouding, armen naar voren alsof je je stuur vasthebt.
  function stuur(heupX, romp, hoekArm) {
    var sch = op([heupX, V - 80], romp, 54);
    return { armDicht: { naar: op(sch, hoekArm, 54.5), buig: 1 }, armVer: { naar: op(sch, hoekArm + 3, 54.5), buig: 1 } };
  }
  var fhStaan = staand(150, -90, {});
  var fhHold = staand(170, 212, stuur(170, 212, 150));
  A['fietshouding'] = { spier: 'rug', beweeg: 1500, kader: STAAN, reeks: [{ h: 'staan', vast: 500 }, { h: 'hold', vast: 2500 }], houdingen: { staan: fhStaan, hold: fhHold } };

  var fhReikD = kopie(fhHold); fhReikD.armDicht = { naar: op(op([170, V - 80], 212, 54), 205, 54.5), buig: 1 };
  var fhReikV = kopie(fhHold); fhReikV.armVer = { naar: op(op([170, V - 80], 212, 54), 207, 54.5), buig: 1 };
  A['fietshouding-reiken'] = {
    spier: 'rug', beweeg: 900, kader: STAAN,
    reeks: [{ h: 'hold', vast: 400 }, { h: 'dicht', vast: 500 }, { h: 'hold', vast: 300 }, { h: 'ver', vast: 500 }],
    houdingen: { hold: fhHold, dicht: fhReikD, ver: fhReikV }
  };

  // Op één been: het dichtbije been gestrekt naar achteren, in het verlengde van de romp.
  function eenbeen(heupX, romp, armHoek) {
    var heup = [heupX, V - 79];
    var h = staand(heupX, romp, stuur(heupX, romp, armHoek));
    h.heup = heup;
    h.beenVer = { naar: [150, V - 6], buig: -1, voet: 180 };
    h.beenDicht = { naar: op(heup, romp - 180 + 6, 75.5), buig: -1, voet: romp - 180 + 80 };
    return h;
  }
  var ebStart = staand(150, -90, {});
  A['fietshouding-eenbeen'] = {
    spier: 'rug', beweeg: 1600, kader: STAAN,
    reeks: [{ h: 'staan', vast: 500 }, { h: 'hold', vast: 2400 }],
    houdingen: { staan: ebStart, hold: eenbeen(168, 205, 155) }
  };
  // Heupscharnier op één been: verder voorover, armen hangen naar de grond.
  var ebDiep = eenbeen(172, 190, 95);
  A['eenbeen-scharnier'] = {
    spier: 'bil', beweeg: 1600, kader: STAAN,
    reeks: [{ h: 'staan', vast: 500 }, { h: 'diep', vast: 800 }],
    houdingen: { staan: ebStart, diep: ebDiep }
  };

  window.CoreAnimaties = A;
})();
