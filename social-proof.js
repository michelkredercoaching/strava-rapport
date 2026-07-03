/* ============================================================
   MICHEL KREDER COACHING — SOCIAL PROOF WIDGET (v2, automatisch)
   ------------------------------------------------------------
   Haalt echte bestellingen op via /api/purchases (Mollie).
   Lukt dat niet, dan valt hij terug op de FALLBACK-lijst.

   Installatie:
   1. /public/social-proof.js  ← dit bestand
   2. /api/purchases.js        ← het endpoint (apart bestand)
   3. Vlak voor </body>:
      <script src="/social-proof.js" defer></script>
   4. Optionele reviewbadge:  <div data-mkc-reviews></div>
   ============================================================ */

(function () {
  "use strict";

  /* ---------- CONFIG ---------- */

  var CONFIG = {
    endpoint: "/api/purchases", // automatische bron (Mollie)
    rating: 4.9,
    reviewCount: "500+",
    firstDelay: 7000,
    interval: [18000, 32000],
    maxPerSession: 4,
    showStarsInToast: true
  };

  // Reserve-lijst: alleen gebruikt als het endpoint niet bereikbaar is.
  // Houd hier een paar ECHTE recente bestellingen in als vangnet.
  var FALLBACK = [
    { name: "Lisa",   product: "Strava-analyse",  when: "deze week" },
    { name: "Mark",   product: "trainingsschema", when: "deze week" },
    { name: "Jeroen", product: "Strava-analyse",  when: "onlangs" }
  ];

  /* ---------- Vanaf hier niets aanpassen ---------- */

  var css = [
    ".mkc-toast{position:fixed;left:16px;bottom:16px;z-index:9999;display:flex;align-items:center;gap:12px;",
    "max-width:320px;padding:12px 16px;border-radius:14px;background:#101010;color:#fff;",
    "border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 30px rgba(0,0,0,.45);",
    "font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    "opacity:0;transform:translateY(12px);transition:opacity .35s ease,transform .35s ease;cursor:default}",
    ".mkc-toast.mkc-show{opacity:1;transform:translateY(0)}",
    "@media (max-width:480px){.mkc-toast{left:12px;right:12px;max-width:none;bottom:12px}}",
    "@media (prefers-reduced-motion:reduce){.mkc-toast{transition:opacity .35s ease;transform:none}}",
    ".mkc-avatar{flex:0 0 38px;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;",
    "justify-content:center;background:#1f1f1f;border:1px solid rgba(255,255,255,.15);font-weight:700;font-size:15px}",
    ".mkc-body{min-width:0}",
    ".mkc-line{margin:0;color:#fff}",
    ".mkc-line strong{font-weight:700}",
    ".mkc-meta{margin:2px 0 0;font-size:12px;color:rgba(255,255,255,.55);display:flex;align-items:center;gap:6px}",
    ".mkc-stars{color:#f5b301;letter-spacing:1px;font-size:12px}",
    ".mkc-close{flex:0 0 auto;margin-left:4px;background:none;border:0;color:rgba(255,255,255,.45);",
    "font-size:16px;line-height:1;cursor:pointer;padding:4px}",
    ".mkc-close:hover{color:#fff}",
    ".mkc-reviews{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;",
    "background:#101010;color:#fff;border:1px solid rgba(255,255,255,.12);",
    "font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}",
    ".mkc-reviews .mkc-stars{font-size:14px}",
    ".mkc-reviews span{color:rgba(255,255,255,.7);font-weight:500}"
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function stars(rating) {
    var full = Math.round(rating);
    var s = "";
    for (var i = 0; i < 5; i++) s += i < full ? "\u2605" : "\u2606";
    return s;
  }

  /* Reviewbadge */
  document.querySelectorAll("[data-mkc-reviews]").forEach(function (el) {
    el.innerHTML =
      '<span class="mkc-reviews"><span class="mkc-stars">' + stars(CONFIG.rating) +
      "</span>" + CONFIG.rating.toFixed(1) +
      " <span>\u00b7 " + CONFIG.reviewCount + " renners</span></span>";
  });

  /* Bestellingen ophalen, met fallback */
  function loadPurchases() {
    return fetch(CONFIG.endpoint)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        return items.length ? items : FALLBACK;
      })
      .catch(function () { return FALLBACK; });
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function showToast(item) {
    var toast = document.createElement("div");
    toast.className = "mkc-toast";
    toast.setAttribute("role", "status");
    toast.innerHTML =
      '<div class="mkc-avatar">' + item.name.charAt(0).toUpperCase() + "</div>" +
      '<div class="mkc-body">' +
      '<p class="mkc-line"><strong>' + item.name + "</strong> kocht de " + item.product + "</p>" +
      '<p class="mkc-meta">' +
      (CONFIG.showStarsInToast
        ? '<span class="mkc-stars">' + stars(CONFIG.rating) + "</span>"
        : "") +
      item.when + "</p></div>" +
      '<button class="mkc-close" aria-label="Sluiten">\u00d7</button>';

    toast.querySelector(".mkc-close").addEventListener("click", function () {
      hide(toast);
    });

    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add("mkc-show"); });
    setTimeout(function () { hide(toast); }, 6000);
  }

  function hide(toast) {
    if (!toast.parentNode) return;
    toast.classList.remove("mkc-show");
    setTimeout(function () { toast.remove(); }, 400);
  }

  loadPurchases().then(function (items) {
    if (!items.length) return;
    var queue = items.slice().sort(function () { return Math.random() - 0.5; });
    var shown = 0;

    function next() {
      if (shown >= CONFIG.maxPerSession) return;
      showToast(queue[shown % queue.length]);
      shown++;
      setTimeout(next, rand(CONFIG.interval[0], CONFIG.interval[1]));
    }

    setTimeout(next, CONFIG.firstDelay);
  });
})();
