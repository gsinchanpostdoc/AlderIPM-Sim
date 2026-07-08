/* ============================================================
   AlderIPM-Sim — Science Mode panel (Block 6)
   A live analytical read-out for modellers, injected at the top of the
   Parameters tab and shown only in Full (Science) mode. Three features:

     1. Live A-F phase portrait (beetle vs parasitoid annual map): the
        transient path and the converged fixed point redraw on every
        slider move, so the fixed point visibly migrates as parameters
        change.
     2. Tipping-proximity meter: the dominant eigenvalue magnitude rho*
        of the annual-map Jacobian relative to the unit circle (rho* = 1).
        Reuses model.spectralRadius(); green -> amber -> red as rho* -> 1.
     3. "Copy model state": current parameter JSON to the clipboard.

   Plus it makes the existing .param-group blocks collapsible (accordion)
   in both modes. Reuses App.readParams() and AlderIPMSimModel; no
   scientific routine is reimplemented or modified.
   ============================================================ */
(function () {
  "use strict";

  var N_CONV = 100;          // years to converge to the recurrent fixed point
  var N_TRAJ = 45;           // transient years drawn in the phase portrait
  var RHO_SCALE = 1.5;       // meter runs 0..1.5; unit circle (rho*=1) at 1/1.5
  var DEBOUNCE_MS = 180;
  var scheduled = false;

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function cssVar(n, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; }
    catch (e) { return fb; }
  }
  function baseParams() {
    var p = null;
    if (window.App && typeof window.App.readParams === "function") {
      try { p = window.App.readParams(); } catch (e) { p = null; }
    }
    if (!p && typeof getDefaults === "function") p = getDefaults();
    return p;
  }
  function panelVisible() {
    var el = document.getElementById("science-live-panel");
    if (!el) return false;
    // hidden by CSS in simple mode; offsetParent is null when display:none
    return el.offsetParent !== null;
  }

  // ---- compute (reuses the engine) --------------------------------------
  function compute(p) {
    if (!p || typeof AlderIPMSimModel === "undefined") return null;
    var m, sim, rho;
    try {
      m = new AlderIPMSimModel(p);            // unmanaged natural system (controls = 0)
      sim = m.simulate(1.0, 0.5, p.K_0, 0.0, N_CONV, false);
      if (!sim || !sim.A || !sim.F) return null;
      var Af = sim.A[N_CONV], Ff = sim.F[N_CONV], Kf = sim.K[N_CONV], Df = sim.D[N_CONV];
      rho = m.spectralRadius(Af, Ff, Kf, Df);
      var trajA = [], trajF = [];
      var top = Math.min(N_TRAJ, N_CONV);
      for (var i = 0; i <= top; i++) { trajA.push(sim.A[i]); trajF.push(sim.F[i]); }
      return { trajA: trajA, trajF: trajF, Astar: Af, Fstar: Ff, rho: rho };
    } catch (e) { return null; }
  }

  // ---- phase portrait ---------------------------------------------------
  function drawPortrait(r) {
    if (typeof Plotly === "undefined" || !r) return;
    var green = cssVar("--primary", "#2f6b4f");
    var teal = cssVar("--teal-accent", "#0d8b8f");
    var gold = cssVar("--gold", "#c2922f");
    var text = cssVar("--text", "#16251a");
    var muted = cssVar("--text-muted", "#55684f");
    var grid = cssVar("--border", "#d4ddc7");

    var traces = [
      {
        x: r.trajA, y: r.trajF, mode: "lines+markers", name: "Trajectory",
        line: { color: teal, width: 2 }, marker: { color: teal, size: 4, opacity: 0.6 },
        hovertemplate: "A %{x:.3f}<br>F %{y:.3f}<extra></extra>"
      },
      {
        x: [r.trajA[0]], y: [r.trajF[0]], mode: "markers", name: "Start",
        marker: { color: muted, size: 9, symbol: "circle-open", line: { width: 2 } }, hoverinfo: "skip"
      },
      {
        x: [r.Astar], y: [r.Fstar], mode: "markers", name: "Fixed point",
        marker: { color: gold, size: 13, symbol: "star", line: { color: green, width: 1 } },
        hovertemplate: "Fixed point<br>A* %{x:.3f}<br>F* %{y:.3f}<extra></extra>"
      }
    ];
    var layout = {
      margin: { l: 52, r: 14, t: 8, b: 42 },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Satoshi, system-ui, sans-serif", color: text, size: 12 },
      xaxis: { title: "Beetle A", gridcolor: grid, zeroline: false, rangemode: "tozero" },
      yaxis: { title: "Parasitoid F", gridcolor: grid, zeroline: false, rangemode: "tozero" },
      showlegend: true, legend: { orientation: "h", y: 1.14, font: { color: muted, size: 10 } }
    };
    Plotly.react("sci-phase", traces, layout, { displayModeBar: false, responsive: true });
  }

  // ---- tipping meter ----------------------------------------------------
  function drawMeter(rho) {
    var fill = document.getElementById("sci-rho-fill");
    var val = document.getElementById("sci-rho");
    var note = document.getElementById("sci-rho-note");
    if (!fill || !val || !note) return;
    if (!isFinite(rho)) { val.textContent = "\u2014"; fill.style.width = "0%"; note.textContent = ""; return; }

    var w = clamp(rho / RHO_SCALE, 0, 1) * 100;
    fill.style.width = w.toFixed(1) + "%";
    var col = rho >= 1.0 ? cssVar("--danger", "#b01722")
            : rho >= 0.8 ? cssVar("--canopy-stress", "#cf9418")
                         : cssVar("--primary", "#2f6b4f");
    fill.style.background = col;
    val.textContent = "\u03C1* = " + rho.toFixed(3);
    val.style.color = col;
    note.textContent = rho >= 1.0
      ? "Dominant |\u03BB| \u2265 1 \u2014 fixed point unstable (regime shift / period-doubling)."
      : "Stable (|\u03BB| < 1). Distance to tipping = " + (1 - rho).toFixed(3) + ".";
  }

  // ---- render / schedule ------------------------------------------------
  function render() {
    if (!panelVisible()) return;         // skip heavy work when hidden (simple mode)
    var r = compute(baseParams());
    if (!r) return;
    drawPortrait(r);
    drawMeter(r.rho);
  }
  function schedule() {
    if (scheduled) return; scheduled = true;
    setTimeout(function () { scheduled = false; render(); }, DEBOUNCE_MS);
  }

  // ---- collapsible parameter groups (accordion) -------------------------
  function makeAccordion() {
    var groups = document.querySelectorAll("#tab-parameters .param-group");
    groups.forEach(function (g) {
      var head = g.querySelector(".param-group-header");
      var body = g.querySelector(".param-group-body");
      if (!head || !body || head.dataset.acc === "1") return;
      head.dataset.acc = "1";
      head.classList.add("acc-head");
      var chev = document.createElement("span");
      chev.className = "acc-chev";
      chev.setAttribute("aria-hidden", "true");
      chev.textContent = "\u25BE";
      head.appendChild(chev);
      head.setAttribute("role", "button");
      head.setAttribute("tabindex", "0");
      function toggle() { g.classList.toggle("acc-collapsed"); }
      head.addEventListener("click", toggle);
      head.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
  }

  // ---- build & init -----------------------------------------------------
  function buildPanel() {
    var host = document.getElementById("tab-parameters");
    if (!host || document.getElementById("science-live-panel")) return;
    var panel = document.createElement("div");
    panel.id = "science-live-panel";
    panel.className = "sci-panel card card-feature";
    panel.innerHTML = "" +
      '<div class="sci-head">' +
      '  <div><div class="sci-title">Live system analysis</div>' +
      '  <div class="sci-sub">Fixed point and stability of the annual map recompute as you change parameters.</div></div>' +
      '  <button class="btn btn-secondary btn-sm" id="sci-copy">Copy model state</button>' +
      '</div>' +
      '<div class="sci-grid">' +
      '  <div class="sci-phase-wrap"><div id="sci-phase" style="width:100%;height:300px;"></div></div>' +
      '  <div class="sci-tip">' +
      '    <div class="sci-tip-head">Tipping proximity <span class="sci-tip-val" id="sci-rho">\u2014</span></div>' +
      '    <div class="sci-tip-track">' +
      '      <div class="sci-tip-fill" id="sci-rho-fill"></div>' +
      '      <div class="sci-tip-unit" title="unit circle: |\u03BB| = 1"></div>' +
      '    </div>' +
      '    <div class="sci-tip-scale"><span>0</span><span>1 (tipping)</span><span>' + RHO_SCALE + '</span></div>' +
      '    <div class="sci-tip-note" id="sci-rho-note"></div>' +
      '  </div>' +
      '</div>';
    var layout = host.querySelector(".params-layout");
    if (layout) host.insertBefore(panel, layout); else host.insertBefore(panel, host.firstChild);

    var copyBtn = document.getElementById("sci-copy");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var json = JSON.stringify(baseParams(), null, 2);
      var done = function () { copyBtn.textContent = "Copied \u2713"; setTimeout(function () { copyBtn.textContent = "Copy model state"; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(done, function () { fallbackCopy(json); done(); });
      } else { fallbackCopy(json); done(); }
    });
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) { /* no-op */ }
  }

  function init() {
    buildPanel();
    makeAccordion();
    render();

    document.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.matches && (t.matches('input[type="range"]') || t.matches('input[type="number"]'))) schedule();
    });
    document.addEventListener("change", function (e) {
      var t = e.target; if (t && t.matches && t.matches("select")) schedule();
    });
    // audience toggle: when switching to Full mode the panel appears - draw it.
    var aud = document.getElementById("btn-audience-mode");
    if (aud) aud.addEventListener("click", function () { setTimeout(render, 80); });
    var tog = document.getElementById("btn-theme-toggle");
    if (tog) tog.addEventListener("click", function () { setTimeout(render, 80); });
    // presets / scenarios change the baseline
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest("[data-preset], .preset-selector, .main-tab")) setTimeout(render, 160);
    });
  }

  window.SciencePanel = { render: render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
