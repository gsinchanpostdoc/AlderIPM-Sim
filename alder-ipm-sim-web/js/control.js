/**
 * Control Strategy Comparison — pure JavaScript implementation.
 *
 * Evaluates the manuscript's three management scenarios (A, B, C) by running
 * simulations with different control inputs and computing the cost functional J
 * that integrates within-season defoliation, larval density, and control effort.
 *
 * Scenarios (manuscript Section 3.3):
 *   A: Parasitoid augmentation only (u_P free; u_C = u_B = 0)
 *   B: Parasitoid + bird habitat (u_P, u_B free; u_C = 0)
 *   C: Full integrated control (u_P, u_C, u_B all free)
 */

class ControlComparator {
  /**
   * @param {Object} baseParams - Model parameter set from the Parameters tab.
   */
  constructor(baseParams) {
    this.baseParams = baseParams || getDefaults();

    // Cost-functional weights (manuscript Eq. 9)
    this.W_D = 10.0;    // weight on cumulative defoliation
    this.W_S = 1.0;     // weight on susceptible larvae density
    this.W_T = 5.0;     // terminal cost on end-of-season defoliation
    this.C_P = 2.0;     // cost per unit parasitoid augmentation
    this.C_C = 5.0;     // cost per unit direct larval removal
    this.C_B = 3.0;     // annual cost per unit bird-habitat enhancement
  }

  /**
   * Compute the cost functional J with within-season integration (Eq. 9).
   *
   * J = sum_{t=1}^{N} [ integral_0^T (w_D*D + w_S*S
   *                        + (C_P/2)*u_P^2 + (C_C/2)*u_C^2) dtau
   *                     + (C_B/2)*u_B^2 + w_T*D(T) ]
   *
   * Control costs are quadratic per Eq 9 (standard for the Pontryagin/FBSM
   * formulation). Bird pressure enters through the model via Eq 7 (u_B).
   *
   * @param {Object} controls - { u_P, u_C, u_B }
   * @param {Object} config - { A0, F0, K0, D0, nYears }
   * @returns {Object} { cost, result } - total cost and simulation trajectories
   */
  computeCostWithTrajectory(controls, config) {
    const u_P = controls.u_P || 0;
    const u_C = controls.u_C || 0;
    const u_B = controls.u_B || 0;

    const {
      A0 = 1.0,
      F0 = 0.5,
      K0 = null,
      D0 = 0.0,
      nYears = 50
    } = config || {};

    const p = Object.assign({}, this.baseParams);
    const model = new AlderIPMSimModel(p);
    model.u_C = u_C;
    model.u_P = u_P;
    model.u_B = u_B;   // Eq 7 (B_t = B_index*(1 + xi*u_B)) is applied inside the model

    const effectiveK0 = K0 !== null ? K0 : model.params.K_0;

    // Manual year-by-year simulation with within-season cost integration
    const nY = nYears;
    const A = new Array(nY + 1);
    const F = new Array(nY + 1);
    const K = new Array(nY + 1);
    const D = new Array(nY + 1);

    A[0] = A0; F[0] = F0; K[0] = effectiveK0; D[0] = D0;

    let totalCost = 0;

    for (let t = 0; t < nY; t++) {
      const mapResult = model.annualMap(A[t], F[t], K[t], D[t]);
      A[t + 1] = mapResult.A_next;
      F[t + 1] = mapResult.F_next;
      K[t + 1] = mapResult.K_next;
      D[t + 1] = mapResult.D_next;

      // Within-season cost integration via trapezoidal rule
      const sol = mapResult.withinSeasonSol;
      if (sol && sol.t.length > 1) {
        const times = sol.t;
        const states = sol.y;
        let seasonCost = 0;
        for (let i = 0; i < times.length - 1; i++) {
          const dt = times[i + 1] - times[i];
          const S_i = Math.max(states[i][0], 0);
          const D_i = states[i][3];
          const S_next = Math.max(states[i + 1][0], 0);
          const D_next = states[i + 1][3];

          const ctrl = 0.5 * this.C_P * u_P * u_P + 0.5 * this.C_C * u_C * u_C;   // Eq 9 quadratic
          const f_i = this.W_D * D_i + this.W_S * S_i + ctrl;
          const f_next = this.W_D * D_next + this.W_S * S_next + ctrl;
          seasonCost += 0.5 * dt * (f_i + f_next);
        }
        // Terminal cost: defoliation at end of season
        const lastState = states[states.length - 1];
        seasonCost += this.W_T * lastState[3];
        totalCost += seasonCost;
      }
    }

    // Annual bird-habitat enhancement cost (Eq 9 quadratic): (C_B/2) u_B^2 per year
    totalCost += 0.5 * this.C_B * u_B * u_B * nY;

    return {
      cost: totalCost,
      result: { A, F, K, D }
    };
  }

  /**
   * Run one strategy scenario: simulate and compute cost.
   *
   * @param {string} name - Strategy label.
   * @param {Object} controls - { u_P, u_C, u_B }
   * @param {Object} config - { A0, F0, K0, D0, nYears }.
   * @returns {Object} Strategy result with metrics.
   */
  runScenario(name, controls, config) {
    const { cost, result } = this.computeCostWithTrajectory(controls, config);

    const n = result.A.length;
    const finalK = result.K[n - 1];
    const finalD = result.D[n - 1];
    const peakD = Math.max(...result.D);

    const p = this.baseParams;

    // Feasibility = local asymptotic stability of the managed equilibrium
    // (lexicographic rule, §2/Fig 8): rho* < 1. Evaluate the annual-map spectral
    // radius at the converged state under this strategy's controls.
    const sm = new AlderIPMSimModel(Object.assign({}, p));
    sm.u_C = controls.u_C || 0;
    sm.u_P = controls.u_P || 0;
    sm.u_B = controls.u_B || 0;
    const rhoStar = sm.spectralRadius(result.A[n - 1], result.F[n - 1], finalK, finalD);
    const stable = isFinite(rhoStar) && rhoStar < 1.0;

    return {
      name,
      controls,
      J: cost,
      finalK,
      finalD,
      peakD,
      rhoStar,
      stable,
      dCritExceeded: peakD > p.D_crit,
      kBelowMin: finalK < p.K_min,
      feasible: stable,                                             // paper's feasibility criterion
      feasibleDamage: peakD <= p.D_crit && finalK >= p.K_min,       // retained diagnostic
      result
    };
  }

  /**
   * Compare the manuscript's three management scenarios (A, B, C).
   *
   * A: Parasitoid augmentation only (u_P free; u_C = u_B = 0)
   * B: Parasitoid + bird habitat (u_P, u_B free; u_C = 0)
   * C: Full integrated control (u_P, u_C, u_B all free)
   *
   * Uses a simple grid search over control values to find approximate optima.
   *
   * @param {Object} config - Simulation config { A0, F0, K0, D0, nYears }.
   * @returns {Object[]} Array of strategy results.
   */
  compareStrategies(config) {
    const p = this.baseParams;
    const uPMax = p.u_P_max;
    const uCMax = p.u_C_max;
    const uBMax = p.u_B_max;

    // Grid search resolution
    const nSteps = 5;

    // Scenario A: u_P free, u_C = u_B = 0
    let bestA = null;
    for (let i = 0; i <= nSteps; i++) {
      const u_P = (i / nSteps) * uPMax;
      const r = this.runScenario("Strategy A", { u_P, u_C: 0, u_B: 0 }, config);
      if (!bestA || r.J < bestA.J) bestA = r;
    }

    // Scenario B: u_P, u_B free, u_C = 0
    let bestB = null;
    for (let i = 0; i <= nSteps; i++) {
      for (let j = 0; j <= nSteps; j++) {
        const u_P = (i / nSteps) * uPMax;
        const u_B = (j / nSteps) * uBMax;
        const r = this.runScenario("Strategy B", { u_P, u_C: 0, u_B }, config);
        if (!bestB || r.J < bestB.J) bestB = r;
      }
    }

    // Scenario C: u_P, u_C, u_B all free
    let bestC = null;
    for (let i = 0; i <= nSteps; i++) {
      for (let j = 0; j <= nSteps; j++) {
        for (let k = 0; k <= nSteps; k++) {
          const u_P = (i / nSteps) * uPMax;
          const u_C = (j / nSteps) * uCMax;
          const u_B = (k / nSteps) * uBMax;
          const r = this.runScenario("Strategy C", { u_P, u_C, u_B }, config);
          if (!bestC || r.J < bestC.J) bestC = r;
        }
      }
    }

    return [bestA, bestB, bestC];
  }

  /**
   * Evaluate a user-defined custom control strategy.
   *
   * @param {Object} controls - { u_P, u_C, u_B }
   * @param {Object} config - { A0, F0, K0, D0, nYears }
   * @returns {Object} Strategy result with name "Custom".
   */
  customStrategy(controls, config) {
    return this.runScenario("Custom", controls, config);
  }

  /**
   * Sweep budget fraction from 0 to 1 and compute cost/outcome at each level.
   * All controls are scaled proportionally: u_i = fraction * u_i_max.
   *
   * @param {Object} config - { A0, F0, K0, D0, nYears }
   * @param {number} nPoints - Number of sweep points (default 30).
   * @returns {Object[]} Array of { fraction, cost, finalD, finalK }.
   */
  paretoFrontier(config, nPoints = 30) {
    const p = this.baseParams;
    const uPMax = p.u_P_max;
    const uCMax = p.u_C_max;
    const uBMax = p.u_B_max;
    const results = [];

    for (let i = 0; i <= nPoints; i++) {
      const f = i / nPoints;
      const controls = {
        u_P: f * uPMax,
        u_C: f * uCMax,
        u_B: f * uBMax
      };
      const scenario = this.runScenario("Frontier_" + i, controls, config);
      results.push({
        fraction: f,
        cost: scenario.J,
        finalD: scenario.finalD,
        finalK: scenario.finalK
      });
    }
    return results;
  }

  /**
   * Compute per-year cost breakdown for a given control strategy.
   *
   * @param {Object} controls - { u_P, u_C, u_B }
   * @param {Object} config - { A0, F0, K0, D0, nYears }
   * @returns {Object} { years, u_P, u_C, u_B, yearCost } arrays.
   */
  temporalAllocation(controls, config) {
    const u_P = controls.u_P || 0;
    const u_C = controls.u_C || 0;
    const u_B = controls.u_B || 0;

    const {
      A0 = 1.0,
      F0 = 0.5,
      K0 = null,
      D0 = 0.0,
      nYears = 50
    } = config || {};

    const p = Object.assign({}, this.baseParams);
    const model = new AlderIPMSimModel(p);
    model.u_C = u_C;
    model.u_P = u_P;
    model.u_B = u_B;   // Eq 7 handled inside the model

    const effectiveK0 = K0 !== null ? K0 : model.params.K_0;

    const nY = nYears;
    const A = new Array(nY + 1);
    const F = new Array(nY + 1);
    const K = new Array(nY + 1);
    const D = new Array(nY + 1);

    A[0] = A0; F[0] = F0; K[0] = effectiveK0; D[0] = D0;

    const years = [];
    const costP = [];
    const costC = [];
    const costB = [];
    const yearCost = [];

    for (let t = 0; t < nY; t++) {
      const mapResult = model.annualMap(A[t], F[t], K[t], D[t]);
      A[t + 1] = mapResult.A_next;
      F[t + 1] = mapResult.F_next;
      K[t + 1] = mapResult.K_next;
      D[t + 1] = mapResult.D_next;

      // Within-season cost integration via trapezoidal rule
      let seasonCostP = 0;
      let seasonCostC = 0;
      const seasonCostB = 0.5 * this.C_B * u_B * u_B;

      const sol = mapResult.withinSeasonSol;
      if (sol && sol.t.length > 1) {
        const times = sol.t;
        for (let i = 0; i < times.length - 1; i++) {
          const dt = times[i + 1] - times[i];
          seasonCostP += dt * 0.5 * this.C_P * u_P * u_P;
          seasonCostC += dt * 0.5 * this.C_C * u_C * u_C;
        }
      }

      years.push(t);
      costP.push(seasonCostP);
      costC.push(seasonCostC);
      costB.push(seasonCostB);
      yearCost.push(seasonCostP + seasonCostC + seasonCostB);
    }

    return { years, u_P: costP, u_C: costC, u_B: costB, yearCost };
  }
}
