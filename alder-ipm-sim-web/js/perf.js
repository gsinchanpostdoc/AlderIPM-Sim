/* ============================================================
   AlderIPM-Sim — performance helpers (Block 8)
   Two small, dependency-free utilities:

     window.debounce(fn, ms)  — trailing debounce for input handlers.

     window.Loading.wrap(msg, fn) — show a lightweight "Calculating..."
       indicator, let the browser PAINT it, then run a synchronous
       computation and hide the indicator afterwards. This gives instant
       feedback for the few operations that run synchronously (equilibria,
       control comparison, scenario comparison) so the UI never appears to
       freeze without explanation.

   Note on Web Workers: the heaviest sweeps (LHS-PRCC and the bifurcation
   scans) are already computed in batched setTimeout chunks with live
   progress bars, so the main thread already yields during them. Moving the
   solver into a Worker was assessed and deliberately not done here: it would
   require making every synchronous simulate() call asynchronous across the
   whole app for no responsiveness gain over the existing batching.
   ============================================================ */
(function () {
  "use strict";

  window.debounce = function (fn, ms) {
    var t = null;
    ms = ms || 200;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  };

  window.Loading = (function () {
    var el = null, depth = 0;

    function ensure() {
      if (el) return el;
      el = document.createElement("div");
      el.className = "app-loading";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.innerHTML = '<span class="app-loading-spin" aria-hidden="true"></span><span class="app-loading-msg"></span>';
      el.style.display = "none";
      document.body.appendChild(el);
      return el;
    }
    function show(msg) {
      var e = ensure();
      e.querySelector(".app-loading-msg").textContent = msg || "Calculating\u2026";
      e.style.display = "flex";
      depth++;
    }
    function hide() {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && el) el.style.display = "none";
    }
    function wrap(msg, fn) {
      if (typeof fn !== "function") return;
      show(msg);
      // Defer past a paint so the indicator is visible before the
      // synchronous computation blocks the main thread.
      requestAnimationFrame(function () {
        setTimeout(function () {
          try { fn(); } finally { hide(); }
        }, 0);
      });
    }
    return { show: show, hide: hide, wrap: wrap };
  })();
})();
