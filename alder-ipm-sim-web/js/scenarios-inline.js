/**
 * AlderIPM-Sim - scenarios-inline.js
 *
 * Brings scenario management into the Parameters tab itself so the user
 * never has to navigate to a separate tab. Three columns of controls in
 * the `.scenarios-bar` bar above the sliders:
 *
 *   1. Preset scenario dropdown (existing) - loads a literature-defined
 *      preset; dispatches the same change event app.js already listens to.
 *   2. My scenarios - saved custom parameter sets keyed by user-chosen
 *      names. Persisted in localStorage. Load / Delete controls.
 *   3. Save-current-as - name input + Save button capturing the current
 *      slider state as a new saved scenario.
 *   4. Compare scenarios - renders an inline table + 4-panel Plotly chart
 *      (A, F, K, D over 50 years) for every saved scenario plus the
 *      current live parameters, in-place on the Parameters tab. No tab
 *      switch required.
 */

(function () {
  'use strict';

  const LS_KEY = 'alderipmsim-custom-scenarios';
  // Bumped when the seed set changes; guarantees we seed only once per version
  // and never overwrite scenarios the user has created or edited.
  const SEED_FLAG = 'alderipmsim-scenarios-seeded-v1';

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveAll(map) { localStorage.setItem(LS_KEY, JSON.stringify(map)); }

  // Pre-load a small set of editable, saveable default scenarios on first run.
  // Each is a complete, self-contained parameter set (calibrated baseline plus
  // the phenological shift named in the title), so the "My scenarios" list is
  // populated out of the box. The user can load any of these, adjust the
  // sliders, and re-save. We never touch an existing store, and the flag stops
  // re-seeding after a user deletes them intentionally.
  function seedDefaultsIfEmpty() {
    try {
      if (localStorage.getItem(SEED_FLAG)) return;
      const saved = loadSaved();
      if (Object.keys(saved).length === 0 && typeof getDefaults === 'function') {
        const base = getDefaults();
        const now = new Date().toISOString();
        const mk = (o) => ({ created: now, seeded: true, params: Object.assign({}, base, o) });
        saveAll({
          '1. Baseline (calibrated)':            mk({}),
          '2. Warming climate (long season)':    mk({ T: 65, sigma_A: 0.85, sigma_F: 0.52 }),
          '3. Mild winter (high survival)':      mk({ sigma_A: 0.88, sigma_F: 0.60 }),
          '4. High passerine bird pressure':     mk({ B_index: 1.9, c_B: 0.028 }),
          '5. Weak biocontrol (low parasitism)': mk({ beta: 0.008, eta: 0.55, delta: 0.10 })
        });
      }
      localStorage.setItem(SEED_FLAG, '1');
    } catch (e) { /* localStorage unavailable — non-fatal */ }
  }

  function refreshSelect() {
    const sel = document.getElementById('my-scenario-select');
    if (!sel) return;
    const saved = loadSaved();
    const keys = Object.keys(saved).sort();
    sel.innerHTML = '<option value="">(none)</option>' +
      keys.map(k => `<option value="${k}">${k}</option>`).join('');
  }

  function readCurrentParams() {
    if (window.App && typeof App.readParams === 'function') return App.readParams();
    // Fallback: iterate over registry sliders.
    const p = {};
    if (typeof PARAM_REGISTRY !== 'undefined') {
      Object.keys(PARAM_REGISTRY).forEach(k => {
        const s = document.getElementById('slider-' + k);
        if (s) p[k] = parseFloat(s.value);
        else   p[k] = PARAM_REGISTRY[k].default;
      });
    }
    return p;
  }

  function applyParams(params) {
    if (!params) return;
    Object.keys(params).forEach(k => {
      const s = document.getElementById('slider-' + k);
      if (!s) return;
      const v = params[k];
      if (Number.isFinite(v)) {
        s.value = Math.max(parseFloat(s.min), Math.min(parseFloat(s.max), v));
        s.dispatchEvent(new Event('input'));
      }
    });
  }

  // ─────────────────────────────── Save / Load / Delete ──
  function wire() {
    seedDefaultsIfEmpty();
    refreshSelect();

    const btnSave = document.getElementById('btn-scenario-save');
    const btnLoad = document.getElementById('btn-scenario-load');
    const btnDel  = document.getElementById('btn-scenario-delete');
    const btnCmp  = document.getElementById('btn-scenario-compare-inline');

    if (btnSave) btnSave.addEventListener('click', function () {
      const raw = (document.getElementById('my-scenario-name').value || '').trim();
      if (!raw) { alert('Type a short name for this scenario first.'); return; }
      const name = raw.replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 40);
      const saved = loadSaved();
      saved[name] = { created: new Date().toISOString(), params: readCurrentParams() };
      saveAll(saved);
      document.getElementById('my-scenario-name').value = '';
      refreshSelect();
      const sel = document.getElementById('my-scenario-select');
      if (sel) sel.value = name;
      toast('Saved scenario: ' + name);
    });

    if (btnLoad) btnLoad.addEventListener('click', function () {
      const sel = document.getElementById('my-scenario-select');
      const key = sel && sel.value;
      if (!key) { alert('Select a saved scenario from the dropdown first.'); return; }
      const saved = loadSaved();
      if (!saved[key]) return;
      applyParams(saved[key].params);
      toast('Loaded scenario: ' + key);
    });

    if (btnDel) btnDel.addEventListener('click', function () {
      const sel = document.getElementById('my-scenario-select');
      const key = sel && sel.value;
      if (!key) { alert('Select a saved scenario from the dropdown first.'); return; }
      if (!confirm('Delete saved scenario "' + key + '"?')) return;
      const saved = loadSaved();
      delete saved[key];
      saveAll(saved);
      refreshSelect();
    });

    if (btnCmp) btnCmp.addEventListener('click', compareInline);
  }

  // ─────────────────────────────── Inline compare ──
  function compareInline() {
    const panel = document.getElementById('inline-compare-panel');
    if (!panel) return;
    const saved = loadSaved();
    // Build the list: saved + current-live.
    const scenarios = Object.keys(saved).map(k => ({ name: k, params: saved[k].params }));
    scenarios.unshift({ name: '(Current live)', params: readCurrentParams() });
    if (scenarios.length < 2) {
      panel.style.display = 'block';
      panel.innerHTML = '<p>Save at least one scenario first, then click <em>Compare scenarios</em> to see them side by side.</p>';
      return;
    }

    // Run each scenario and collect trajectories.
    const results = scenarios.map(s => {
      const model = new AlderIPMSimModel(Object.assign({}, s.params));
      model.u_C = 0; model.u_P = 0;
      const p = s.params;
      const sim = model.simulate(1.0, 0.5, p.K_0 || 1.712, 0.0, 50, false);
      return { name: s.name, sim };
    });

    // Compact table summary.
    const rows = results.map(r => {
      const last = r.sim.A.length - 1;
      const peakA = Math.max.apply(null, r.sim.A);
      const peakD = Math.max.apply(null, r.sim.D);
      return `<tr>
        <td>${r.name}</td>
        <td>${r.sim.A[last].toFixed(3)}</td>
        <td>${peakA.toFixed(3)}</td>
        <td>${r.sim.F[last].toFixed(3)}</td>
        <td>${r.sim.K[last].toFixed(3)}</td>
        <td>${peakD.toFixed(3)}</td>
      </tr>`;
    }).join('');

    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="inline-compare-head">
        <h3>Scenario comparison &mdash; 50-year simulation</h3>
        <button class="btn btn-sm btn-secondary" id="btn-inline-compare-close" type="button">Close</button>
      </div>
      <table class="eq-table inline-compare-table">
        <thead><tr><th>Scenario</th><th>A final</th><th>A peak</th><th>F final</th><th>K final</th><th>D peak</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="chart-grid">
        <div class="chart-cell"><div id="chart-cmp-A" class="plotly-chart"></div></div>
        <div class="chart-cell"><div id="chart-cmp-F" class="plotly-chart"></div></div>
        <div class="chart-cell"><div id="chart-cmp-K" class="plotly-chart"></div></div>
        <div class="chart-cell"><div id="chart-cmp-D" class="plotly-chart"></div></div>
      </div>`;

    document.getElementById('btn-inline-compare-close').onclick = () => {
      panel.style.display = 'none';
      panel.innerHTML = '';
    };

    const palette = ['#2d6a4f', '#e76f51', '#f4a261', '#1d3557', '#7209b7', '#0077b6', '#b5179e', '#4cc9f0'];
    function draw(elId, key, title, ylabel) {
      const traces = results.map((r, i) => ({
        x: r.sim[key].map((_, t) => t), y: r.sim[key],
        name: r.name, mode: 'lines',
        line: { color: palette[i % palette.length], width: 2 }
      }));
      Plotly.newPlot(elId, traces, {
        title: title,
        xaxis: { title: 'Year' }, yaxis: { title: ylabel },
        margin: { l: 55, r: 15, t: 40, b: 45 },
        legend: { orientation: 'h', y: -0.25 },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)'
      }, { responsive: true });
    }
    draw('chart-cmp-A', 'A', 'Beetle density',          'A');
    draw('chart-cmp-F', 'F', 'Parasitoid density',      'F');
    draw('chart-cmp-K', 'K', 'Canopy carrying capacity', 'K');
    draw('chart-cmp-D', 'D', 'Cumulative defoliation',  'D');

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'inline-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('inline-toast-show'), 10);
    setTimeout(() => { t.classList.remove('inline-toast-show'); setTimeout(() => t.remove(), 300); }, 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.ScenariosInline = { refreshSelect, compareInline, loadSaved, saveAll };
})();
