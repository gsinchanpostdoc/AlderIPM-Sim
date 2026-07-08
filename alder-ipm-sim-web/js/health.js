/* ============================================================
   AlderIPM-Sim — Forest Health panel (Block 4)
   Persistent Health Ring + canopy motif, recomputed in real time
   from the CURRENT parameters. Reuses App.readParams() and the
   AlderIPMSimModel engine — no duplication of the model, no change
   to any scientific routine. Purely a live read-out layer.

   Forest Health Index (paper-grounded aggregate of the two
   canopy-relevant states at the recurrent annual equilibrium):
       H = (K_t / K_0) * (1 - D_t)
   K_t/K_0  -> how much carrying capacity survives winter recovery
   1 - D_t  -> how much seasonal foliage is retained
   ============================================================ */
(function () {
  "use strict";

  var R = 50;
  var CIRC = 2 * Math.PI * R;      // ring circumference (r = 50) ~ 314.16
  var HORIZON = 80;                // years to reach the recurrent state
  var DEBOUNCE_MS = 120;
  var scheduled = false;

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function currentParams() {
    if (window.App && typeof window.App.readParams === "function") {
      try { return window.App.readParams(); } catch (e) { /* fall through */ }
    }
    if (typeof getDefaults === "function") return getDefaults();
    return null;
  }

  // Run the annual map to its recurrent state; return the health summary.
  function computeHealth(params) {
    if (!params || typeof AlderIPMSimModel === "undefined") return null;
    var model, sim;
    try {
      model = new AlderIPMSimModel(params);
      sim = model.simulate(1.0, 0.5, params.K_0, 0.0, HORIZON, false);
    } catch (e) { return null; }
    if (!sim || !sim.K || !sim.D) return null;

    var last = HORIZON;
    var K = sim.K[last], D = sim.D[last], K0 = params.K_0;
    if (!isFinite(K) || !isFinite(D) || !(K0 > 0)) return null;

    var Kratio = clamp(K / K0, 0, 1);
    var H = clamp(Kratio * (1 - clamp(D, 0, 1)), 0, 1);
    var Dcrit = (params.D_crit !== undefined && params.D_crit > 0) ? params.D_crit : 0.5;
    return { H: H, Kratio: Kratio, D: D, Dcrit: Dcrit };
  }

  function colorFor(H) {
    if (H >= 0.6) return cssVar("--canopy-healthy", "#3f9e78");
    if (H >= 0.4) return cssVar("--canopy-stress", "#cf9418");
    return cssVar("--danger", "#b01722");
  }

  function statusFor(H) {
    if (H >= 0.6) return { t: "Healthy", cls: "hs-ok" };
    if (H >= 0.4) return { t: "Watch", cls: "hs-warn" };
    return { t: "At risk", cls: "hs-bad" };
  }

  function setText(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }

  function render(res) {
    var arc = document.getElementById("health-ring-arc");
    var pct = document.getElementById("health-ring-pct");
    if (!arc || !pct) return;

    if (!res) { pct.textContent = "\u2014"; return; }

    var H = res.H, col = colorFor(H);
    arc.style.stroke = col;
    arc.setAttribute("stroke-dashoffset", (CIRC * (1 - H)).toFixed(2));
    pct.textContent = Math.round(H * 100) + "%";
    pct.style.fill = col;

    var st = statusFor(H);
    var statusEl = document.getElementById("health-status");
    if (statusEl) { statusEl.textContent = st.t; statusEl.className = "health-status " + st.cls; }

    setText("health-kpct", Math.round(res.Kratio * 100) + "%");
    setText("health-dval", res.D.toFixed(2));

    // Canopy: brown a fraction of foliage blobs proportional to D / D_crit.
    var frac = clamp(res.D / (res.Dcrit || 0.5), 0, 1);
    var leaves = document.querySelectorAll("#canopy-leaves circle");
    var brownN = Math.round(frac * leaves.length);
    var healthy = cssVar("--canopy-healthy", "#3f9e78");
    var stressed = "#8a6a3a";
    for (var i = 0; i < leaves.length; i++) {
      var isBrown = i < brownN;
      leaves[i].setAttribute("fill", isBrown ? stressed : healthy);
      leaves[i].style.opacity = isBrown ? "0.7" : "1";
    }

    var ring = document.getElementById("canopy-dcrit-ring");
    if (ring) {
      ring.setAttribute("stroke", cssVar("--danger", "#b01722"));
      ring.style.opacity = (res.D >= res.Dcrit) ? "0.9" : "0";
    }
    setText("canopy-caption", (res.D >= res.Dcrit) ? "D \u2265 D_crit" : "Canopy");

    // Page-level deterioration cue: shift the background toward amber below 40%.
    document.body.classList.toggle("health-critical", H < 0.4);
  }

  function update() { render(computeHealth(currentParams())); }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; update(); }, DEBOUNCE_MS);
  }

  function init() {
    update();

    // Real-time: any parameter slider / numeric input re-runs the panel.
    document.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.matches && (t.matches('input[type="range"]') || t.matches('input[type="number"]'))) schedule();
    });
    // Selects (presets, scenarios) and other inputs.
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (t && t.matches && t.matches("select, input")) schedule();
    });
    // Preset / reset / scenario buttons set values programmatically (no input
    // event fires), so re-run shortly after any click in those regions.
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('#tab-parameters, .preset-selector, [data-preset], .btn-reset-param, .btn-reset-group, #inline-compare-panel, #btn-audience-mode')) schedule();
    });
  }

  window.HealthPanel = { update: update, init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
