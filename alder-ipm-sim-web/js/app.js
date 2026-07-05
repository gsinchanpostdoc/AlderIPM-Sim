/**
 * AlderIPM-Sim Web Application — main controller.
 * Wires the tabbed UI to the simulation engine, chart renderer,
 * equilibrium analysis, early warning detection, and control comparison.
 *
 * Features: Plotly.js charts, dark mode, guided tour, tooltips,
 * share configuration, CSV import/export with metadata, accessibility.
 */

/**
 * Map each parameter key to a UI group: tree, beetle, parasitoid, bird.
 */
const PARAM_GROUPS = {
  K_0:   "tree",
  phi:   "tree",
  kappa: "tree",
  D_crit:"tree",
  K_min: "tree",
  T:     "tree",

  R_B:     "beetle",
  sigma_A: "beetle",
  mu_S:    "beetle",
  u_C_max: "beetle",

  beta:    "parasitoid",
  h:       "parasitoid",
  eta:     "parasitoid",
  delta:   "parasitoid",
  mu_I:    "parasitoid",
  mu_F:    "parasitoid",
  sigma_F: "parasitoid",
  u_P_max: "parasitoid",

  c_B:     "bird",
  a_B:     "bird",
  B_index: "bird",
  rho:     "bird",
  u_B_max: "bird"
};

const APP_VERSION = "1.2.0";

const App = {
  runner: new SimulationRunner(),
  savedScenarios: {},
  ewCSVData: null,

  init() {
    this.runner.initModel(getDefaults());
    this.initTheme();
    this.buildParameterPanel();
    this.buildGlossary();
    this.bindEvents();
    this.loadURLParams();
    this.showTourIfFirstVisit();
    this.initComparisonTab();
  },

  /* ── Theme (Dark Mode) ─────────────────────────────────────────── */

  initTheme() {
    const saved = localStorage.getItem('alderipmsim-theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      this._updateThemeButton(true);
    }
  },

  toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('alderipmsim-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('alderipmsim-theme', 'dark');
    }
    this._updateThemeButton(!isDark);
    ChartManager.refreshTheme();
  },

  _updateThemeButton(isDark) {
    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (icon) icon.innerHTML = isDark ? '&#9788;' : '&#9790;';
    if (label) label.textContent = isDark ? 'Light' : 'Dark';
  },

  /* ── Guided Tour ─────────────────────────────────────────────── */

  tourSteps: [
    {
      title: "Welcome to AlderIPM-Sim",
      body: "This tool helps forest managers and researchers model Agelastica alni beetle outbreaks. Let's take a quick tour of the main features."
    },
    {
      title: "Parameters",
      body: "Adjust ecological parameters using the sliders. Each parameter has an info icon showing its ecological description. You can reset individual parameters or entire groups."
    },
    {
      title: "Simulation & Analysis",
      body: "Run multi-year simulations to see beetle, parasitoid, carrying capacity, and defoliation dynamics. Use the within-season viewer to inspect daily dynamics for any year."
    },
    {
      title: "Early Warnings & Sensitivity",
      body: "Detect critical slowing down signals before regime shifts. The PRCC analysis identifies which parameters most influence system stability."
    },
    {
      title: "Ready to Explore",
      body: "Use the dark mode toggle in the header for comfortable viewing. Share your parameter configurations via URL. All charts support zoom, pan, and hover tooltips. Enjoy!"
    }
  ],
  currentTourStep: 0,

  showTourIfFirstVisit() {
    if (localStorage.getItem('alderipmsim-tour-done')) return;
    this.showTour();
  },

  showTour() {
    this.currentTourStep = 0;
    this._renderTourStep();
    document.getElementById('tour-overlay').classList.add('active');
  },

  _renderTourStep() {
    const step = this.tourSteps[this.currentTourStep];
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-body').textContent = step.body;
    document.getElementById('tour-step-indicator').textContent =
      'Step ' + (this.currentTourStep + 1) + ' of ' + this.tourSteps.length;

    const nextBtn = document.getElementById('tour-next');
    nextBtn.textContent = this.currentTourStep === this.tourSteps.length - 1 ? 'Get Started' : 'Next';
  },

  nextTourStep() {
    this.currentTourStep++;
    if (this.currentTourStep >= this.tourSteps.length) {
      this.closeTour();
    } else {
      this._renderTourStep();
    }
  },

  closeTour() {
    document.getElementById('tour-overlay').classList.remove('active');
    localStorage.setItem('alderipmsim-tour-done', '1');
  },

  /* ── Parameters Tab ──────────────────────────────────────────────── */

  buildParameterPanel() {
    const containers = {
      tree:       document.getElementById("sliders-tree"),
      beetle:     document.getElementById("sliders-beetle"),
      parasitoid: document.getElementById("sliders-parasitoid"),
      bird:       document.getElementById("sliders-bird")
    };

    for (const [key, meta] of Object.entries(PARAM_REGISTRY)) {
      const group = PARAM_GROUPS[key];
      if (!group || !containers[group]) continue;

      const step = this._computeStep(meta);
      const row = document.createElement("div");
      row.className = "param-slider-row";
      row.dataset.paramKey = key;
      const lbl = (typeof PARAM_LABELS !== 'undefined' && PARAM_LABELS[key]) ? PARAM_LABELS[key] : null;
      const plainLabel = lbl ? lbl.short : '';
      const plainHint  = lbl ? lbl.hint  : '';
      row.innerHTML =
        '<div class="param-label-line">' +
          '<span class="param-symbol">' + meta.symbol + '</span>' +
          '<span class="param-name-text">' + key + '</span>' +
          (plainLabel ? '<span class="param-plain-label" title="' + plainHint.replace(/"/g, "&quot;") + '">' + plainLabel + '</span>' : '') +
          '<button class="param-info-btn" type="button" aria-label="Info about ' + key + '" tabindex="0">' +
            '<span aria-hidden="true">&#9432;</span>' +
            '<span class="tooltip-content">' +
              (plainLabel ? '<strong>' + plainLabel + '</strong><br>' : '') +
              meta.description +
              (plainHint ? '<br><em>' + plainHint + '</em>' : '') +
            '</span>' +
          '</button>' +
        '</div>' +
        '<div class="param-control-line">' +
          '<input type="range" id="slider-' + key + '"' +
            ' min="' + meta.min + '" max="' + meta.max + '"' +
            ' step="' + step + '" value="' + meta.default + '"' +
            ' aria-label="' + meta.symbol + ' parameter slider"' +
            ' aria-valuemin="' + meta.min + '" aria-valuemax="' + meta.max + '"' +
            ' aria-valuenow="' + meta.default + '" />' +
          '<span class="param-val-display" id="val-' + key + '">' + meta.default + '</span>' +
          '<span class="param-unit-badge">' + meta.unit + '</span>' +
          '<button class="btn-reset-param" data-key="' + key + '" title="Reset to default" aria-label="Reset ' + key + ' to default">&#x21ba;</button>' +
        '</div>';
      containers[group].appendChild(row);
    }

    // Bind slider events
    for (const key of Object.keys(PARAM_REGISTRY)) {
      const slider = document.getElementById("slider-" + key);
      if (!slider) continue;
      slider.addEventListener("input", () => {
        const val = parseFloat(slider.value).toPrecision(4);
        document.getElementById("val-" + key).textContent = val;
        slider.setAttribute('aria-valuenow', slider.value);
      });
    }

    // Bind per-param reset buttons
    document.querySelectorAll(".btn-reset-param").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const meta = PARAM_REGISTRY[key];
        if (!meta) return;
        const slider = document.getElementById("slider-" + key);
        if (slider) {
          slider.value = meta.default;
          slider.setAttribute('aria-valuenow', meta.default);
        }
        document.getElementById("val-" + key).textContent = meta.default;
      });
    });

    // Bind group reset buttons
    document.querySelectorAll(".btn-reset-group").forEach(btn => {
      btn.addEventListener("click", () => {
        const group = btn.dataset.group;
        for (const [key, g] of Object.entries(PARAM_GROUPS)) {
          if (g !== group) continue;
          const meta = PARAM_REGISTRY[key];
          const slider = document.getElementById("slider-" + key);
          if (slider) slider.value = meta.default;
          const valEl = document.getElementById("val-" + key);
          if (valEl) valEl.textContent = meta.default;
        }
      });
    });

    // Reset all
    document.getElementById("btn-reset-all").addEventListener("click", () => {
      for (const [key, meta] of Object.entries(PARAM_REGISTRY)) {
        const slider = document.getElementById("slider-" + key);
        if (slider) slider.value = meta.default;
        const valEl = document.getElementById("val-" + key);
        if (valEl) valEl.textContent = meta.default;
      }
      // Reset preset selector
      const presetSel = document.getElementById("preset-select");
      if (presetSel) presetSel.value = "";
      const descCard = document.getElementById("preset-description-card");
      if (descCard) descCard.style.display = "none";
    });

    // Build preset dropdown
    this.buildPresetSelector();
  },

  buildPresetSelector() {
    const select = document.getElementById("preset-select");
    const descCard = document.getElementById("preset-description-card");
    if (!select || typeof PRESETS === "undefined") return;

    // Populate options
    for (const [key, preset] of Object.entries(PRESETS)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = preset.name;
      select.appendChild(opt);
    }

    // Handle selection
    select.addEventListener("change", () => {
      const key = select.value;
      if (!key) {
        descCard.style.display = "none";
        return;
      }
      const preset = PRESETS[key];
      if (!preset) return;

      // Show description card
      const regimeColor = preset.expected_regime === "coexistence" ? "#009E73" : "#D55E00";
      descCard.innerHTML =
        '<strong>' + preset.name + '</strong><br>' +
        preset.description + '<br>' +
        '<span style="color:' + regimeColor + '; font-weight:600;">Expected regime: ' +
        preset.expected_regime + '</span> &middot; <em>' + preset.manuscript_ref + '</em>';
      descCard.style.display = "block";

      // Apply preset: start from defaults, then apply overrides with animation
      const defaults = getDefaults();
      for (const [pKey, meta] of Object.entries(PARAM_REGISTRY)) {
        const targetVal = preset.params.hasOwnProperty(pKey) ? preset.params[pKey] : defaults[pKey];
        this._animateSlider(pKey, targetVal);
      }
    });
  },

  _animateSlider(key, targetVal) {
    const slider = document.getElementById("slider-" + key);
    const valEl = document.getElementById("val-" + key);
    if (!slider) return;

    const startVal = parseFloat(slider.value);
    const diff = targetVal - startVal;
    if (Math.abs(diff) < 1e-10) return;

    const duration = 300; // ms
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startVal + diff * eased;
      slider.value = current;
      slider.setAttribute("aria-valuenow", current);
      if (valEl) valEl.textContent = parseFloat(current).toPrecision(4);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Ensure final value is exact
        slider.value = targetVal;
        slider.setAttribute("aria-valuenow", targetVal);
        if (valEl) valEl.textContent = parseFloat(targetVal).toPrecision(4);
      }
    };
    requestAnimationFrame(animate);
  },

  _computeStep(meta) {
    const range = meta.max - meta.min;
    if (range > 10) return 0.1;
    if (range > 1) return 0.01;
    if (range > 0.1) return 0.001;
    return 0.0001;
  },

  readParams() {
    const params = {};
    for (const key of Object.keys(PARAM_REGISTRY)) {
      const slider = document.getElementById("slider-" + key);
      if (slider) {
        params[key] = parseFloat(slider.value);
      } else {
        params[key] = PARAM_REGISTRY[key].default;
      }
    }
    return params;
  },

  /* ── Share Configuration ─────────────────────────────────────────── */

  shareConfig() {
    const params = this.readParams();
    const defaults = getDefaults();
    const parts = [];

    // Only encode non-default values to keep URL short
    for (const [key, val] of Object.entries(params)) {
      if (Math.abs(val - defaults[key]) > 1e-10) {
        parts.push(key + '=' + val);
      }
    }

    const url = window.location.origin + window.location.pathname +
      (parts.length > 0 ? '?' + parts.join('&') : '');

    navigator.clipboard.writeText(url).then(() => {
      this._showToast('Configuration URL copied to clipboard!');
    }).catch(() => {
      // Fallback: show URL in prompt
      prompt('Share this URL:', url);
    });
  },

  loadURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    let anySet = false;

    for (const [key, val] of urlParams.entries()) {
      if (PARAM_REGISTRY[key]) {
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          const slider = document.getElementById("slider-" + key);
          if (slider) {
            slider.value = numVal;
            slider.setAttribute('aria-valuenow', numVal);
          }
          const valEl = document.getElementById("val-" + key);
          if (valEl) valEl.textContent = numVal.toPrecision(4);
          anySet = true;
        }
      }
    }

    if (anySet) {
      this._showToast('Parameters loaded from shared URL');
    }
  },

  _showToast(message) {
    const existing = document.querySelector('.share-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'share-toast';
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  },

  /* ── Simulation Tab ──────────────────────────────────────────────── */

  runSimulation() {
    const params = this.readParams();
    this.runner.initModel(params);

    const nYears = Math.max(1, Math.min(200,
      parseInt(document.getElementById("sim-years").value) || 50));
    const config = {
      A0: parseFloat(document.getElementById("sim-A0").value) || 1.0,
      F0: parseFloat(document.getElementById("sim-F0").value) || 0.5,
      K0: null,
      D0: parseFloat(document.getElementById("sim-D0").value) || 0.0,
      nYears: nYears,
      u_C: parseFloat(document.getElementById("sim-uC").value) || 0.0,
      u_P: parseFloat(document.getElementById("sim-uP").value) || 0.0,
      storeWithinSeason: true
    };

    const result = this.runner.runSimulation(config);

    // Render 4 subplots
    ChartManager.createSubplots(result);

    // Summary
    const summary = this.runner.computeSummary(result);
    this.updateSummary(summary);

    // Show summary bar
    document.getElementById("sim-summary").style.display = "";

    // Show within-season viewer and populate year dropdown
    const wsViewer = document.getElementById("ws-viewer");
    wsViewer.style.display = "";
    const wsSelect = document.getElementById("ws-year-select");
    wsSelect.innerHTML = "";
    for (let i = 0; i < nYears; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = "Year " + i;
      wsSelect.appendChild(opt);
    }
    wsSelect.value = 0;
  },

  updateSummary(summary) {
    if (!summary) return;
    const statusEl = document.getElementById("sum-status");
    statusEl.textContent = summary.status.replace(/_/g, " ");
    statusEl.className = "status-badge status-" + summary.status;

    const rp = this.runner.model.computeRP();
    document.getElementById("sum-rp").textContent = rp.toFixed(4);
    document.getElementById("sum-peak-a").textContent = summary.peakBeetles.toFixed(4);
    document.getElementById("sum-peak-d").textContent = summary.peakDefoliation.toFixed(4);
    document.getElementById("sum-final-k").textContent = summary.finalK.toFixed(4);
  },

  viewWithinSeason() {
    if (!this.runner.lastResult || !this.runner.lastResult.withinSeason) return;
    const year = parseInt(document.getElementById("ws-year-select").value) || 0;
    const ws = this.runner.lastResult.withinSeason;
    if (year < 0 || year >= ws.length) {
      this._showToast('Year ' + year + ' is out of range');
      return;
    }
    const params = this.readParams();
    ChartManager.createWithinSeasonCharts(ws[year], params, year);
  },

  exportCSV() {
    if (!this.runner.lastResult) return;
    const params = this.readParams();
    const r = this.runner.lastResult;

    // Add metadata header
    const meta = [
      '# AlderIPM-Sim Simulation Export',
      '# Version: ' + APP_VERSION,
      '# Timestamp: ' + new Date().toISOString(),
      '# Parameters: ' + JSON.stringify(params),
      '#'
    ];

    const csv = this.runner.exportCSV(r);
    this._downloadFile(meta.join('\n') + '\n' + csv, 'alder-ipm-sim_simulation.csv', 'text/csv');
  },

  exportJSON() {
    if (!this.runner.lastResult) return;
    const r = this.runner.lastResult;
    const params = this.readParams();
    const data = {
      metadata: {
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
        parameters: params
      },
      timeSeries: []
    };
    for (let i = 0; i < r.A.length; i++) {
      data.timeSeries.push({ year: i, A: r.A[i], F: r.F[i], K: r.K[i], D: r.D[i] });
    }
    this._downloadFile(JSON.stringify(data, null, 2), "alder-ipm-sim_simulation.json", "application/json");
  },

  importCSV() {
    document.getElementById("sim-csv-import").click();
  },

  handleCSVImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n');

      // Try to extract parameters from metadata
      let importedParams = null;
      for (const line of lines) {
        if (line.startsWith('# Parameters: ')) {
          try {
            importedParams = JSON.parse(line.substring('# Parameters: '.length));
          } catch (e) { /* ignore */ }
        }
      }

      // Parse data lines
      const dataLines = lines.filter(l => !l.startsWith('#') && l.trim().length > 0);
      if (dataLines.length < 2) {
        this._showToast('CSV has no data rows');
        return;
      }

      const headers = dataLines[0].split(',').map(h => h.trim());
      const A = [], F = [], K = [], D = [];

      for (let i = 1; i < dataLines.length; i++) {
        const cols = dataLines[i].split(',');
        const row = {};
        headers.forEach((h, j) => { row[h] = parseFloat(cols[j]); });

        A.push(row.A_beetles || row.A || 0);
        F.push(row.F_parasitoids || row.F || 0);
        K.push(row.K_capacity || row.K || 1);
        D.push(row.D_defoliation || row.D || 0);
      }

      // Apply imported parameters if found
      if (importedParams) {
        for (const [key, val] of Object.entries(importedParams)) {
          const slider = document.getElementById("slider-" + key);
          if (slider) {
            slider.value = val;
            const valEl = document.getElementById("val-" + key);
            if (valEl) valEl.textContent = parseFloat(val).toPrecision(4);
          }
        }
        this._showToast('Imported CSV with ' + A.length + ' data points and parameters');
      } else {
        this._showToast('Imported CSV with ' + A.length + ' data points');
      }

      // Create a result object and render
      const result = { A, F, K, D };
      this.runner.lastResult = result;
      ChartManager.createSubplots(result);
      document.getElementById("sim-summary").style.display = "none";
    };
    reader.readAsText(file);
  },

  /* ── Equilibrium Tab (Newton-Raphson) ────────────────────────────── */

  computeEquilibria() {
    const params = this.readParams();
    const fixedPoints = this._findFixedPoints(params);

    const tbody = document.getElementById("eq-tbody");
    tbody.innerHTML = "";

    this.lastEquilibria = fixedPoints;

    if (fixedPoints.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">No fixed points found.</td></tr>';
      ChartManager.destroy("chart-r1-r2");
      ChartManager.destroy("chart-phase-AF");
      ChartManager.destroy("chart-phase-AD");
    } else {
      const model = new AlderIPMSimModel(params);
      fixedPoints.forEach((fp, idx) => {
        fp.R1 = model.computeR1(fp.A, fp.F, fp.K, fp.D);
        fp.R2 = model.computeR2(fp.A, fp.F, fp.K, fp.D);

        const tr = document.createElement("tr");
        const stabilityClass = fp.stable ? "eq-stable" : "eq-unstable";
        const r1Str = isNaN(fp.R1) ? "N/A" : fp.R1.toFixed(4);
        const r2Str = isNaN(fp.R2) ? "N/A" : fp.R2.toFixed(4);
        tr.innerHTML =
          "<td>" + (idx + 1) + "</td>" +
          "<td>" + fp.A.toFixed(6) + "</td>" +
          "<td>" + fp.F.toFixed(6) + "</td>" +
          "<td>" + fp.K.toFixed(6) + "</td>" +
          "<td>" + fp.D.toFixed(6) + "</td>" +
          '<td class="' + stabilityClass + '">' + (fp.stable ? "Stable" : "Unstable") + "</td>" +
          "<td>" + fp.dominantEig.toFixed(6) + "</td>" +
          "<td>" + r1Str + "</td>" +
          "<td>" + r2Str + "</td>";
        tbody.appendChild(tr);
      });

      // R1 vs R2 scatter
      ChartManager.createR1R2Scatter("chart-r1-r2", fixedPoints);

      // Phase portraits: run a simulation from one of the fixed points
      this._renderPhasePortraits(params, fixedPoints);
    }

    document.getElementById("eq-results").style.display = "";
    document.getElementById("btn-export-eq-csv").style.display = fixedPoints.length > 0 ? "" : "none";
    document.getElementById("btn-export-eq-json").style.display = fixedPoints.length > 0 ? "" : "none";
  },

  _renderPhasePortraits(params, fixedPoints) {
    // Use the first fixed point as starting conditions, with a perturbation
    const fp = fixedPoints[0];
    const model = new AlderIPMSimModel(params);
    const A0 = fp.A * 1.3;
    const sim = model.simulate(A0, fp.F, fp.K, fp.D, 50, false);

    ChartManager.createPhasePortrait('chart-phase-AF', sim.A, sim.F,
      'Beetle density A (ind/ha)', 'Parasitoid density F (ind/ha)', 'Phase Portrait: A vs F');
    ChartManager.createPhasePortrait('chart-phase-AD', sim.A, sim.D,
      'Beetle density A (ind/ha)', 'Defoliation D', 'Phase Portrait: A vs D');
  },

  _findFixedPoints(params) {
    const initialGuesses = [
      [0.01, 0.01, params.K_0, 0.0],
      [1.0,  0.5,  params.K_0, 0.0],
      [0.5,  0.2,  params.K_0 * 0.8, 0.1],
      [2.0,  1.0,  params.K_0, 0.0],
      [0.1,  1.0,  params.K_0 * 0.5, 0.3],
      [3.0,  0.1,  params.K_0 * 0.9, 0.05]
    ];

    const found = [];

    for (const guess of initialGuesses) {
      const fp = this._newtonRaphson(params, guess);
      if (fp && this._isPhysical(fp)) {
        const isDuplicate = found.some(existing =>
          Math.abs(existing.A - fp.A) < 1e-4 &&
          Math.abs(existing.F - fp.F) < 1e-4 &&
          Math.abs(existing.K - fp.K) < 1e-4 &&
          Math.abs(existing.D - fp.D) < 1e-4
        );
        if (!isDuplicate) {
          const jac = this._jacobian(params, [fp.A, fp.F, fp.K, fp.D]);
          const eigs = this._eigenvalues2x2or4x4(jac);
          const maxAbsEig = Math.max(...eigs.map(e => Math.abs(e)));
          fp.stable = maxAbsEig < 1.0;
          fp.dominantEig = maxAbsEig;
          found.push(fp);
        }
      }
    }

    return found;
  },

  _isPhysical(fp) {
    return fp.A >= -0.01 && fp.F >= -0.01 && fp.K > 0 && isFinite(fp.A) && isFinite(fp.F);
  },

  _newtonRaphson(params, x0, maxIter, tol) {
    maxIter = maxIter || 200;
    tol = tol || 1e-10;
    let x = x0.slice();
    const eps = 1e-7;

    for (let iter = 0; iter < maxIter; iter++) {
      const gx = this._annualMapVec(params, x);
      const residual = [gx[0] - x[0], gx[1] - x[1], gx[2] - x[2], gx[3] - x[3]];

      const norm = Math.sqrt(residual.reduce((s, v) => s + v * v, 0));
      if (norm < tol) {
        return { A: Math.max(x[0], 0), F: Math.max(x[1], 0), K: x[2], D: x[3] };
      }

      const J = [];
      for (let i = 0; i < 4; i++) {
        J.push([]);
        for (let j = 0; j < 4; j++) {
          const xp = x.slice();
          xp[j] += eps;
          const gp = this._annualMapVec(params, xp);
          J[i].push((gp[i] - xp[i] - residual[i]) / eps);
        }
      }

      const dx = this._solve4x4(J, residual.map(v => -v));
      if (!dx) break;

      for (let i = 0; i < 4; i++) {
        x[i] += dx[i];
      }
    }
    return null;
  },

  _annualMapVec(params, x) {
    const model = new AlderIPMSimModel(params);
    const result = model.annualMap(Math.max(x[0], 0), Math.max(x[1], 0), Math.max(x[2], 0.01), x[3]);
    return [result.A_next, result.F_next, result.K_next, result.D_next];
  },

  _jacobian(params, x) {
    const eps = 1e-7;
    const g0 = this._annualMapVec(params, x);
    const J = [];
    for (let i = 0; i < 4; i++) {
      J.push([]);
      for (let j = 0; j < 4; j++) {
        const xp = x.slice();
        xp[j] += eps;
        const gp = this._annualMapVec(params, xp);
        J[i].push((gp[i] - g0[i]) / eps);
      }
    }
    return J;
  },

  _solve4x4(A, b) {
    const n = 4;
    const M = A.map((row, i) => [...row, b[i]]);

    for (let col = 0; col < n; col++) {
      let maxRow = col;
      let maxVal = Math.abs(M[col][col]);
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(M[row][col]) > maxVal) {
          maxVal = Math.abs(M[row][col]);
          maxRow = row;
        }
      }
      if (maxVal < 1e-14) return null;
      if (maxRow !== col) { const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp; }

      for (let row = col + 1; row < n; row++) {
        const factor = M[row][col] / M[col][col];
        for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
      }
    }

    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = M[i][n];
      for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
      x[i] /= M[i][i];
    }
    return x;
  },

  _eigenvalues2x2or4x4(M) {
    const n = 4;
    let A = M.map(row => row.slice());

    for (let iter = 0; iter < 60; iter++) {
      const Q = Array.from({ length: n }, () => new Array(n).fill(0));
      const R = Array.from({ length: n }, () => new Array(n).fill(0));

      for (let j = 0; j < n; j++) {
        const v = new Array(n);
        for (let i = 0; i < n; i++) v[i] = A[i][j];

        for (let k = 0; k < j; k++) {
          let dot = 0;
          for (let i = 0; i < n; i++) dot += Q[i][k] * v[i];
          R[k][j] = dot;
          for (let i = 0; i < n; i++) v[i] -= dot * Q[i][k];
        }

        let norm = 0;
        for (let i = 0; i < n; i++) norm += v[i] * v[i];
        norm = Math.sqrt(norm);

        R[j][j] = norm;
        if (norm > 1e-14) {
          for (let i = 0; i < n; i++) Q[i][j] = v[i] / norm;
        }
      }

      const newA = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          let s = 0;
          for (let k = 0; k < n; k++) s += R[i][k] * Q[k][j];
          newA[i][j] = s;
        }
      }
      A = newA;
    }

    return [A[0][0], A[1][1], A[2][2], A[3][3]];
  },

  /* ── Bifurcation Tab ────────────────────────────────────────────── */

  runBifurcation() {
    const params = this.readParams();
    const paramName = document.getElementById("bif-param").value;
    const lo = parseFloat(document.getElementById("bif-lo").value);
    const hi = parseFloat(document.getElementById("bif-hi").value);
    const npts = parseInt(document.getElementById("bif-npts").value) || 40;

    if (lo >= hi) { this._showToast("Range start must be less than end"); return; }

    const progressDiv = document.getElementById("bif-progress");
    const progressBar = document.getElementById("bif-progress-bar");
    const progressText = document.getElementById("bif-progress-text");
    progressDiv.style.display = "";
    progressBar.max = npts;
    progressBar.value = 0;
    progressText.textContent = "0 / " + npts;

    const btn = document.getElementById("btn-run-bif");
    btn.disabled = true;
    btn.textContent = "Computing...";

    const sweepVals = [];
    for (let i = 0; i < npts; i++) {
      sweepVals.push(lo + (hi - lo) * i / (npts - 1));
    }

    const allEquilibria = [];
    const rpVals = [];
    let currentIdx = 0;
    const batchSize = 3;

    const processBatch = () => {
      const end = Math.min(currentIdx + batchSize, npts);
      for (let i = currentIdx; i < end; i++) {
        const p = Object.assign({}, params);
        p[paramName] = sweepVals[i];

        // Find fixed points at this parameter value
        const fps = this._findFixedPoints(p);
        allEquilibria.push(fps);

        // Compute R_P
        try {
          const model = new AlderIPMSimModel(p);
          rpVals.push(model.computeRP());
        } catch (e) {
          rpVals.push(NaN);
        }
      }
      currentIdx = end;
      progressBar.value = currentIdx;
      progressText.textContent = currentIdx + " / " + npts;

      if (currentIdx < npts) {
        setTimeout(processBatch, 0);
      } else {
        this._renderBifurcationResults(sweepVals, allEquilibria, rpVals, paramName);
        btn.disabled = false;
        btn.textContent = "Compute Bifurcation";
        progressDiv.style.display = "none";
        document.getElementById("bif-results").style.display = "";
      }
    };

    setTimeout(processBatch, 0);
  },

  _renderBifurcationResults(sweepVals, allEquilibria, rpVals, paramName) {
    const classColors = {
      trivial: "#6c757d", canopy_only: "#17a2b8",
      parasitoid_free: "#dc3545", coexistence: "#28a745"
    };

    // Group points by (class, stable) for D* plot
    const groups = {};
    const rhoGroups = {};
    for (let i = 0; i < sweepVals.length; i++) {
      const fps = allEquilibria[i];
      for (const fp of fps) {
        const cls = this._classifyEq(fp);
        const key = cls + (fp.stable ? "_stable" : "_unstable");
        if (!groups[key]) groups[key] = { x: [], y: [], hover: [], cls, stable: fp.stable };
        groups[key].x.push(sweepVals[i]);
        groups[key].y.push(fp.D);
        groups[key].hover.push(
          "A*=" + fp.A.toFixed(4) + " F*=" + fp.F.toFixed(4) +
          " K*=" + fp.K.toFixed(4) + " D*=" + fp.D.toFixed(4) +
          " |λ|=" + fp.dominantEig.toFixed(4)
        );
        if (!rhoGroups[key]) rhoGroups[key] = { x: [], y: [], cls, stable: fp.stable };
        rhoGroups[key].x.push(sweepVals[i]);
        rhoGroups[key].y.push(fp.dominantEig);
      }
    }

    // D* vs parameter
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const plotBg = isDark ? '#1e1e1e' : '#fff';
    const paperBg = isDark ? '#2d2d2d' : '#fff';
    const fontColor = isDark ? '#ccc' : '#333';

    const dstarTraces = [];
    for (const [key, g] of Object.entries(groups)) {
      dstarTraces.push({
        x: g.x, y: g.y, mode: "markers", type: "scatter",
        marker: { color: classColors[g.cls] || "#999", symbol: g.stable ? "circle" : "x", size: 7 },
        name: g.cls + (g.stable ? " (stable)" : " (unstable)"),
        text: g.hover, hoverinfo: "text"
      });
    }
    Plotly.newPlot("chart-bif-dstar", dstarTraces, {
      xaxis: { title: paramName }, yaxis: { title: "Equilibrium D*" },
      title: "Bifurcation: D* vs " + paramName,
      plot_bgcolor: plotBg, paper_bgcolor: paperBg, font: { color: fontColor },
      legend: { orientation: "h", y: 1.12 }
    }, { responsive: true });

    // R_P vs parameter
    Plotly.newPlot("chart-bif-rp", [{
      x: sweepVals, y: rpVals, mode: "lines+markers", type: "scatter",
      marker: { size: 5 }, name: "R_P"
    }], {
      xaxis: { title: paramName }, yaxis: { title: "R_P" },
      title: "R_P vs " + paramName,
      shapes: [{ type: "line", x0: sweepVals[0], x1: sweepVals[sweepVals.length - 1],
                 y0: 1, y1: 1, line: { color: "red", dash: "dash", width: 2 } }],
      plot_bgcolor: plotBg, paper_bgcolor: paperBg, font: { color: fontColor }
    }, { responsive: true });

    // |λ| vs parameter
    const rhoTraces = [];
    for (const [key, g] of Object.entries(rhoGroups)) {
      rhoTraces.push({
        x: g.x, y: g.y, mode: "markers", type: "scatter",
        marker: { color: classColors[g.cls] || "#999", symbol: g.stable ? "circle" : "x", size: 6 },
        name: g.cls + (g.stable ? " (stable)" : " (unstable)")
      });
    }
    Plotly.newPlot("chart-bif-rho", rhoTraces, {
      xaxis: { title: paramName }, yaxis: { title: "|λ|" },
      title: "|λ| vs " + paramName,
      shapes: [{ type: "line", x0: sweepVals[0], x1: sweepVals[sweepVals.length - 1],
                 y0: 1, y1: 1, line: { color: "red", dash: "dash", width: 2 } }],
      plot_bgcolor: plotBg, paper_bgcolor: paperBg, font: { color: fontColor },
      legend: { orientation: "h", y: 1.12 }
    }, { responsive: true });
  },

  _classifyEq(fp) {
    const tol = 1e-6;
    if (fp.A < tol) return "trivial";
    if (fp.F < tol && fp.D < tol) return "canopy_only";
    if (fp.F < tol) return "parasitoid_free";
    return "coexistence";
  },

  runBifurcation2D() {
    const params = this.readParams();
    const p1Name = document.getElementById("bif2-p1").value;
    const p2Name = document.getElementById("bif2-p2").value;
    const lo1 = parseFloat(document.getElementById("bif2-lo1").value);
    const hi1 = parseFloat(document.getElementById("bif2-hi1").value);
    const lo2 = parseFloat(document.getElementById("bif2-lo2").value);
    const hi2 = parseFloat(document.getElementById("bif2-hi2").value);
    const grid = parseInt(document.getElementById("bif2-grid").value) || 25;

    if (p1Name === p2Name) { this._showToast("Select two different parameters"); return; }
    if (lo1 >= hi1 || lo2 >= hi2) { this._showToast("Range start must be less than end"); return; }

    const total = grid * grid;
    const progressDiv = document.getElementById("bif2d-progress");
    const progressBar = document.getElementById("bif2d-progress-bar");
    const progressText = document.getElementById("bif2d-progress-text");
    progressDiv.style.display = "";
    progressBar.max = total;
    progressBar.value = 0;
    progressText.textContent = "0 / " + total;

    const btn = document.getElementById("btn-run-bif2d");
    btn.disabled = true;
    btn.textContent = "Computing...";

    const p1Vals = [];
    const p2Vals = [];
    for (let i = 0; i < grid; i++) {
      p1Vals.push(lo1 + (hi1 - lo1) * i / (grid - 1));
      p2Vals.push(lo2 + (hi2 - lo2) * i / (grid - 1));
    }

    const rpGrid = [];
    for (let i = 0; i < grid; i++) rpGrid.push(new Array(grid).fill(NaN));

    let currentRow = 0;
    const batchRows = 2;

    const processBatch = () => {
      const endRow = Math.min(currentRow + batchRows, grid);
      for (let i = currentRow; i < endRow; i++) {
        for (let j = 0; j < grid; j++) {
          const p = Object.assign({}, params);
          p[p1Name] = p1Vals[i];
          p[p2Name] = p2Vals[j];
          try {
            const model = new AlderIPMSimModel(p);
            rpGrid[i][j] = model.computeRP();
          } catch (e) { /* NaN */ }
        }
      }
      currentRow = endRow;
      progressBar.value = currentRow * grid;
      progressText.textContent = (currentRow * grid) + " / " + total;

      if (currentRow < grid) {
        setTimeout(processBatch, 0);
      } else {
        this._renderBifurcation2DResults(p1Vals, p2Vals, rpGrid, p1Name, p2Name, params);
        btn.disabled = false;
        btn.textContent = "Compute 2-D Boundary";
        progressDiv.style.display = "none";
        document.getElementById("bif2d-results").style.display = "";
      }
    };

    setTimeout(processBatch, 0);
  },

  _renderBifurcation2DResults(p1Vals, p2Vals, rpGrid, p1Name, p2Name, params) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const plotBg = isDark ? '#1e1e1e' : '#fff';
    const paperBg = isDark ? '#2d2d2d' : '#fff';
    const fontColor = isDark ? '#ccc' : '#333';

    // Transpose grid for Plotly (z[j][i] where j=y, i=x)
    const zT = [];
    for (let j = 0; j < p2Vals.length; j++) {
      const row = [];
      for (let i = 0; i < p1Vals.length; i++) {
        row.push(rpGrid[i][j]);
      }
      zT.push(row);
    }

    const traces = [
      {
        x: p1Vals, y: p2Vals, z: zT,
        type: "heatmap",
        colorscale: [[0, "red"], [0.5, "yellow"], [1, "green"]],
        colorbar: { title: "R_P" },
        zmin: 0, zmax: Math.max(2, Math.max(...rpGrid.flat().filter(v => isFinite(v))))
      },
      {
        x: p1Vals, y: p2Vals, z: zT,
        type: "contour",
        contours: { start: 1, end: 1, size: 0.1, coloring: "none" },
        line: { color: "black", width: 3 },
        showscale: false, name: "R_P = 1"
      },
      {
        x: [params[p1Name]], y: [params[p2Name]],
        type: "scatter", mode: "markers",
        marker: { size: 14, color: "white", symbol: "star", line: { width: 2, color: "black" } },
        name: "Current"
      }
    ];

    Plotly.newPlot("chart-bif2d", traces, {
      xaxis: { title: p1Name }, yaxis: { title: p2Name },
      title: "R_P boundary: " + p1Name + " vs " + p2Name,
      plot_bgcolor: plotBg, paper_bgcolor: paperBg, font: { color: fontColor }
    }, { responsive: true });
  },

  /* ── Early Warnings Tab ──────────────────────────────────────────── */

  runEarlyWarnings() {
    const source = document.querySelector('input[name="ew-source"]:checked').value;
    const column = document.getElementById("ew-column").value;
    const windowInput = parseInt(document.getElementById("ew-window").value) || 0;

    let series = null;

    if (source === "simulation") {
      if (!this.runner.lastResult) {
        this.runSimulation();
      }
      if (!this.runner.lastResult) return;
      series = this.runner.lastResult[column];
    } else if (source === "csv" && this.ewCSVData) {
      if (this.ewCSVData.columns[column]) {
        series = this.ewCSVData.columns[column];
      } else {
        const headers = this.ewCSVData.headers;
        const matchIdx = headers.findIndex(h =>
          h.toLowerCase() === column.toLowerCase() ||
          h.toLowerCase().includes(column.toLowerCase())
        );
        if (matchIdx >= 0) {
          series = this.ewCSVData.columns[headers[matchIdx]];
        }
      }
    }

    if (!series || series.length < 5) {
      alert("Not enough data. Need at least 5 data points. " +
            (source === "csv" ? "Check that the CSV has a column matching '" + column + "'." :
             "Run a simulation first from the Simulation tab."));
      return;
    }

    const windowSize = windowInput > 0 ? windowInput : null;
    const detector = new EarlyWarningDetector(windowSize);
    const result = detector.analyze(series);
    this.lastEWResult = result;
    document.getElementById("btn-export-ew-csv").style.display = "";
    document.getElementById("btn-export-ew-json").style.display = "";

    // Traffic-light alert
    const alertBox = document.getElementById("ew-alert-box");
    alertBox.style.display = "flex";
    alertBox.className = "ew-alert-box alert-" + result.alertLevel;
    document.getElementById("ew-alert-text").textContent = result.interpretation;

    // Kendall tau table
    const tbody = document.getElementById("ew-kendall-tbody");
    tbody.innerHTML = "";
    const indicators = [
      { name: "Variance", key: "variance" },
      { name: "Autocorrelation (lag-1)", key: "autocorrelation" },
      { name: "Spectral Reddening Index", key: "spectralIndex" }
    ];

    for (const ind of indicators) {
      const kr = result.kendallResults[ind.key];
      const tr = document.createElement("tr");
      const sigClass = kr.significant ? "eq-unstable" : "eq-stable";
      tr.innerHTML =
        "<td>" + ind.name + "</td>" +
        "<td>" + kr.tau.toFixed(4) + "</td>" +
        "<td>" + kr.pValue.toFixed(4) + "</td>" +
        '<td class="' + sigClass + '">' + (kr.significant ? "Yes" : "No") + "</td>";
      tbody.appendChild(tr);
    }
    document.getElementById("ew-kendall-results").style.display = "";

    // Indicator charts using Plotly
    const effWindow = windowSize || Math.max(Math.floor(series.length * 0.5), 3);
    const chartLabels = result.indicators.variance.map((_, i) => i + effWindow);

    ChartManager.createEWChart("chart-ew-var", chartLabels, result.indicators.variance,
      "Rolling Variance", ChartManager.colors.beetles);
    ChartManager.createEWChart("chart-ew-ac", chartLabels, result.indicators.autocorrelation,
      "Rolling Autocorrelation (lag-1)", ChartManager.colors.capacity);

    const specLabels = result.indicators.spectralIndex.map((_, i) => i + effWindow);
    ChartManager.createEWChart("chart-ew-spec", specLabels, result.indicators.spectralIndex,
      "Spectral Reddening Index", ChartManager.colors.defoliation);
  },

  /* ── Control Comparison Tab ──────────────────────────────────────── */

  runControlComparison() {
    const params = this.readParams();
    const comparator = new ControlComparator(params);

    const config = {
      A0: parseFloat(document.getElementById("ctrl-A0").value) || 1.0,
      F0: parseFloat(document.getElementById("ctrl-F0").value) || 0.5,
      K0: null,
      D0: parseFloat(document.getElementById("ctrl-D0").value) || 0.0,
      nYears: Math.max(1, Math.min(200,
        parseInt(document.getElementById("ctrl-years").value) || 50))
    };

    const weights = {
      w1: parseFloat(document.getElementById("ctrl-w1").value),
      w2: parseFloat(document.getElementById("ctrl-w2").value),
      w3: parseFloat(document.getElementById("ctrl-w3").value),
      w4: parseFloat(document.getElementById("ctrl-w4").value),
      c_C: parseFloat(document.getElementById("ctrl-cC").value),
      c_P: parseFloat(document.getElementById("ctrl-cP").value)
    };

    const strategies = comparator.compareStrategies(config, weights);

    // Check if custom strategy is enabled; if so, add it
    const customEnabled = document.getElementById("ctrl-custom-enable").checked;
    if (customEnabled) {
      const customControls = {
        u_P: parseFloat(document.getElementById("ctrl-custom-uP").value) || 0,
        u_C: parseFloat(document.getElementById("ctrl-custom-uC").value) || 0,
        u_B: parseFloat(document.getElementById("ctrl-custom-uB").value) || 0
      };
      const customResult = comparator.customStrategy(customControls, config);
      strategies.push(customResult);
    }

    this.lastControlResults = strategies;

    // Find best strategy: minimum J among feasible (rho* < 1) strategies
    // (paper's lexicographic rule); fall back to global minimum J if none feasible.
    const feasIdx = strategies
      .map((s, i) => ({ s, i }))
      .filter(o => (o.s.feasible !== undefined ? o.s.feasible : (!o.s.dCritExceeded && !o.s.kBelowMin)));
    let bestIdx = 0;
    if (feasIdx.length > 0) {
      bestIdx = feasIdx[0].i;
      feasIdx.forEach(o => { if (o.s.J < strategies[bestIdx].J) bestIdx = o.i; });
    } else {
      for (let i = 1; i < strategies.length; i++) {
        if (strategies[i].J < strategies[bestIdx].J) bestIdx = i;
      }
    }

    // Results table
    const tbody = document.getElementById("ctrl-tbody");
    tbody.innerHTML = "";

    strategies.forEach((s, idx) => {
      const tr = document.createElement("tr");
      if (idx === bestIdx) tr.className = "ctrl-best-row";

      const ctrl = s.controls || {};
      const rhoTxt = (s.rhoStar !== undefined && isFinite(s.rhoStar)) ? s.rhoStar.toFixed(3) : "n/a";
      const isFeasible = (s.feasible !== undefined) ? s.feasible : (!s.dCritExceeded && !s.kBelowMin);
      let statusHTML;
      if (!isFeasible) {
        statusHTML = '<span class="status-badge status-collapse_risk">infeasible (&rho;*=' + rhoTxt + ')</span>';
      } else if (s.dCritExceeded || s.kBelowMin) {
        const note = (s.dCritExceeded && s.kBelowMin) ? 'D&gt;D_crit, K&lt;K_min'
                   : (s.dCritExceeded ? 'D&gt;D_crit' : 'K&lt;K_min');
        statusHTML = '<span class="status-badge status-defoliation_warning">feasible* (&rho;*=' + rhoTxt + '; ' + note + ')</span>';
      } else {
        statusHTML = '<span class="status-badge status-healthy">feasible (&rho;*=' + rhoTxt + ')</span>';
      }

      tr.innerHTML =
        "<td>" + s.name + (idx === bestIdx ? " <strong>(best)</strong>" : "") + "</td>" +
        "<td>" + (ctrl.u_C || 0).toFixed(4) + "</td>" +
        "<td>" + (ctrl.u_P || 0).toFixed(4) + "</td>" +
        "<td>" + s.J.toFixed(2) + "</td>" +
        "<td>" + s.finalK.toFixed(4) + "</td>" +
        "<td>" + s.finalD.toFixed(4) + "</td>" +
        "<td>" + statusHTML + "</td>";
      tbody.appendChild(tr);
    });

    document.getElementById("ctrl-results").style.display = "";

    // Summary bar chart (grouped with cost breakdown)
    ChartManager.createControlSummaryChart("chart-ctrl-bar", strategies, bestIdx);
    document.getElementById("ctrl-chart-wrap").style.display = "";

    // Pareto scatter
    ChartManager.createParetoScatter("chart-pareto", strategies);
    document.getElementById("pareto-section").style.display = "";

    // Temporal allocation chart for the best strategy
    const bestStrategy = strategies[bestIdx];
    const bestControls = bestStrategy.controls || { u_P: 0, u_C: 0, u_B: 0 };
    const temporalData = comparator.temporalAllocation(bestControls, config);
    ChartManager.createTemporalAllocationChart("chart-temporal", temporalData);
    document.getElementById("temporal-section").style.display = "";

    // Trajectory comparison (2x2 subplots)
    ChartManager.createTrajectoryComparison("chart-trajectories", strategies);
    document.getElementById("trajectories-section").style.display = "";

    // Cost breakdown table
    const costTbody = document.getElementById("ctrl-cost-tbody");
    costTbody.innerHTML = "";
    strategies.forEach((s) => {
      const ctrl = s.controls || {};
      const nY = s.result ? s.result.A.length - 1 : config.nYears;
      const Tseason = (comparator.baseParams && comparator.baseParams.T) ? comparator.baseParams.T : 1;
      // Quadratic control cost (Eq 9), matching computeCostWithTrajectory:
      // u_P, u_C integrated over the season (x T x years); u_B annual (x years).
      const controlCost = 0.5 * comparator.C_P * Math.pow(ctrl.u_P || 0, 2) * Tseason * nY
                        + 0.5 * comparator.C_C * Math.pow(ctrl.u_C || 0, 2) * Tseason * nY
                        + 0.5 * comparator.C_B * Math.pow(ctrl.u_B || 0, 2) * nY;
      const runningCost = Math.max(0, s.J - controlCost);
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + s.name + "</td>" +
        "<td>" + (ctrl.u_P || 0).toFixed(4) + "</td>" +
        "<td>" + (ctrl.u_C || 0).toFixed(4) + "</td>" +
        "<td>" + (ctrl.u_B || 0).toFixed(4) + "</td>" +
        "<td>" + controlCost.toFixed(2) + "</td>" +
        "<td>" + runningCost.toFixed(2) + "</td>" +
        "<td>" + s.J.toFixed(2) + "</td>";
      costTbody.appendChild(tr);
    });
    document.getElementById("ctrl-cost-table-section").style.display = "";

    document.getElementById("btn-export-ctrl-csv").style.display = "";
    document.getElementById("btn-export-ctrl-json").style.display = "";
  },

  /* ── Generic file download helper ─────────────────────────────────── */

  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType + ";charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  },

  /* ── Equilibrium exports ────────────────────────────────────────── */

  lastEquilibria: null,

  exportEquilibriumCSV() {
    if (!this.lastEquilibria || this.lastEquilibria.length === 0) return;
    const meta = [
      '# AlderIPM-Sim Equilibrium Export',
      '# Version: ' + APP_VERSION,
      '# Timestamp: ' + new Date().toISOString(),
      '# Parameters: ' + JSON.stringify(this.readParams()),
      '#'
    ];
    const rows = ["index,A_star,F_star,K_star,D_star,stable,dominant_eigenvalue,R1,R2"];
    this.lastEquilibria.forEach((fp, i) => {
      rows.push((i + 1) + "," + fp.A + "," + fp.F + "," + fp.K + "," + fp.D + "," + fp.stable + "," + fp.dominantEig + "," + (isNaN(fp.R1) ? '' : fp.R1) + "," + (isNaN(fp.R2) ? '' : fp.R2));
    });
    this._downloadFile(meta.join('\n') + '\n' + rows.join("\n"), "alder-ipm-sim_equilibria.csv", "text/csv");
  },

  exportEquilibriumJSON() {
    if (!this.lastEquilibria || this.lastEquilibria.length === 0) return;
    const data = {
      metadata: { version: APP_VERSION, timestamp: new Date().toISOString(), parameters: this.readParams() },
      fixedPoints: this.lastEquilibria
    };
    this._downloadFile(JSON.stringify(data, null, 2), "alder-ipm-sim_equilibria.json", "application/json");
  },

  /* ── Early warnings exports ─────────────────────────────────────── */

  lastEWResult: null,

  exportWarningsCSV() {
    if (!this.lastEWResult) return;
    const r = this.lastEWResult;
    const meta = [
      '# AlderIPM-Sim Early Warnings Export',
      '# Version: ' + APP_VERSION,
      '# Timestamp: ' + new Date().toISOString(),
      '# Parameters: ' + JSON.stringify(this.readParams()),
      '#'
    ];
    const n = r.indicators.variance.length;
    const rows = ["index,variance,autocorrelation,spectral_index"];
    for (let i = 0; i < n; i++) {
      const spec = i < r.indicators.spectralIndex.length ? r.indicators.spectralIndex[i] : "";
      rows.push(i + "," + r.indicators.variance[i] + "," + r.indicators.autocorrelation[i] + "," + spec);
    }
    rows.push("");
    rows.push("indicator,kendall_tau,p_value,significant");
    rows.push("variance," + r.kendallResults.variance.tau + "," + r.kendallResults.variance.pValue + "," + r.kendallResults.variance.significant);
    rows.push("autocorrelation," + r.kendallResults.autocorrelation.tau + "," + r.kendallResults.autocorrelation.pValue + "," + r.kendallResults.autocorrelation.significant);
    rows.push("spectral_index," + r.kendallResults.spectralIndex.tau + "," + r.kendallResults.spectralIndex.pValue + "," + r.kendallResults.spectralIndex.significant);
    rows.push("");
    rows.push("alert_level," + r.alertLevel);
    this._downloadFile(meta.join('\n') + '\n' + rows.join("\n"), "alder-ipm-sim_warnings.csv", "text/csv");
  },

  exportWarningsJSON() {
    if (!this.lastEWResult) return;
    const data = {
      metadata: { version: APP_VERSION, timestamp: new Date().toISOString(), parameters: this.readParams() },
      results: this.lastEWResult
    };
    this._downloadFile(JSON.stringify(data, null, 2), "alder-ipm-sim_warnings.json", "application/json");
  },

  /* ── LHS-PRCC Sensitivity Analysis ─────────────────────────────── */

  runLHSPRCC() {
    const nSamples = parseInt(document.getElementById("lhs-n-samples").value) || 100;
    const nYears = parseInt(document.getElementById("lhs-n-years").value) || 50;
    const params = this.readParams();

    const progressDiv = document.getElementById("lhs-progress");
    const progressBar = document.getElementById("lhs-progress-bar");
    const progressText = document.getElementById("lhs-progress-text");
    progressDiv.style.display = "";
    progressBar.max = nSamples;
    progressBar.value = 0;
    progressText.textContent = "0 / " + nSamples;

    const btn = document.getElementById("btn-run-lhs");
    btn.disabled = true;
    btn.textContent = "Running...";

    const batchSize = 5;
    let currentBatch = 0;
    const paramNames = EarlyWarningDetector.LHS_PARAM_NAMES;
    const paramRanges = EarlyWarningDetector.lhsParamRanges();
    const samples = EarlyWarningDetector.latinHypercubeSample(nSamples, paramNames, paramRanges);
    const rhoStar = new Array(nSamples).fill(NaN);
    const eqClasses = new Array(nSamples).fill("unknown");

    const processBatch = () => {
      const end = Math.min(currentBatch + batchSize, nSamples);
      for (let i = currentBatch; i < end; i++) {
        try {
          const p = Object.assign({}, params);
          for (let j = 0; j < paramNames.length; j++) {
            p[paramNames[j]] = samples[i][j];
          }
          const model = new AlderIPMSimModel(p);
          const K0 = p.K_0;
          const sim = model.simulate(K0 * 0.5, K0 * 0.1, K0, 0.0, nYears, false);
          const nT = sim.A.length;
          const A_end = sim.A[nT - 1];
          const F_end = sim.F[nT - 1];
          const K_end = sim.K[nT - 1];
          const D_end = sim.D[nT - 1];

          const jac = model.computeJacobian(A_end, F_end, K_end, D_end);
          const eigMods = EarlyWarningDetector._eigenvalueModuli4x4(jac);
          rhoStar[i] = Math.max(...eigMods);

          const tol = 1e-6;
          if (A_end < tol) eqClasses[i] = "trivial";
          else if (F_end < tol && D_end < tol) eqClasses[i] = "canopy_only";
          else if (F_end < tol) eqClasses[i] = "parasitoid_free";
          else eqClasses[i] = "coexistence";
        } catch (e) {
          rhoStar[i] = NaN;
          eqClasses[i] = "unknown";
        }
      }

      currentBatch = end;
      progressBar.value = currentBatch;
      progressText.textContent = currentBatch + " / " + nSamples;

      if (currentBatch < nSamples) {
        setTimeout(processBatch, 0);
      } else {
        const validIdx = [];
        for (let i = 0; i < nSamples; i++) {
          if (isFinite(rhoStar[i])) validIdx.push(i);
        }

        let prccResults;
        if (validIdx.length < 10) {
          prccResults = paramNames.map(pn => ({ paramName: pn, prcc: 0, pValue: 1 }));
        } else {
          const validSamples = validIdx.map(i => samples[i]);
          const validRho = validIdx.map(i => rhoStar[i]);
          prccResults = EarlyWarningDetector.computePRCC(validSamples, validRho, paramNames);
        }

        const shifted = eqClasses.filter(c => c !== "coexistence").length;
        const regimeShiftProb = eqClasses.length > 0 ? shifted / eqClasses.length : 0;

        this._displayLHSResults(prccResults, regimeShiftProb, paramNames);

        btn.disabled = false;
        btn.textContent = "Run LHS-PRCC Analysis";
        progressDiv.style.display = "none";
      }
    };

    setTimeout(processBatch, 0);
  },

  _displayLHSResults(prccResults, regimeShiftProb) {
    // Regime shift probability
    document.getElementById("lhs-regime-box").style.display = "";
    document.getElementById("lhs-regime-prob").textContent =
      (regimeShiftProb * 100).toFixed(1) + "% of samples shifted away from coexistence";

    // PRCC table
    const tbody = document.getElementById("lhs-prcc-tbody");
    tbody.innerHTML = "";
    for (const r of prccResults) {
      const tr = document.createElement("tr");
      const sig = r.pValue < 0.05;
      tr.innerHTML =
        "<td>" + r.paramName + "</td>" +
        "<td>" + r.prcc.toFixed(4) + "</td>" +
        "<td>" + r.pValue.toFixed(4) + "</td>" +
        "<td style='color:" + (sig ? "var(--success)" : "var(--text-muted)") + "'>" + (sig ? "Yes" : "No") + "</td>";
      tbody.appendChild(tr);
    }
    document.getElementById("lhs-prcc-results").style.display = "";

    // PRCC horizontal bar chart (Plotly)
    document.getElementById("lhs-prcc-chart-container").style.display = "";
    ChartManager.createPRCCChart("chart-lhs-prcc", prccResults);
  },

  /* ── Control comparison exports ─────────────────────────────────── */

  lastControlResults: null,

  exportControlCSV() {
    if (!this.lastControlResults) return;
    const meta = [
      '# AlderIPM-Sim Control Comparison Export',
      '# Version: ' + APP_VERSION,
      '# Timestamp: ' + new Date().toISOString(),
      '# Parameters: ' + JSON.stringify(this.readParams()),
      '#'
    ];
    const rows = ["strategy,u_C,u_P,u_B,cost_J,final_K,final_D,peak_D,D_crit_exceeded,K_below_min"];
    for (const s of this.lastControlResults) {
      const ctrl = s.controls || {};
      rows.push(s.name + "," + (ctrl.u_C || 0) + "," + (ctrl.u_P || 0) + "," + (ctrl.u_B || 0) + "," + s.J + "," + s.finalK + "," + s.finalD + "," + s.peakD + "," + s.dCritExceeded + "," + s.kBelowMin);
    }
    this._downloadFile(meta.join('\n') + '\n' + rows.join("\n"), "alder-ipm-sim_control.csv", "text/csv");
  },

  exportControlJSON() {
    if (!this.lastControlResults) return;
    const data = {
      metadata: { version: APP_VERSION, timestamp: new Date().toISOString(), parameters: this.readParams() },
      strategies: this.lastControlResults.map(s => ({
        strategy: s.name, u_C: (s.controls || {}).u_C || 0, u_P: (s.controls || {}).u_P || 0, u_B: (s.controls || {}).u_B || 0, cost_J: s.J,
        final_K: s.finalK, final_D: s.finalD, peak_D: s.peakD,
        D_crit_exceeded: s.dCritExceeded, K_below_min: s.kBelowMin
      }))
    };
    this._downloadFile(JSON.stringify(data, null, 2), "alder-ipm-sim_control.json", "application/json");
  },

  /* ── About Tab — Glossary ────────────────────────────────────────── */

  buildGlossary() {
    const grid = document.getElementById("glossary-grid");
    if (!grid) return;

    for (const [key, meta] of Object.entries(PARAM_REGISTRY)) {
      const lbl = (typeof PARAM_LABELS !== 'undefined' && PARAM_LABELS[key]) ? PARAM_LABELS[key] : null;
      const item = document.createElement("div");
      item.className = "glossary-item";
      item.innerHTML =
        '<span class="glossary-symbol">' + meta.symbol + '</span>' +
        '<span class="glossary-desc">' +
          (lbl ? '<strong class="glossary-plain">' + lbl.short + '</strong> &mdash; ' : '') +
          meta.description +
          ' <span class="glossary-range">[' + meta.min + ' .. ' + meta.max + ' ' + meta.unit + ']</span>' +
          (lbl ? '<br><em class="glossary-hint">' + lbl.hint + '</em>' : '') +
        '</span>';
      grid.appendChild(item);
    }
  },

  /* ── Event Binding ───────────────────────────────────────────────── */

  bindEvents() {
    // Tab switching with keyboard support
    const tabs = document.querySelectorAll(".main-tab");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => this._switchTab(btn));
      btn.addEventListener("keydown", (e) => {
        const tabArr = Array.from(tabs);
        const idx = tabArr.indexOf(btn);
        let newIdx = -1;

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          newIdx = (idx + 1) % tabArr.length;
          e.preventDefault();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          newIdx = (idx - 1 + tabArr.length) % tabArr.length;
          e.preventDefault();
        } else if (e.key === 'Home') {
          newIdx = 0;
          e.preventDefault();
        } else if (e.key === 'End') {
          newIdx = tabArr.length - 1;
          e.preventDefault();
        }

        if (newIdx >= 0) {
          tabArr[newIdx].focus();
          this._switchTab(tabArr[newIdx]);
        }
      });
    });

    // Generate Report
    document.getElementById("btn-generate-report").addEventListener("click", () => this.generateReport());

    // Theme toggle
    document.getElementById("btn-theme-toggle").addEventListener("click", () => this.toggleTheme());

    // Tour
    document.getElementById("tour-next").addEventListener("click", () => this.nextTourStep());
    document.getElementById("tour-skip").addEventListener("click", () => this.closeTour());

    // Share config
    document.getElementById("btn-share-config").addEventListener("click", () => this.shareConfig());

    // Simulation
    document.getElementById("btn-run-sim").addEventListener("click", () => this.runSimulation());
    document.getElementById("btn-export-csv").addEventListener("click", () => this.exportCSV());
    document.getElementById("btn-export-json").addEventListener("click", () => this.exportJSON());
    document.getElementById("btn-import-csv").addEventListener("click", () => this.importCSV());
    document.getElementById("sim-csv-import").addEventListener("change", (e) => {
      this.handleCSVImport(e.target.files[0]);
    });

    // Within-season viewer
    document.getElementById("btn-ws-view").addEventListener("click", () => this.viewWithinSeason());

    // Equilibrium
    document.getElementById("btn-compute-eq").addEventListener("click", () => this.computeEquilibria());
    document.getElementById("btn-export-eq-csv").addEventListener("click", () => this.exportEquilibriumCSV());
    document.getElementById("btn-export-eq-json").addEventListener("click", () => this.exportEquilibriumJSON());

    // Bifurcation
    document.getElementById("btn-run-bif").addEventListener("click", () => this.runBifurcation());
    document.getElementById("btn-run-bif2d").addEventListener("click", () => this.runBifurcation2D());

    // Update range defaults when parameter selection changes
    document.getElementById("bif-param").addEventListener("change", () => {
      const key = document.getElementById("bif-param").value;
      const meta = PARAM_REGISTRY[key];
      if (meta) {
        document.getElementById("bif-lo").value = meta.min;
        document.getElementById("bif-hi").value = meta.max;
      }
    });

    // Early Warnings
    document.getElementById("btn-run-ew").addEventListener("click", () => this.runEarlyWarnings());
    document.getElementById("btn-export-ew-csv").addEventListener("click", () => this.exportWarningsCSV());
    document.getElementById("btn-export-ew-json").addEventListener("click", () => this.exportWarningsJSON());

    // Toggle CSV upload controls
    document.querySelectorAll('input[name="ew-source"]').forEach(radio => {
      radio.addEventListener("change", () => {
        const isCSV = document.querySelector('input[name="ew-source"]:checked').value === "csv";
        document.getElementById("btn-ew-upload").style.display = isCSV ? "" : "none";
        document.getElementById("ew-csv-filename").style.display = isCSV ? "" : "none";

        if (isCSV && this.ewCSVData) {
          this._updateEWColumnSelect(this.ewCSVData.headers);
        } else {
          this._resetEWColumnSelect();
        }
      });
    });

    document.getElementById("btn-ew-upload").addEventListener("click", () => {
      document.getElementById("ew-csv-file").click();
    });

    document.getElementById("ew-csv-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById("ew-csv-filename").textContent = file.name;
      document.getElementById("ew-csv-filename").style.display = "";

      const reader = new FileReader();
      reader.onload = (evt) => {
        this.ewCSVData = EarlyWarningDetector.parseCSV(evt.target.result);
        if (this.ewCSVData) {
          this._updateEWColumnSelect(this.ewCSVData.headers);

          // Show data preview table
          const previewDiv = document.getElementById("ew-data-preview");
          previewDiv.innerHTML = EarlyWarningDetector.generatePreviewHTML(this.ewCSVData, 5);
          previewDiv.style.display = "";

          // Show data quality indicators
          const qualityDiv = document.getElementById("ew-data-quality");
          const timeCol = this.ewCSVData.headers.find(h =>
            /^(time|year|t|date|day)$/i.test(h.trim())
          ) || this.ewCSVData.headers[0];
          const report = EarlyWarningDetector.dataQualityReport(this.ewCSVData.columns, timeCol);
          const qualityColors = { good: "#2d6a4f", fair: "#e9c46a", poor: "#e63946" };
          const qualityLabels = { good: "Good", fair: "Fair", poor: "Poor" };
          let qualityHTML = '<strong>Data Quality: </strong>';
          qualityHTML += '<span style="color:' + qualityColors[report.qualityLevel] + '; font-weight:600;">' + qualityLabels[report.qualityLevel] + '</span>';
          qualityHTML += ' &mdash; ' + report.length + ' data points, ';
          qualityHTML += (report.completeness * 100).toFixed(1) + '% complete';
          if (report.gaps.length > 0) {
            qualityHTML += ', ' + report.gaps.length + ' gap(s) detected';
          }
          if (report.hasZeros) {
            qualityHTML += ', contains zeros';
          }
          qualityDiv.innerHTML = qualityHTML;
          qualityDiv.style.display = "";
        } else {
          document.getElementById("ew-data-preview").style.display = "none";
          document.getElementById("ew-data-quality").style.display = "none";
        }
      };
      reader.readAsText(file);
    });

    // LHS-PRCC
    document.getElementById("btn-run-lhs").addEventListener("click", () => this.runLHSPRCC());

    // Control Comparison
    document.getElementById("btn-run-ctrl").addEventListener("click", () => this.runControlComparison());
    document.getElementById("btn-export-ctrl-csv").addEventListener("click", () => this.exportControlCSV());
    document.getElementById("btn-export-ctrl-json").addEventListener("click", () => this.exportControlJSON());

    // Weight slider displays
    ["w1", "w2", "w3", "w4", "cC", "cP"].forEach(id => {
      const slider = document.getElementById("ctrl-" + id);
      const display = document.getElementById("ctrl-" + id + "-val");
      if (slider && display) {
        slider.addEventListener("input", () => {
          display.textContent = slider.value;
        });
      }
    });

    // Custom strategy checkbox: enable/disable sliders
    const customCheckbox = document.getElementById("ctrl-custom-enable");
    const customSliders = ["ctrl-custom-uP", "ctrl-custom-uC", "ctrl-custom-uB"];
    if (customCheckbox) {
      customCheckbox.addEventListener("change", () => {
        const enabled = customCheckbox.checked;
        customSliders.forEach(id => {
          const slider = document.getElementById(id);
          if (slider) slider.disabled = !enabled;
        });
      });
    }

    // Custom strategy slider displays
    customSliders.forEach(id => {
      const slider = document.getElementById(id);
      const display = document.getElementById(id + "-val");
      if (slider && display) {
        slider.addEventListener("input", () => {
          display.textContent = parseFloat(slider.value).toFixed(2);
        });
      }
    });

    // Scenario comparison
    document.getElementById("btn-save-scenario").addEventListener("click", () => this.saveScenario());
    document.getElementById("btn-clear-scenarios").addEventListener("click", () => this.clearScenarios());
    document.getElementById("btn-run-compare").addEventListener("click", () => this.runScenarioComparison());
    document.getElementById("btn-run-sw1").addEventListener("click", () => this.runSweep1D());
  },

  /* ── Report Generation ───────────────────────────────────────────── */

  generateReport() {
    const params = this.readParams();
    const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const today = new Date().toISOString().slice(0, 10);

    // Determine scenario name from preset selector
    const presetSel = document.getElementById("preset-select");
    const scenarioName = presetSel ? (presetSel.value || "Custom") : "Custom";

    // Section 1: Parameters
    let paramRows = "";
    const defaults = getDefaults();
    for (const key of Object.keys(params).sort()) {
      const meta = PARAM_REGISTRY[key];
      if (!meta) continue;
      const val = params[key];
      const changed = Math.abs(val - defaults[key]) > 1e-12;
      const cls = changed ? ' class="changed"' : "";
      const desc = meta.description.length > 80 ? meta.description.slice(0, 77) + "..." : meta.description;
      paramRows += `<tr${cls}><td>${esc(meta.symbol)}</td><td>${esc(key)}</td><td>${val.toPrecision(6)}</td><td>[${meta.min}, ${meta.max}]</td><td>${esc(meta.unit)}</td><td>${esc(desc)}</td></tr>`;
    }
    const secParams = `<h2>1. Parameter Summary</h2><table><thead><tr><th>Symbol</th><th>Name</th><th>Value</th><th>Range</th><th>Unit</th><th>Description</th></tr></thead><tbody>${paramRows}</tbody></table><p class="note">Rows highlighted indicate values changed from defaults.</p>`;

    // Section 2: Simulation
    let secSim = "<h2>2. Simulation Trajectories</h2>";
    const sim = this.runner.lastResult;
    if (sim && sim.A) {
      const n = sim.A.length;
      const labels = [
        {key:"A", label:"Beetle Larvae (A)", color:"#E69F00"},
        {key:"F", label:"Parasitoid Flies (F)", color:"#56B4E9"},
        {key:"K", label:"Canopy Capacity (K)", color:"#009E73"},
        {key:"D", label:"Cumulative Defoliation (D)", color:"#D55E00"}
      ];
      secSim += '<div class="chart-grid">';
      for (const {key, label, color} of labels) {
        secSim += this._svgTimeseries(sim[key], label, color);
      }
      secSim += "</div>";
      secSim += `<h3>End State (Year ${n - 1})</h3><table><thead><tr><th>Variable</th><th>Value</th></tr></thead><tbody>`;
      for (const key of ["A","F","K","D"]) {
        secSim += `<tr><td>${key}</td><td>${sim[key][n-1].toFixed(6)}</td></tr>`;
      }
      secSim += "</tbody></table>";
    } else {
      secSim += "<p>No simulation data available.</p>";
    }

    // Section 3: Equilibrium
    let secEq = "<h2>3. Equilibrium Analysis</h2>";
    try {
      const rp = this.runner.model.computeRP();
      const status = rp > 1 ? "Coexistence possible" : "Parasitoid cannot persist";
      const col = rp > 1 ? "#009E73" : "#D55E00";
      secEq += `<p><strong>R<sub>P</sub> = ${rp.toFixed(6)}</strong> &mdash; <span style="color:${col}">${status}</span></p>`;
    } catch(e) {}

    if (this.lastEquilibria && this.lastEquilibria.length > 0) {
      secEq += '<table><thead><tr><th>Class</th><th>Stable</th><th>A*</th><th>F*</th><th>K*</th><th>D*</th><th>|&lambda;<sub>dom</sub>|</th><th>R1</th><th>R2</th></tr></thead><tbody>';
      for (const fp of this.lastEquilibria) {
        const cls = fp.stable ? "stable" : "unstable";
        const r1 = isNaN(fp.R1) ? "N/A" : fp.R1.toFixed(4);
        const r2 = isNaN(fp.R2) ? "N/A" : fp.R2.toFixed(4);
        secEq += `<tr class="${cls}"><td>${esc(fp.eqClass||"")}</td><td>${fp.stable?"Yes":"No"}</td><td>${fp.A.toFixed(4)}</td><td>${fp.F.toFixed(4)}</td><td>${fp.K.toFixed(4)}</td><td>${fp.D.toFixed(4)}</td><td>${fp.dominantEig.toFixed(4)}</td><td>${r1}</td><td>${r2}</td></tr>`;
      }
      secEq += "</tbody></table>";
    } else {
      secEq += "<p>No fixed points computed. Run the Equilibrium tab first.</p>";
    }

    // Section 4: EWS (from DOM if available)
    let secEWS = "<h2>4. Early Warning Signals</h2>";
    const ewAlert = document.querySelector("#tab-warnings .ew-alert-box");
    if (ewAlert) {
      secEWS += ewAlert.outerHTML;
      const ewTable = document.querySelector("#tab-warnings .ew-results-table");
      if (ewTable) secEWS += ewTable.outerHTML;
    } else {
      secEWS += "<p>No EWS data available. Run the Early Warnings tab first.</p>";
    }

    // Section 5: Management
    let secMgmt = "<h2>5. Management Recommendation</h2>";
    if (this.lastControlResults && this.lastControlResults.length > 0) {
      const lc = this.lastControlResults;
      const feas = lc.map((s, i) => ({ s, i }))
        .filter(o => (o.s.feasible !== undefined ? o.s.feasible : (!o.s.dCritExceeded && !o.s.kBelowMin)));
      let bestIdx = 0;
      if (feas.length > 0) {
        bestIdx = feas[0].i;
        feas.forEach(o => { if (o.s.J < lc[bestIdx].J) bestIdx = o.i; });
      } else {
        for (let i = 1; i < lc.length; i++) { if (lc[i].J < lc[bestIdx].J) bestIdx = i; }
      }
      const best = this.lastControlResults[bestIdx];
      secMgmt += `<div class="recommendation"><strong>Recommended:</strong> ${esc(best.name)} (cost J = ${best.J.toFixed(4)})</div>`;

      secMgmt += '<table><thead><tr><th>Scenario</th><th>Cost (J)</th><th>u<sub>P</sub></th><th>u<sub>C</sub></th><th>u<sub>B</sub></th><th>D*</th><th>K*</th><th>&rho;*</th><th>Status</th></tr></thead><tbody>';
      for (const s of this.lastControlResults) {
        const ctrl = s.controls || {};
        const feasible = (s.feasible !== undefined) ? s.feasible : (!s.dCritExceeded && !s.kBelowMin);
        const rhoTxt = (s.rhoStar !== undefined && isFinite(s.rhoStar)) ? s.rhoStar.toFixed(4) : "n/a";
        const cls = feasible ? "stable" : "unstable";
        secMgmt += `<tr class="${cls}"><td>${esc(s.name)}</td><td>${s.J.toFixed(4)}</td><td>${(ctrl.u_P||0).toFixed(4)}</td><td>${(ctrl.u_C||0).toFixed(4)}</td><td>${(ctrl.u_B||0).toFixed(4)}</td><td>${(s.finalD||0).toFixed(4)}</td><td>${(s.finalK||0).toFixed(4)}</td><td>${rhoTxt}</td><td>${feasible?"Feasible":"Infeasible"}</td></tr>`;
      }
      secMgmt += "</tbody></table>";
    } else {
      secMgmt += "<p>No control analysis available. Run the Control Comparison tab first.</p>";
    }

    // Section 6: Appendix
    let appendixRows = "";
    for (const key of Object.keys(PARAM_REGISTRY).sort()) {
      const m = PARAM_REGISTRY[key];
      appendixRows += `<tr><td>${esc(m.symbol)}</td><td>${esc(key)}</td><td>[${m.min}, ${m.max}]</td><td>${esc(m.unit)}</td><td>${esc(m.description)}</td></tr>`;
    }
    const secAppendix = `<h2>6. Technical Appendix</h2><h3>Model Equations</h3><p><strong>Within-season ODE system (Eqs. 1&ndash;4):</strong></p><pre>dS/d&tau; = -(&beta; S F)/(1 + h S) - (c_B B_t S)/(1 + a_B (S+I)) - (&mu;_S + u_C) S\ndI/d&tau; =  (&beta; S F)/(1 + h S) - (c_B B_t I)/(1 + a_B (S+I)) - (&mu;_I + &delta; + u_C) I\ndF/d&tau; =  &eta; &delta; I - &mu;_F F + u_P\ndD/d&tau; =  &kappa; (S + I)</pre><p><strong>Annual map (Eqs. 5&ndash;8):</strong></p><pre>S(0)   = R_B A_t / (1 + A_t/K_t)   [Eq 5, Beverton&ndash;Holt; I(0)=0, F(0)=F_t]\nA(t+1) = &sigma;_A S(T)      F(t+1) = &sigma;_F F(T)   [Eq 6]\nB_t    = B_index (1 + &xi; u_B)   [Eq 7]\nK(t+1) = K_0 exp(-&phi; D_t)   [Eq 8]\n&rho;* = spectral radius of the annual-map Jacobian (stability)</pre><h3>Full Parameter Reference</h3><table><thead><tr><th>Symbol</th><th>Name</th><th>Range</th><th>Unit</th><th>Description</th></tr></thead><tbody>${appendixRows}</tbody></table>`;

    const body = secParams + secSim + secEq + secEWS + secMgmt + secAppendix;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>AlderIPM-Sim Analysis Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; color: #1a1a1a; line-height: 1.6; font-size: 14px; }
  h1 { color: #2d6a4f; border-bottom: 3px solid #2d6a4f; padding-bottom: 8px; }
  h2 { color: #40916c; margin-top: 2em; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { color: #52b788; }
  .header-meta { color: #666; margin-bottom: 1em; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  thead { background: #2d6a4f; color: #fff; }
  tr:nth-child(even) { background: #f8f8f8; }
  tr.changed { background: #fff3cd; }
  tr.stable td:first-child { border-left: 4px solid #009E73; }
  tr.unstable td:first-child { border-left: 4px solid #D55E00; }
  .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0; }
  .chart-cell { padding: 8px; }
  .chart-cell h4 { margin: 0 0 4px; font-size: 13px; color: #444; }
  .recommendation { background: #d4edda; border: 1px solid #c3e6cb; padding: 12px; border-radius: 4px; margin: 12px 0; }
  .alert-box { background: #f8f9fa; border-radius: 4px; }
  .note { font-size: 12px; color: #888; font-style: italic; }
  pre { background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 13px; }
  @media print { body { font-size: 11pt; } h1 { font-size: 18pt; } table { font-size: 9pt; } }
</style>
</head>
<body>
<h1>AlderIPM-Sim Analysis Report</h1>
<div class="header-meta"><strong>Date:</strong> ${today} &nbsp;|&nbsp; <strong>Scenario:</strong> ${esc(scenarioName)}</div>
${body}
<hr/><p class="note">Generated by AlderIPM-Sim &mdash; Decision-support toolkit for the Alnus-beetle-parasitoid-bird ecoepidemic system.</p>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    } else {
      // Fallback: download as file
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "alder-ipm-sim_report.html";
      a.click();
      URL.revokeObjectURL(url);
    }
  },

  _svgTimeseries(arr, title, color, width = 400, height = 150) {
    const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    if (!arr || arr.length === 0) return `<div class="chart-cell"><h4>${esc(title)}</h4><p>No data</p></div>`;
    const pad = 40, pw = width - 2*pad, ph = height - 2*pad;
    const yMin = Math.min(...arr), yMax = Math.max(...arr);
    const yRange = yMax > yMin ? yMax - yMin : 1;
    const xMax = arr.length - 1 || 1;
    const pts = arr.map((y, i) => {
      const px = pad + (i / xMax) * pw;
      const py = pad + ph - ((y - yMin) / yRange) * ph;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(" ");
    return `<div class="chart-cell"><h4>${esc(title)}</h4><svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${width}px;background:#fafafa;border:1px solid #ddd;"><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${pad+ph}" stroke="#999" stroke-width="1"/><line x1="${pad}" y1="${pad+ph}" x2="${pad+pw}" y2="${pad+ph}" stroke="#999" stroke-width="1"/><text x="${pad-4}" y="${pad+4}" text-anchor="end" font-size="9" fill="#666">${yMax.toPrecision(3)}</text><text x="${pad-4}" y="${pad+ph}" text-anchor="end" font-size="9" fill="#666">${yMin.toPrecision(3)}</text><text x="${pad}" y="${pad+ph+14}" text-anchor="start" font-size="9" fill="#666">0</text><text x="${pad+pw}" y="${pad+ph+14}" text-anchor="end" font-size="9" fill="#666">${xMax}</text><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/></svg></div>`;
  },

  _switchTab(btn) {
    document.querySelectorAll(".main-tab").forEach(b => {
      b.classList.remove("active");
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('tabindex', '-1');
    });
    document.querySelectorAll(".tab-content").forEach(p => p.classList.remove("active"));

    btn.classList.add("active");
    btn.setAttribute('aria-selected', 'true');
    btn.setAttribute('tabindex', '0');
    document.getElementById(btn.dataset.tab).classList.add("active");

    // Resize Plotly charts in the newly visible tab
    setTimeout(() => {
      const activeTab = document.getElementById(btn.dataset.tab);
      if (activeTab) {
        activeTab.querySelectorAll('.plotly-chart').forEach(el => {
          if (el.data) {
            Plotly.Plots.resize(el);
          }
        });
      }
    }, 50);
  },

  _updateEWColumnSelect(headers) {
    const select = document.getElementById("ew-column");
    select.innerHTML = "";
    for (const h of headers) {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      select.appendChild(opt);
    }
  },

  initComparisonTab() {
    // Populate the 1D sweep parameter dropdown
    const select = document.getElementById("sc-sw1-param");
    if (!select) return;
    const defaults = getDefaults();
    const skip = new Set(["u_C", "u_P", "u_B", "u_C_max", "u_P_max", "u_B_max"]);
    for (const key of Object.keys(defaults).sort()) {
      if (skip.has(key)) continue;
      const opt = document.createElement("option");
      opt.value = key;
      const meta = PARAM_REGISTRY[key];
      opt.textContent = meta ? `${meta.symbol} (${key})` : key;
      select.appendChild(opt);
    }
    // Set default range from first param
    this._updateSweepRange();
    select.addEventListener("change", () => this._updateSweepRange());
    // Load saved scenarios from localStorage
    try {
      const stored = localStorage.getItem("alderipmsim-scenarios");
      if (stored) {
        this.savedScenarios = JSON.parse(stored);
        this._updateSavedList();
      }
    } catch(e) {}
  },

  _updateSweepRange() {
    const key = document.getElementById("sc-sw1-param").value;
    const meta = PARAM_REGISTRY[key];
    if (meta) {
      document.getElementById("sc-sw1-lo").value = meta.min;
      document.getElementById("sc-sw1-hi").value = meta.max;
    }
  },

  saveScenario() {
    const name = document.getElementById("sc-name").value.trim() || ("Scenario " + (Object.keys(this.savedScenarios).length + 1));
    this.savedScenarios[name] = this.readParams();
    try { localStorage.setItem("alderipmsim-scenarios", JSON.stringify(this.savedScenarios)); } catch(e) {}
    this._updateSavedList();
  },

  clearScenarios() {
    this.savedScenarios = {};
    try { localStorage.removeItem("alderipmsim-scenarios"); } catch(e) {}
    this._updateSavedList();
    // Clear charts
    ["sc-cmp-ts-A","sc-cmp-ts-F","sc-cmp-ts-K","sc-cmp-ts-D","sc-cmp-table","sc-cmp-radar","sc-sw1-plot"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  },

  _updateSavedList() {
    const el = document.getElementById("sc-saved-list");
    const names = Object.keys(this.savedScenarios);
    if (names.length === 0) {
      el.innerHTML = "<em>No scenarios saved.</em>";
    } else {
      el.innerHTML = "<strong>Saved:</strong> " + names.join(", ");
    }
    // Update checkboxes for comparison selection
    const container = document.getElementById("sc-select-container");
    if (names.length < 2) {
      container.innerHTML = "<em>Save at least 2 scenarios to compare.</em>";
      return;
    }
    let html = "<strong>Select scenarios (up to 4):</strong><br>";
    names.forEach((n, i) => {
      const checked = i < 4 ? "checked" : "";
      html += `<label style="margin-right:12px;"><input type="checkbox" class="sc-check" value="${n}" ${checked} /> ${n}</label>`;
    });
    container.innerHTML = html;
  },

  runScenarioComparison() {
    const checks = document.querySelectorAll(".sc-check:checked");
    const selected = Array.from(checks).map(cb => cb.value).slice(0, 4);
    if (selected.length < 2) { alert("Select at least 2 scenarios."); return; }

    const nYears = parseInt(document.getElementById("sc-cmp-years").value) || 50;
    const A0 = parseFloat(document.getElementById("sc-cmp-a0").value) || 0.8;
    const colors = ["#E69F00", "#56B4E9", "#009E73", "#CC79A7"];
    const dashes = ["solid", "dash", "dot", "dashdot"];

    const results = [];
    for (const name of selected) {
      const p = this.savedScenarios[name];
      const model = new AlderIPMSimModel(p);
      const sim = model.simulate(A0, 0.1, p.K_0 || 1.712, 0, nYears);
      const rp = model.computeRP();
      let r1 = 0, r2 = 0;
      try { r1 = model.computeR1(sim.A[nYears], sim.F[nYears], sim.K[nYears], sim.D[nYears]); } catch(e) {}
      try { r2 = model.computeR2(sim.A[nYears], sim.F[nYears], sim.K[nYears], sim.D[nYears]); } catch(e) {}
      results.push({ name, sim, rp, r1, r2, D_star: sim.D[nYears], K_star: sim.K[nYears] });
    }

    // Time series overlays
    const years = Array.from({length: nYears + 1}, (_, i) => i);
    const varMap = {A: "Beetle Density A", F: "Parasitoid Density F", K: "Carrying Capacity K", D: "Defoliation D"};
    for (const [v, label] of Object.entries(varMap)) {
      const traces = results.map((r, i) => ({
        x: years, y: r.sim[v], mode: "lines", name: r.name,
        line: { color: colors[i], dash: dashes[i], width: 2 }
      }));
      const layout = ChartManager._baseLayout();
      layout.title = label;
      layout.xaxis = { title: "Year" };
      layout.yaxis = { title: label };
      layout.legend = { orientation: "h", yanchor: "bottom", y: 1.02 };
      layout.height = 300;
      Plotly.newPlot("sc-cmp-ts-" + v, traces, layout, ChartManager._baseConfig());
    }

    // Comparison table
    let tableHTML = '<table style="width:100%; border-collapse:collapse; margin:12px 0;">';
    tableHTML += '<tr style="background:var(--card-bg); border-bottom:2px solid var(--border);">';
    tableHTML += '<th style="padding:8px;">Scenario</th><th>R_P</th><th>R1</th><th>R2</th><th>D*</th><th>K*</th></tr>';
    results.forEach(r => {
      tableHTML += `<tr style="border-bottom:1px solid var(--border);">`;
      tableHTML += `<td style="padding:6px;">${r.name}</td>`;
      tableHTML += `<td>${r.rp.toFixed(4)}</td>`;
      tableHTML += `<td>${r.r1.toFixed(4)}</td>`;
      tableHTML += `<td>${r.r2.toFixed(4)}</td>`;
      tableHTML += `<td>${r.D_star.toFixed(4)}</td>`;
      tableHTML += `<td>${r.K_star.toFixed(4)}</td></tr>`;
    });
    tableHTML += '</table>';
    document.getElementById("sc-cmp-table").innerHTML = tableHTML;

    // Radar chart
    const cats = ["R_P", "R1", "R2", "K*", "1-D*"];
    const radarTraces = results.map((r, i) => ({
      type: "scatterpolar", fill: "toself",
      r: [Math.min(r.rp, 3), Math.max(r.r1, 0), Math.max(r.r2, 0), Math.min(r.K_star, 3), Math.max(1 - r.D_star, 0), Math.min(r.rp, 3)],
      theta: [...cats, cats[0]],
      name: r.name,
      line: { color: colors[i] },
      opacity: 0.6
    }));
    const radarLayout = ChartManager._baseLayout();
    radarLayout.polar = { radialaxis: { visible: true, range: [0, 3] } };
    radarLayout.title = "Scenario Comparison Radar";
    radarLayout.height = 450;
    Plotly.newPlot("sc-cmp-radar", radarTraces, radarLayout, ChartManager._baseConfig());
  },

  runSweep1D() {
    const paramName = document.getElementById("sc-sw1-param").value;
    const lo = parseFloat(document.getElementById("sc-sw1-lo").value);
    const hi = parseFloat(document.getElementById("sc-sw1-hi").value);
    const n = parseInt(document.getElementById("sc-sw1-n").value) || 25;
    if (lo >= hi) { alert("Min must be less than Max."); return; }

    const baseParams = this.readParams();
    const values = [];
    for (let i = 0; i < n; i++) values.push(lo + (hi - lo) * i / (n - 1));

    const D_arr = [], K_arr = [], RP_arr = [];
    for (const val of values) {
      const p = Object.assign({}, baseParams);
      p[paramName] = val;
      const model = new AlderIPMSimModel(p);
      try {
        const sim = model.simulate(0.8, 0.1, p.K_0 || 1.712, 0, 50);
        const last = sim.D.length - 1;
        D_arr.push(sim.D[last]);
        K_arr.push(sim.K[last]);
      } catch(e) {
        D_arr.push(null);
        K_arr.push(null);
      }
      try { RP_arr.push(model.computeRP()); } catch(e) { RP_arr.push(null); }
    }

    const meta = PARAM_REGISTRY[paramName];
    const sym = meta ? meta.symbol : paramName;

    const traces = [
      { x: values, y: D_arr, mode: "lines+markers", name: "D*", marker: {size: 4}, line: {color: "#CC79A7"}, xaxis: "x", yaxis: "y" },
      { x: values, y: K_arr, mode: "lines+markers", name: "K*", marker: {size: 4}, line: {color: "#009E73"}, xaxis: "x", yaxis: "y2" },
      { x: values, y: RP_arr, mode: "lines+markers", name: "R_P", marker: {size: 4}, line: {color: "#E69F00"}, xaxis: "x", yaxis: "y3" },
    ];

    const layout = ChartManager._baseLayout();
    layout.title = "1-D Sweep: " + sym;
    layout.height = 600;
    layout.grid = { rows: 3, columns: 1, pattern: "independent", roworder: "top to bottom" };
    layout.xaxis = { title: sym, anchor: "y" };
    layout.yaxis = { title: "D*", domain: [0.7, 1] };
    layout.xaxis2 = { title: sym, anchor: "y2" };
    layout.yaxis2 = { title: "K*", domain: [0.37, 0.63] };
    layout.xaxis3 = { title: sym, anchor: "y3" };
    layout.yaxis3 = { title: "R_P", domain: [0, 0.27] };
    layout.shapes = [{
      type: "line", xref: "x3", yref: "y3",
      x0: lo, x1: hi, y0: 1, y1: 1,
      line: { dash: "dash", color: "red", width: 1 }
    }];

    Plotly.newPlot("sc-sw1-plot", traces, layout, ChartManager._baseConfig());
  },

  _resetEWColumnSelect() {
    const select = document.getElementById("ew-column");
    select.innerHTML =
      '<option value="A">A (Beetles)</option>' +
      '<option value="F">F (Parasitoids)</option>' +
      '<option value="K">K (Carrying Capacity)</option>' +
      '<option value="D">D (Defoliation)</option>';
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
