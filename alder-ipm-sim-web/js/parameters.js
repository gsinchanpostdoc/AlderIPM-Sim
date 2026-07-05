/**
 * AlderIPM-Sim Parameter Registry
 * Full parameter set for the Alnus-beetle-parasitoid-bird ecoepidemic model.
 */

const PARAM_REGISTRY = {
  // ── Within-season parameters ──────────────────────────────────────
  beta: {
    name: "beta",
    symbol: "\u03b2",
    default: 0.0301,
    min: 0.005,
    max: 0.04,
    unit: "/day",
    description: "Parasitoid attack rate (Holling Type II functional response numerator; rate at which adult Meigenia mutabilis parasitoids successfully oviposit into Agelastica alni beetle larvae)",
    module: "within_season",
    category: "biotic_rate"
  },
  h: {
    name: "h",
    symbol: "h",
    default: 0.00575,
    min: 0.001,
    max: 0.01,
    unit: "ha/larva",
    description: "Parasitoid saturation parameter (composite Holling II saturation term, the inverse of larval density per oviposition; not a handling time). Larger h -> saturation sets in at lower host density.",
    module: "within_season",
    category: "biotic_rate"
  },
  c_B: {
    name: "c_B",
    symbol: "c_B",
    default: 0.0209,
    min: 0.01,
    max: 0.03,
    unit: "/day",
    description: "Bird per-unit consumption rate coefficient (rate at which generalist passeriform birds consume beetle larvae)",
    module: "within_season",
    category: "biotic_rate"
  },
  a_B: {
    name: "a_B",
    symbol: "a_B",
    default: 0.00651,
    min: 0.0001,
    max: 0.02,
    unit: "ha/larva",
    description: "Bird half-saturation parameter (Holling II; total larval density (S+I) at which bird predation approaches half its maximum)",
    module: "within_season",
    category: "biotic_rate"
  },
  mu_S: {
    name: "mu_S",
    symbol: "\u03bc_S",
    default: 0.00423,
    min: 0.003,
    max: 0.03,
    unit: "/day",
    description: "Background mortality rate of susceptible (unparasitised) beetle larvae (natural death from desiccation, disease, intraspecific competition)",
    module: "within_season",
    category: "mortality"
  },
  mu_I: {
    name: "mu_I",
    symbol: "\u03bc_I",
    default: 0.0443,
    min: 0.02,
    max: 0.08,
    unit: "/day",
    description: "Background mortality rate of parasitised beetle larvae (higher than mu_S due to physiological burden of parasitoid development)",
    module: "within_season",
    category: "mortality"
  },
  delta: {
    name: "delta",
    symbol: "\u03b4",
    default: 0.1918,
    min: 0.05,
    max: 0.25,
    unit: "/day",
    description: "Parasitoid-induced mortality rate (rate at which parasitoid emergence kills the host larva; temperature-dependent development)",
    module: "within_season",
    category: "mortality"
  },
  eta: {
    name: "eta",
    symbol: "\u03b7",
    default: 0.7054,
    min: 0.5,
    max: 1.0,
    unit: "dimensionless",
    description: "Parasitoid conversion efficiency (number of new adult parasitoid flies produced per parasitised host that undergoes emergence)",
    module: "within_season",
    category: "biotic_rate"
  },
  mu_F: {
    name: "mu_F",
    symbol: "\u03bc_F",
    default: 0.0309,
    min: 0.01,
    max: 0.08,
    unit: "/day",
    description: "Baseline natural mortality of adult parasitoid flies",
    module: "within_season",
    category: "mortality"
  },
  kappa: {
    name: "kappa",
    symbol: "\u03ba",
    default: 0.00273,
    min: 0.0001,
    max: 0.003,
    unit: "/day",
    description: "Defoliation conversion rate (rate at which larval feeding density translates to fractional canopy loss per day)",
    module: "within_season",
    category: "biotic_rate"
  },
  T: {
    name: "T",
    symbol: "T",
    default: 49.9,
    min: 45.0,
    max: 70.0,
    unit: "days",
    description: "Duration of larval vulnerability window (spring-summer period when beetle larvae are active and exposed to parasitism/predation)",
    module: "within_season",
    category: "phenology"
  },
  B_index: {
    name: "B_index",
    symbol: "B_idx",
    default: 1.59,
    min: 0.5,
    max: 2.0,
    unit: "dimensionless",
    description: "Exogenous bird predation pressure index (scaled from PECBMS passerine monitoring data; reflects regional bird abundance)",
    module: "within_season",
    category: "biotic_rate"
  },

  // ── Annual (between-season) parameters ────────────────────────────
  R_B: {
    name: "R_B",
    symbol: "R_B",
    default: 9.53,
    min: 6.0,
    max: 16.0,
    unit: "dimensionless",
    description: "Beetle annual reproduction ratio (Beverton-Holt fecundity; expected offspring per adult surviving to reproduce)",
    module: "annual",
    category: "biotic_rate"
  },
  sigma_A: {
    name: "sigma_A",
    symbol: "\u03c3_A",
    default: 0.781,
    min: 0.5,
    max: 0.9,
    unit: "dimensionless",
    description: "Beetle overwintering survival probability (fraction surviving pupation, winter dormancy, spring emergence, and mating)",
    module: "annual",
    category: "mortality"
  },
  sigma_F: {
    name: "sigma_F",
    symbol: "\u03c3_F",
    default: 0.363,
    min: 0.3,
    max: 0.7,
    unit: "dimensionless",
    description: "Parasitoid overwinter survival probability (fraction of parasitoid puparia surviving in soil through winter)",
    module: "annual",
    category: "mortality"
  },
  K_0: {
    name: "K_0",
    symbol: "K_0",
    default: 1.712,
    min: 1.0,
    max: 2.0,
    unit: "relative units",
    description: "Baseline carrying capacity (maximum beetle recruitment capacity under fully recovered, undamaged canopy)",
    module: "annual",
    category: "threshold"
  },
  phi: {
    name: "phi",
    symbol: "\u03c6",
    default: 0.0449,
    min: 0.01,
    max: 0.1,
    unit: "dimensionless",
    description: "Foliage-feedback penalty coefficient (strength of induced phytochemical defence; K_t = K_0 * exp(-phi * D_t))",
    module: "annual",
    category: "phenology"
  },
  rho: {
    name: "rho",
    symbol: "\u03c1",
    default: 0.5,
    min: 0.5,
    max: 0.5,
    unit: "dimensionless",
    description: "Baseline bird pressure multiplier",
    module: "annual",
    category: "biotic_rate"
  },

  // ── Control parameters ────────────────────────────────────────────
  u_P_max: {
    name: "u_P_max",
    symbol: "u_P^max",
    default: 0.5,
    min: 0.0,
    max: 1.0,
    unit: "individuals/ha/day",
    description: "Maximum parasitoid augmentation effort",
    module: "annual",
    category: "control"
  },
  u_C_max: {
    name: "u_C_max",
    symbol: "u_C^max",
    default: 0.2,
    min: 0.0,
    max: 1.0,
    unit: "individuals/ha/day",
    description: "Maximum direct larval removal effort",
    module: "annual",
    category: "control"
  },
  u_B_max: {
    name: "u_B_max",
    symbol: "u_B^max",
    default: 1.0,
    min: 0.0,
    max: 2.0,
    unit: "relative units",
    description: "Maximum annual bird-habitat enhancement",
    module: "annual",
    category: "control"
  },

  // ── Threshold parameters ──────────────────────────────────────────
  D_crit: {
    name: "D_crit",
    symbol: "D_crit",
    default: 0.5,
    min: 0.0,
    max: 1.0,
    unit: "dimensionless",
    description: "Critical defoliation threshold (canopy loss exceeding 50% triggers collapse risk)",
    module: "annual",
    category: "threshold"
  },
  K_min: {
    name: "K_min",
    symbol: "K_min",
    default: 0.856,
    min: 0.0,
    max: 1.0,
    unit: "relative units",
    description: "Minimum carrying capacity for viable beetle population (0.5 * K_0)",
    module: "annual",
    category: "threshold"
  }
};

/**
 * Preset Scenarios — ecologically meaningful parameter combinations
 * representing climate change impacts and management strategies.
 */
const PRESETS = {
  baseline_calibrated: {
    name: "Baseline Calibrated",
    description: "Current calibrated parameter values fitted to field observations. Represents the present-day Alnus glutinosa\u2013beetle\u2013parasitoid\u2013bird system.",
    params: {
      beta: 0.0301, h: 0.00575, c_B: 0.0209, a_B: 0.00651,
      mu_S: 0.00423, mu_I: 0.0443, delta: 0.1918, eta: 0.7054,
      mu_F: 0.0309, kappa: 0.00273, T: 49.9, B_index: 1.59,
      R_B: 9.53, sigma_A: 0.781, sigma_F: 0.363, K_0: 1.712,
      phi: 0.0449
    },
    expected_regime: "coexistence",
    manuscript_ref: "Table 1 and Section 2.1"
  },
  warm_winter: {
    name: "Warm Winter",
    description: "Warmer winters increase beetle and parasitoid overwintering survival and extend the larval season, raising outbreak risk under climate change.",
    params: { sigma_A: 0.88, sigma_F: 0.55, T: 55 },
    expected_regime: "parasitoid_free",
    manuscript_ref: "Section 3.3 \u2014 phenological sensitivity analysis"
  },
  short_season: {
    name: "Short Season",
    description: "Cooler or delayed springs shorten the larval vulnerability window, reduce beetle survival, and lower fecundity.",
    params: { T: 45, sigma_A: 0.6, R_B: 7.0 },
    expected_regime: "coexistence",
    manuscript_ref: "Section 3.3 \u2014 phenological sensitivity analysis"
  },
  high_bird_pressure: {
    name: "High Bird Pressure",
    description: "Enhanced avian predation through increased passerine abundance and higher per-capita consumption, simulating bird-habitat management.",
    params: { B_index: 1.9, c_B: 0.025 },
    expected_regime: "coexistence",
    manuscript_ref: "Section 3.4 \u2014 bird predation impact"
  },
  low_parasitism: {
    name: "Low Parasitism",
    description: "Weak parasitoid control due to low attack rate, poor conversion efficiency, and slow parasitoid-induced mortality.",
    params: { beta: 0.01, eta: 0.5, delta: 0.1 },
    expected_regime: "parasitoid_free",
    manuscript_ref: "Section 3.2 \u2014 parasitoid efficacy analysis"
  },
  outbreak_risk: {
    name: "Outbreak Risk",
    description: "High beetle fecundity with elevated overwintering survival and weak canopy feedback creates conditions for severe defoliation outbreaks.",
    params: { R_B: 14.0, sigma_A: 0.85, phi: 0.02 },
    expected_regime: "parasitoid_free",
    manuscript_ref: "Section 3.5 \u2014 tipping point analysis"
  },
  managed_forest: {
    name: "Managed Forest",
    description: "Integrated pest management combining parasitoid augmentation, direct larval removal, and bird-habitat enhancement (Strategy C optimal).",
    params: { u_P_max: 0.5, u_C_max: 0.2, u_B_max: 1.0 },
    expected_regime: "coexistence",
    manuscript_ref: "Section 4 \u2014 optimal control comparison"
  }
};

/**
 * Plain-language labels for every model parameter. Shown inline next to
 * the symbol in the Parameters tab and in the About/Help glossary so that
 * users need not memorise the mathematical notation.
 * Pair each label with one short "what does this number mean?" hint.
 */
const PARAM_LABELS = {
  beta:     { short: "Parasitoid attack rate",            hint: "Higher \u2192 parasitoids find hosts faster." },
  h:        { short: "Parasitoid handling time",          hint: "Higher \u2192 saturation sets in sooner." },
  c_B:      { short: "Bird consumption rate",             hint: "Higher \u2192 more larvae eaten per bird per day." },
  a_B:      { short: "Bird half-saturation",              hint: "Larval density at which bird intake is half-max." },
  mu_S:     { short: "Mortality, healthy larvae",         hint: "Natural death rate of unparasitised larvae." },
  mu_I:     { short: "Mortality, parasitised larvae",     hint: "Death rate of larvae carrying a parasitoid." },
  delta:    { short: "Parasitoid emergence rate",         hint: "How fast parasitoids finish developing and kill the host." },
  eta:      { short: "Parasitoid conversion efficiency",  hint: "New parasitoids produced per parasitised larva." },
  mu_F:     { short: "Adult parasitoid mortality",        hint: "Daily death rate of adult wasps." },
  kappa:    { short: "Defoliation-per-feeding rate",      hint: "How much canopy each larva damages per day." },
  T:        { short: "Larval season length",              hint: "Days larvae are exposed to enemies each year." },
  B_index:  { short: "Bird abundance index",              hint: "Regional passerine pressure (1 = baseline)." },
  R_B:      { short: "Beetle fecundity",                  hint: "Expected offspring per surviving adult beetle." },
  sigma_A:  { short: "Beetle overwinter survival",        hint: "Fraction of beetles surviving the dormant season." },
  sigma_F:  { short: "Parasitoid overwinter survival",    hint: "Fraction of parasitoid puparia surviving winter." },
  K_0:      { short: "Baseline canopy capacity",          hint: "Beetle recruitment ceiling on undamaged foliage." },
  phi:      { short: "Canopy-feedback strength",          hint: "Higher \u2192 defoliation cuts next year's capacity harder." },
  rho:      { short: "Baseline bird multiplier",          hint: "Scales bird pressure in the annual map." },
  u_P_max:  { short: "Max parasitoid release",            hint: "Ceiling on parasitoid augmentation (biocontrol)." },
  u_C_max:  { short: "Max larval removal effort",         hint: "Ceiling on chemical / mechanical removal." },
  u_B_max:  { short: "Max bird-habitat boost",            hint: "Ceiling on nest-box / habitat enhancement." },
  D_crit:   { short: "Critical defoliation threshold",    hint: "Canopy loss above which collapse becomes likely." },
  K_min:    { short: "Minimum viable capacity",           hint: "Below this capacity the beetle cannot persist." }
};

function getDefaults() {
  const defaults = {};
  for (const [key, meta] of Object.entries(PARAM_REGISTRY)) {
    defaults[key] = meta.default;
  }
  return defaults;
}

function validateParams(params) {
  const errors = [];
  for (const [key, value] of Object.entries(params)) {
    const meta = PARAM_REGISTRY[key];
    if (!meta) continue;
    if (value < meta.min || value > meta.max) {
      errors.push(`${key} (${meta.symbol}) = ${value} is outside [${meta.min}, ${meta.max}]`);
    }
  }
  return errors;
}
