/**
 * AlderIPM-Sim ODE Model
 * Within-season ODE system with 4th-order Runge-Kutta solver and annual update map.
 *
 * States: S = healthy/susceptible beetle larvae, I = parasitised larvae,
 *         F = adult parasitoid flies, D = cumulative defoliation
 * (In the annual map context: A = adult beetles, F = parasitoids,
 *  K = carrying capacity, D = defoliation)
 */

class AlderIPMSimModel {
  constructor(params) {
    this.params = Object.assign(getDefaults(), params || {});
    this.u_C = 0.0; // direct larval removal effort
    this.u_P = 0.0; // parasitoid augmentation effort
    this.u_B = 0.0; // annual bird-habitat enhancement effort (Eq 7)
  }

  /**
   * Right-hand side of the within-season ODE system (Eqs 1-4).
   *
   * dS/dtau = -beta*S*F/(1+h*S) - c_B*B_t*S/(1+a_B*(S+I)) - (mu_S+u_C)*S
   * dI/dtau =  beta*S*F/(1+h*S) - c_B*B_t*I/(1+a_B*(S+I)) - (mu_I+delta+u_C)*I
   * dF/dtau =  eta*delta*I - mu_F*F + u_P
   * dD/dtau =  kappa*(S + I)
   *
   * Bird predation uses class-specific numerators (S for dS, I for dI); the
   * total larval density (S+I) enters only the shared saturation denominator.
   * Effective bird pressure follows Eq 7: B_t = B_index*(1 + xi*u_B).
   */
  withinSeasonRHS(tau, y) {
    const p = this.params;

    const S = Math.max(y[0], 0.0);
    const I = Math.max(y[1], 0.0);
    const F = Math.max(y[2], 0.0);
    const D = y[3];

    // Effective bird pressure with habitat enhancement (Eq 7). u_B defaults to
    // 0, so baseline (unmanaged) behaviour is unchanged. p.rho is the scaling xi.
    const xi = (p.rho !== undefined ? p.rho : 0.0);
    const B_t = p.B_index * (1.0 + xi * this.u_B);

    // Holling Type II parasitism
    const parasitism = p.beta * S * F / (1.0 + p.h * S);

    // Bird predation (Holling II): (S+I) sets the saturation denominator only;
    // the numerator is class-specific (Eqs 1-2).
    const birdSat = 1.0 + p.a_B * (S + I);
    const birdPredS = p.c_B * B_t * S / birdSat;
    const birdPredI = p.c_B * B_t * I / birdSat;

    const dS = -parasitism - birdPredS - (p.mu_S + this.u_C) * S;
    const dI = parasitism - birdPredI - (p.mu_I + p.delta + this.u_C) * I;
    const dF = p.eta * p.delta * I - p.mu_F * F + this.u_P;
    const dD = p.kappa * (S + I);

    return [dS, dI, dF, dD];
  }

  /**
   * 4th-order Runge-Kutta integrator.
   * @param {number} t0 - Start time
   * @param {number} t1 - End time
   * @param {number[]} y0 - Initial state [S, I, F, D]
   * @param {number} dt - Time step (default 0.1 days)
   * @returns {{t: number[], y: number[][]}} - Time points and state trajectories
   */
  rk4Integrate(t0, t1, y0, dt) {
    dt = dt || 0.1;
    const n = Math.ceil((t1 - t0) / dt);
    const actualDt = (t1 - t0) / n;

    const times = new Array(n + 1);
    const states = new Array(n + 1);

    times[0] = t0;
    states[0] = y0.slice();

    for (let i = 0; i < n; i++) {
      const t = times[i];
      const y = states[i];

      const k1 = this.withinSeasonRHS(t, y);
      const y2 = y.map((v, j) => v + 0.5 * actualDt * k1[j]);
      const k2 = this.withinSeasonRHS(t + 0.5 * actualDt, y2);
      const y3 = y.map((v, j) => v + 0.5 * actualDt * k2[j]);
      const k3 = this.withinSeasonRHS(t + 0.5 * actualDt, y3);
      const y4 = y.map((v, j) => v + actualDt * k3[j]);
      const k4 = this.withinSeasonRHS(t + actualDt, y4);

      const yNext = new Array(4);
      for (let j = 0; j < 4; j++) {
        yNext[j] = y[j] + (actualDt / 6.0) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
      }

      times[i + 1] = t + actualDt;
      states[i + 1] = yNext;
    }

    return { t: times, y: states };
  }

  /**
   * Integrate the within-season ODE from tau=0 to tau=T.
   */
  integrateSeason(S0, I0, F0, D0) {
    const T = this.params.T;
    const result = this.rk4Integrate(0, T, [S0, I0, F0, D0]);
    const endState = result.y[result.y.length - 1];
    return {
      sol: result,
      endVals: {
        S_T: Math.max(endState[0], 0.0),
        I_T: Math.max(endState[1], 0.0),
        F_T: Math.max(endState[2], 0.0),
        D_T: endState[3]
      }
    };
  }

  /**
   * Compute the between-year discrete map (Eqs. 5-8).
   *
   * Season start (Eq. 5): S(0) = R_B * A_t / (1 + A_t / K_t)
   * Season end (Eq. 6):   A_{t+1} = sigma_A * S(T)
   * F_{t+1} = sigma_F * F_T
   * K_{t+1} = K_0 * exp(-phi * D_T)
   * D_{t+1} = D_T
   */
  annualMap(A_t, F_t, K_t, D_t) {
    const p = this.params;

    // Beverton-Holt recruitment at season start (Eq. 5)
    const S0 = p.R_B * A_t / (1.0 + A_t / K_t);

    const { sol, endVals } = this.integrateSeason(S0, 0.0, F_t, 0.0);

    const S_T = endVals.S_T;
    const F_T = endVals.F_T;
    const D_T = endVals.D_T;

    // Simple overwinter survival (Eq. 6)
    const A_next = p.sigma_A * S_T;
    const F_next = p.sigma_F * F_T;
    const K_next = p.K_0 * Math.exp(-p.phi * D_T);
    const D_next = D_T;

    return {
      A_next, F_next, K_next, D_next,
      withinSeasonSol: sol
    };
  }

  /**
   * Run the annual map for n_years successive seasons.
   */
  simulate(A0, F0, K0, D0, nYears, storeWithinSeason) {
    const A = new Array(nYears + 1);
    const F = new Array(nYears + 1);
    const K = new Array(nYears + 1);
    const D = new Array(nYears + 1);
    const withinSeason = [];

    A[0] = A0;
    F[0] = F0;
    K[0] = K0;
    D[0] = D0;

    for (let t = 0; t < nYears; t++) {
      const result = this.annualMap(A[t], F[t], K[t], D[t]);
      A[t + 1] = result.A_next;
      F[t + 1] = result.F_next;
      K[t + 1] = result.K_next;
      D[t + 1] = result.D_next;
      if (storeWithinSeason) {
        withinSeason.push(result.withinSeasonSol);
      }
    }

    const out = { A, F, K, D };
    if (storeWithinSeason) {
      out.withinSeason = withinSeason;
    }
    return out;
  }

  /**
   * Parasitoid invasion threshold R_P (Eq 11), computed exactly as
   *   R_P = sigma_F * dF(T)/dF(0)
   * from the variational (sensitivity) equations of the within-season ODE,
   * evaluated along the parasitoid-free trajectory S̄(tau). This reproduces the
   * paper's transcritical boundary (R_P = 1) and its bird-pressure dependence,
   * unlike the interpretable closed-form approximation (Eq 11a).
   *
   * The optional S_bar argument is ignored (kept for call-site compatibility).
   */
  computeRP(S_bar) {
    const p = this.params;
    const savedUP = this.u_P;
    this.u_P = 0.0;                          // parasitoid-free base state (F = 0 => I = 0)
    const uC = this.u_C;
    const xi = (p.rho !== undefined ? p.rho : 0.0);
    const B_t = p.B_index * (1.0 + xi * this.u_B);

    // 1) Parasitoid-free fixed point of the annual map -> season-start host S(0).
    let A_t = p.K_0 * 0.5;
    let K_t = p.K_0;
    let S0 = p.R_B * A_t / (1.0 + A_t / Math.max(K_t, 1e-12));
    for (let i = 0; i < 300; i++) {
      S0 = p.R_B * A_t / (1.0 + A_t / Math.max(K_t, 1e-12));
      const res = this.integrateSeason(S0, 0.0, 0.0, 0.0);
      const S_T = res.endVals.S_T;
      const D_T = res.endVals.D_T;
      const A_next = p.sigma_A * S_T;
      const K_next = p.K_0 * Math.exp(-p.phi * D_T);
      const done = Math.abs(A_next - A_t) < 1e-12 && Math.abs(K_next - K_t) < 1e-12;
      A_t = A_next; K_t = K_next;
      if (done) break;
    }
    S0 = p.R_B * A_t / (1.0 + A_t / Math.max(K_t, 1e-12));
    this.u_P = savedUP;

    // 2) Integrate host S(tau) together with the variational states (dI, dF),
    //    initialised at [dI, dF] = [0, 1], over [0, T] via RK4.
    //    dS/dtau  = -c_B B_t S/(1+a_B S) - (mu_S+u_C) S        (F = 0)
    //    d(dI)/dtau =  a(S) dF - b(S) dI,  a = beta S/(1+h S)
    //    d(dF)/dtau =  eta delta dI - mu_F dF,  b = mu_I+delta+u_C + c_B B_t/(1+a_B S)
    const rhs = (yv) => {
      const S = Math.max(yv[0], 0.0);
      const dIv = yv[1];
      const dFv = yv[2];
      const birdSat = 1.0 + p.a_B * S;
      const dS = -p.c_B * B_t * S / birdSat - (p.mu_S + uC) * S;
      const a = p.beta * S / (1.0 + p.h * S);
      const b = p.mu_I + p.delta + uC + p.c_B * B_t / birdSat;
      return [dS, a * dFv - b * dIv, p.eta * p.delta * dIv - p.mu_F * dFv];
    };

    const T = p.T;
    const n = Math.max(1, Math.ceil(T / 0.1));
    const dt = T / n;
    let y = [S0, 0.0, 1.0];
    for (let i = 0; i < n; i++) {
      const k1 = rhs(y);
      const y2 = [y[0] + 0.5 * dt * k1[0], y[1] + 0.5 * dt * k1[1], y[2] + 0.5 * dt * k1[2]];
      const k2 = rhs(y2);
      const y3 = [y[0] + 0.5 * dt * k2[0], y[1] + 0.5 * dt * k2[1], y[2] + 0.5 * dt * k2[2]];
      const k3 = rhs(y3);
      const y4 = [y[0] + dt * k3[0], y[1] + dt * k3[1], y[2] + dt * k3[2]];
      const k4 = rhs(y4);
      y = [
        y[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
        y[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
        y[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
      ];
    }
    return p.sigma_F * y[2];               // R_P = sigma_F * dF(T)
  }

  /**
   * Resistance R1 (§2.4). System variable: cumulative defoliation D;
   * reference S_R = D* (equilibrium defoliation).
   *   R1 = 1 - 2|S_R - S_X| / (S_R + |S_R - S_X|)
   * where S_X is D at maximum deviation after a +/-20% pulse displacement of A*.
   * R1 = 1: no deviation; R1 = 0: deviation equal to the reference.
   */
  computeR1(A_star, F_star, K_star, D_star, perturbationFrac, nYears) {
    perturbationFrac = perturbationFrac || 0.2;
    nYears = nYears || 50;
    if (!(A_star > 1e-12)) return NaN;

    const SR = D_star;                                   // reference: equilibrium defoliation
    const A0 = A_star * (1.0 + perturbationFrac);        // standardized pulse on A
    const sim = this.simulate(A0, F_star, K_star, D_star, nYears, false);

    let SX = SR, maxDev = -1;
    for (let i = 0; i <= nYears; i++) {
      const dev = Math.abs(sim.D[i] - SR);
      if (dev > maxDev) { maxDev = dev; SX = sim.D[i]; }
    }
    const denom = SR + Math.abs(SR - SX);
    if (denom < 1e-12) return 1.0;
    const R1 = 1.0 - 2.0 * Math.abs(SR - SX) / denom;
    return Math.max(-1, Math.min(1, R1));
  }

  /**
   * Resilience R2 (§2.4). System variable: carrying capacity K;
   * reference S_R = K* (equilibrium capacity).
   *   R2 = 2|S_R - S_0| / (|S_R - S_0| + |S_R - S_Y|) - 1
   * where S_0 is K at maximum deviation after the +/-20% pulse on A*, and S_Y is
   * K after Y = 5 annual cycles from that point. R2 = 1: full recovery; 0: none.
   */
  computeR2(A_star, F_star, K_star, D_star, perturbationFrac, Y, nYears) {
    perturbationFrac = perturbationFrac || 0.2;
    Y = Y || 5;
    nYears = nYears || 50;
    if (!(A_star > 1e-12)) return NaN;

    const SR = K_star;                                   // reference: equilibrium capacity
    const A0 = A_star * (1.0 + perturbationFrac);
    const sim = this.simulate(A0, F_star, K_star, D_star, nYears, false);

    let maxDev = -1, maxIdx = 0;
    for (let i = 0; i <= nYears; i++) {
      const dev = Math.abs(sim.K[i] - SR);
      if (dev > maxDev) { maxDev = dev; maxIdx = i; }
    }
    const S0v = sim.K[maxIdx];                           // value at maximum deviation
    const yIdx = Math.min(maxIdx + Y, nYears);
    const SYv = sim.K[yIdx];                             // value Y cycles later
    const d0 = Math.abs(SR - S0v);
    const dY = Math.abs(SR - SYv);
    if (d0 + dY < 1e-12) return 1.0;
    const R2 = 2.0 * d0 / (d0 + dY) - 1.0;
    return Math.max(-1, Math.min(1, R2));
  }

  /**
   * Numerically compute the 4x4 Jacobian of the annual map using central
   * finite differences.
   * @param {number} A - Adult beetle density.
   * @param {number} F - Parasitoid density.
   * @param {number} K - Carrying capacity.
   * @param {number} D - Defoliation.
   * @param {number} [eps=1e-6] - Perturbation size.
   * @returns {number[][]} 4x4 Jacobian matrix.
   */
  computeJacobian(A, F, K, D, eps) {
    eps = eps || 1e-6;
    const x0 = [A, F, K, D];
    const jac = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];

    const mapVec = (x) => {
      x = x.map(v => Math.max(v, 0));
      x[2] = Math.max(x[2], 1e-12);
      const res = this.annualMap(x[0], x[1], x[2], x[3]);
      return [res.A_next, res.F_next, res.K_next, res.D_next];
    };

    for (let j = 0; j < 4; j++) {
      const h = eps * Math.max(Math.abs(x0[j]), 1.0);
      const xPlus = x0.slice();
      const xMinus = x0.slice();
      xPlus[j] += h;
      xMinus[j] -= h;
      try {
        const fPlus = mapVec(xPlus);
        const fMinus = mapVec(xMinus);
        for (let i = 0; i < 4; i++) {
          jac[i][j] = (fPlus[i] - fMinus[i]) / (xPlus[j] - xMinus[j]);
        }
      } catch (e) {
        for (let i = 0; i < 4; i++) jac[i][j] = NaN;
      }
    }
    return jac;
  }

  /**
   * Compute latitude: maximum perturbation before regime shift (Section 2.4).
   */
  computeLatitude(A_star, F_star, K_star, D_star, maxDelta, nSteps, nYears, tol) {
    maxDelta = maxDelta || 2.0;
    nSteps = nSteps || 50;
    nYears = nYears || 50;
    tol = tol || 0.1;
    if (A_star < 1e-12) return 0;

    let latitude = 0;
    for (let i = 1; i <= nSteps; i++) {
      const delta = (i / nSteps) * maxDelta;
      const A0 = A_star * (1.0 + delta);
      const sim = this.simulate(A0, F_star, K_star, D_star, nYears, false);
      const Afinal = sim.A[nYears];
      if (Math.abs(Afinal - A_star) < tol * A_star) {
        latitude = delta;
      } else {
        break;
      }
    }
    return latitude;
  }

  /**
   * Dominant eigenvalue magnitude (spectral radius rho*) of the annual-map
   * Jacobian at state (A,F,K,D). Used for local-asymptotic-stability tests
   * (rho* < 1). QR iteration to real Schur form, then magnitudes are read from
   * 1x1 (real) and 2x2 (complex-pair) diagonal blocks.
   */
  spectralRadius(A, F, K, D) {
    let M;
    try {
      M = this.computeJacobian(A, F, K, D);
    } catch (e) { return NaN; }
    const n = 4;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (!isFinite(M[i][j])) return NaN;

    let Amat = M.map(r => r.slice());
    for (let it = 0; it < 120; it++) {
      const Q = Array.from({ length: n }, () => new Array(n).fill(0));
      const R = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let j = 0; j < n; j++) {
        const v = new Array(n);
        for (let i = 0; i < n; i++) v[i] = Amat[i][j];
        for (let k = 0; k < j; k++) {
          let dot = 0; for (let i = 0; i < n; i++) dot += Q[i][k] * v[i];
          R[k][j] = dot; for (let i = 0; i < n; i++) v[i] -= dot * Q[i][k];
        }
        let nrm = 0; for (let i = 0; i < n; i++) nrm += v[i] * v[i]; nrm = Math.sqrt(nrm);
        R[j][j] = nrm;
        if (nrm > 1e-14) for (let i = 0; i < n; i++) Q[i][j] = v[i] / nrm;
      }
      const nA = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          let s = 0; for (let k = 0; k < n; k++) s += R[i][k] * Q[k][j];
          nA[i][j] = s;
        }
      Amat = nA;
    }

    let mx = 0, i = 0;
    while (i < n) {
      const sub = (i + 1 < n) ? Amat[i + 1][i] : 0;
      if (Math.abs(sub) < 1e-8) {
        mx = Math.max(mx, Math.abs(Amat[i][i]));
        i += 1;
      } else {
        const a = Amat[i][i], b = Amat[i][i + 1], c = Amat[i + 1][i], d = Amat[i + 1][i + 1];
        const tr = a + d, det = a * d - b * c, disc = tr * tr - 4 * det;
        if (disc < 0) {
          mx = Math.max(mx, Math.sqrt(Math.max(det, 0)));      // |complex pair| = sqrt(det)
        } else {
          const s = Math.sqrt(disc);
          mx = Math.max(mx, Math.abs((tr + s) / 2), Math.abs((tr - s) / 2));
        }
        i += 2;
      }
    }
    return mx;
  }
}
