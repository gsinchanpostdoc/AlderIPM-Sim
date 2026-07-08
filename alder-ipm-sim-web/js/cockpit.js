/* ============================================================
   AlderIPM-Sim — Manager Cockpit (Block 5, Simple Mode)
   A decision-first dashboard for forest managers. Three plain-language
   action panels (parasitoid release u_P, bird habitat u_B, larval removal
   u_C) drive ONE overlaid D(t)/K(t) projection with the D_crit line, a
   live R_P establishment badge, a management-effort receipt, and a
   plain-English verdict. A "Play year by year" control animates the run.

   Reuses App.readParams() for the ecological baseline and the existing
   AlderIPMSimModel engine (model.simulate / model.computeRP). No model
   maths is reimplemented here and no scientific routine is modified; the
   cockpit only sets the three control efforts and reads results.
   ============================================================ */
(function () {
  "use strict";

  var N = 16;                 // management planning horizon (years), matches Fig 7/8
  var DEBOUNCE_MS = 160;
  // Quadratic control-cost weights — mirror ControlComparator defaults (Eq 9).
  var C_P = 2, C_C = 5, C_B = 3;

  var els = {};              // cached slider elements
  var lastSim = null;        // cached trajectory for the play animation
  var playTimer = null;
  var scheduled = false;

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function cssVar(name, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; }
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

  // ---- build the cockpit markup inside #tab-dashboard --------------------
  function panel(id, icon, title, plain, unit, max, step, costHint) {
    return '' +
      '<div class="ckpt-panel card">' +
      '  <div class="ckpt-panel-head"><span class="ckpt-ico">' + icon + '</span>' +
      '    <div><div class="ckpt-panel-title">' + title + '</div>' +
      '    <div class="ckpt-panel-plain">' + plain + '</div></div></div>' +
      '  <input type="range" class="ckpt-slider" id="ck-' + id + '" min="0" max="' + max + '" step="' + step + '" value="0" aria-label="' + title + '">' +
      '  <div class="ckpt-panel-foot"><span class="ckpt-val" id="ck-' + id + '-val">0 ' + unit + '</span>' +
      '    <span class="ckpt-cost-hint">' + costHint + '</span></div>' +
      '</div>';
  }

  function build(container, p) {
    var uPmax = (p.u_P_max || 0.5), uCmax = (p.u_C_max || 0.2), uBmax = (p.u_B_max || 1.0);
    container.innerHTML = '' +
      '<div class="ckpt-intro">' +
      '  <h3 class="ckpt-h">Manage your alder stand</h3>' +
      '  <p class="ckpt-sub">Choose this year\u2019s interventions and see the projected canopy over the next ' + N + ' years. Green is a healthy canopy; the red line marks the ' + Math.round((p.D_crit || 0.5) * 100) + '% seasonal-defoliation danger level.</p>' +
      '</div>' +
      '<div class="ckpt-grid">' +
      '  <div class="ckpt-controls">' +
           panel('uP', '\uD83E\uDD9F', 'Release Meigenia parasitoids', 'Biological control of the beetle larvae', 'effort', uPmax, uPmax / 100, 'higher release \u2192 higher cost') +
           panel('uB', '\uD83E\uDD85', 'Add bird habitat', 'Nest boxes &amp; scrub for generalist birds', 'units', uBmax, uBmax / 100, 'boosts natural predation') +
           panel('uC', '\uD83C\uDF3F', 'Manual larval removal', 'Targeted removal days per season', 'days', uCmax, uCmax / 100, 'most costly per unit') +
      '    <div class="ckpt-actions">' +
      '      <button class="btn btn-primary" id="ck-run">Project forest health</button>' +
      '      <button class="btn btn-secondary" id="ck-play">\u25B6 Play year by year</button>' +
      '      <button class="btn btn-secondary" id="ck-reset">Reset</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="ckpt-output">' +
      '    <div class="ckpt-badges">' +
      '      <span class="ckpt-badge" id="ck-rp">R_P \u2014</span>' +
      '      <span class="ckpt-badge" id="ck-status">Canopy \u2014</span>' +
      '    </div>' +
      '    <div class="ckpt-chart-card card" id="ck-chart-card">' +
      '      <div id="ck-chart" style="width:100%;height:340px;"></div>' +
      '    </div>' +
      '    <div class="ckpt-receipt card" id="ck-receipt" aria-live="polite"></div>' +
      '  </div>' +
      '</div>';

    els = {
      uP: document.getElementById('ck-uP'),
      uC: document.getElementById('ck-uC'),
      uB: document.getElementById('ck-uB')
    };
    ['uP', 'uC', 'uB'].forEach(function (k) {
      els[k].addEventListener('input', function () { updateValLabels(); schedule(); });
    });
    document.getElementById('ck-run').addEventListener('click', function () { stopPlay(); recompute(); });
    document.getElementById('ck-reset').addEventListener('click', function () {
      stopPlay(); els.uP.value = 0; els.uC.value = 0; els.uB.value = 0; updateValLabels(); recompute();
    });
    document.getElementById('ck-play').addEventListener('click', play);
    updateValLabels();
  }

  function readControls() {
    return {
      u_P: parseFloat(els.uP.value) || 0,
      u_C: parseFloat(els.uC.value) || 0,
      u_B: parseFloat(els.uB.value) || 0
    };
  }
  function updateValLabels() {
    var c = readControls();
    document.getElementById('ck-uP-val').textContent = c.u_P.toFixed(2) + ' effort';
    document.getElementById('ck-uB-val').textContent = c.u_B.toFixed(2) + ' units';
    document.getElementById('ck-uC-val').textContent = c.u_C.toFixed(2) + ' days';
  }

  // ---- compute (reuses the model engine) --------------------------------
  function simulate(p, c) {
    if (typeof AlderIPMSimModel === "undefined") return null;
    var m, sim, rp;
    try {
      m = new AlderIPMSimModel(p);
      m.u_P = c.u_P; m.u_C = c.u_C; m.u_B = c.u_B;
      sim = m.simulate(1.0, 0.5, p.K_0, 0.0, N, false);
      rp = m.computeRP();               // R_P under current u_C / u_B (u_P handled internally)
    } catch (e) { return null; }
    if (!sim || !sim.D || !sim.K) return null;

    var peakD = 0, li = N;
    for (var i = 0; i <= N; i++) if (sim.D[i] > peakD) peakD = sim.D[i];
    var K = sim.K[li], D = sim.D[li], K0 = p.K_0;
    var Kratio = clamp(K / K0, 0, 1);
    var H = clamp(Kratio * (1 - clamp(D, 0, 1)), 0, 1);
    var T = p.T || 50;
    var cost = 0.5 * (C_P * c.u_P * c.u_P + C_C * c.u_C * c.u_C) * T * N + 0.5 * C_B * c.u_B * c.u_B * N;
    return {
      sim: sim, peakD: peakD, finalK: K, finalD: D, Kratio: Kratio, H: H,
      Dcrit: (p.D_crit || 0.5), Kmin: (p.K_min || 0), rp: rp, cost: cost, K0: K0
    };
  }

  // ---- chart ------------------------------------------------------------
  function drawChart(r, uptoYear) {
    if (typeof Plotly === "undefined") return;
    var years = [], Dv = [], Kv = [];
    var top = (uptoYear === undefined) ? N : uptoYear;
    for (var i = 0; i <= top; i++) { years.push(i); Dv.push(r.sim.D[i]); Kv.push(r.sim.K[i]); }

    var green = cssVar('--primary', '#2f6b4f');
    var amber = cssVar('--canopy-stress', '#cf9418');
    var red = cssVar('--danger', '#b01722');
    var text = cssVar('--text', '#16251a');
    var muted = cssVar('--text-muted', '#55684f');
    var grid = cssVar('--border', '#d4ddc7');

    var traces = [
      {
        x: years, y: Dv, name: 'Defoliation D', mode: 'lines', line: { color: amber, width: 3 },
        hovertemplate: 'Year %{x}<br>Defoliation %{y:.2f}<extra></extra>'
      },
      {
        x: years, y: Kv, name: 'Canopy capacity K', mode: 'lines', yaxis: 'y2',
        line: { color: green, width: 3 }, hovertemplate: 'Year %{x}<br>Capacity %{y:.2f}<extra></extra>'
      }
    ];
    var shapes = [{
      type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: r.Dcrit, y1: r.Dcrit,
      line: { color: red, width: 2, dash: 'dash' }
    }];
    var annotations = [{
      xref: 'paper', x: 0.99, yref: 'y', y: r.Dcrit, yanchor: 'bottom', xanchor: 'right',
      text: 'D_crit = ' + r.Dcrit.toFixed(2), showarrow: false,
      font: { color: red, size: 11 }
    }];
    var layout = {
      margin: { l: 46, r: 52, t: 10, b: 40 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Satoshi, system-ui, sans-serif', color: text, size: 12 },
      xaxis: { title: 'Year', gridcolor: grid, zeroline: false, range: [0, N] },
      yaxis: { title: 'Defoliation D', gridcolor: grid, zeroline: false, rangemode: 'tozero', color: amber },
      yaxis2: { title: 'Capacity K', overlaying: 'y', side: 'right', showgrid: false, rangemode: 'tozero', color: green },
      legend: { orientation: 'h', y: 1.12, font: { color: muted, size: 11 } },
      shapes: shapes, annotations: annotations
    };
    Plotly.react('ck-chart', traces, layout, { displayModeBar: false, responsive: true });

    // amber flash when the projection breaches the danger line
    var card = document.getElementById('ck-chart-card');
    if (card) card.classList.toggle('ckpt-breach', r.peakD > r.Dcrit);
  }

  // ---- badges, receipt, verdict ----------------------------------------
  function paintBadge(el, ok, warn, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('cb-ok', 'cb-warn', 'cb-bad');
    el.classList.add(ok ? 'cb-ok' : (warn ? 'cb-warn' : 'cb-bad'));
  }

  function render(r) {
    if (!r) return;
    drawChart(r);

    var rpOk = r.rp >= 1;
    paintBadge(document.getElementById('ck-rp'), rpOk, false,
      'R_P = ' + r.rp.toFixed(2) + (rpOk ? ' \u2713 parasitoid establishes' : ' \u2717 needs release'));

    var canopyOk = r.H >= 0.6 && r.peakD < r.Dcrit;
    var canopyWarn = r.H >= 0.4 && r.peakD < r.Dcrit;
    paintBadge(document.getElementById('ck-status'), canopyOk, canopyWarn,
      'Canopy ' + Math.round(r.H * 100) + '%' + (r.peakD >= r.Dcrit ? ' \u00B7 danger line crossed' : ''));

    // receipt
    var rc = document.getElementById('ck-receipt');
    if (rc) {
      rc.innerHTML =
        '<div class="rc-row"><span>Management effort (relative cost units)</span><b>' + r.cost.toFixed(1) + '</b></div>' +
        '<div class="rc-row"><span>Peak seasonal defoliation</span><b>' + Math.round(r.peakD * 100) + '%</b></div>' +
        '<div class="rc-row"><span>Canopy capacity retained</span><b>' + Math.round(r.Kratio * 100) + '%</b></div>' +
        '<div class="rc-verdict ' + (canopyOk ? 'v-ok' : (canopyWarn ? 'v-warn' : 'v-bad')) + '">' + verdict(r) + '</div>';
    }
  }

  function verdict(r) {
    if (r.peakD >= r.Dcrit) {
      return 'Defoliation crosses the ' + Math.round(r.Dcrit * 100) + '% danger line \u2014 the canopy is at risk. ' +
             (r.rp < 1 ? 'Parasitoids cannot establish on their own here; increase release or bird habitat.' :
                         'Add larval removal or bird habitat to pull the peak below the line.');
    }
    if (r.H >= 0.6) {
      return 'Canopy holds up well over ' + N + ' years. This is a low-risk plan' +
             (r.cost > 0 ? ' \u2014 check whether the same result is reachable at lower effort.' : '.');
    }
    return 'Canopy survives but recovery is slow. Consider a modest increase in parasitoid release or bird habitat.';
  }

  // ---- play year by year ------------------------------------------------
  function play() {
    var r = simulate(baseParams(), readControls());
    if (!r) return;
    lastSim = r; stopPlay();
    var y = 0;
    var btn = document.getElementById('ck-play');
    if (btn) btn.textContent = '\u23F8 Playing\u2026';
    playTimer = setInterval(function () {
      drawChart(r, y);
      y++;
      if (y > N) { stopPlay(); render(r); }
    }, 220);
  }
  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    var btn = document.getElementById('ck-play');
    if (btn) btn.textContent = '\u25B6 Play year by year';
  }

  // ---- scheduling / lifecycle ------------------------------------------
  function recompute() { render(simulate(baseParams(), readControls())); }
  function schedule() {
    if (scheduled) return; scheduled = true;
    setTimeout(function () { scheduled = false; recompute(); }, DEBOUNCE_MS);
  }

  function init() {
    var container = document.getElementById('tab-dashboard');
    if (!container) return;
    build(container, baseParams());
    recompute();
    // Re-theme the chart when the dark/light toggle flips.
    var tog = document.getElementById('btn-theme-toggle');
    if (tog) tog.addEventListener('click', function () { setTimeout(recompute, 60); });
    // If a preset/scenario elsewhere changes the ecological baseline, refresh.
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('[data-preset], .preset-selector, #inline-compare-panel')) setTimeout(recompute, 140);
    });
  }

  window.Cockpit = { recompute: recompute };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
