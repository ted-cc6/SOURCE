// src/constants/indiana.js
//
// Region baseline configurations for the OUD simulator.
// Each baseline's sliderDefaults keys match the population_scalers the
// FastAPI backend accepts. Keys omitted from sliderDefaults default to 1.00.
// mortalityRate is a synthetic county-level deaths-per-100k estimate.

export const NATIONAL_BASELINE = {
  sliderDefaults: {
    outpatient_mat_count:     1.00,
    inpatient_rehab_count:    1.00,
    er_visit_overdose_count:  1.00,
    police_arrest_count:      1.00,
    incarceration_count:      1.00,
    lost_productivity_count:  1.00,
    foster_care_risk_count:   1.00,
  },
};

export const INDIANA_BASELINE = {
  sliderDefaults: {
    outpatient_mat_count:     0.85,  // MAT access barriers — below national capacity
    inpatient_rehab_count:    1.00,
    er_visit_overdose_count:  1.15,  // overdose visits 15% above national average
    police_arrest_count:      1.20,  // enforcement-heavy posture
    incarceration_count:      1.10,
    lost_productivity_count:  1.10,
    foster_care_risk_count:   1.00,
  },

  countyData: [
    // Urban core — highest rates driven by concentrated poverty & limited MAT access
    { name: 'Marion',     id: '18097', mortalityRate: 45.2 }, // Indianapolis
    { name: 'Lake',       id: '18089', mortalityRate: 52.7 }, // Gary / industrial corridor
    { name: 'Elkhart',    id: '18039', mortalityRate: 47.3 }, // Manufacturing belt
    // Mid-size cities
    { name: 'Allen',      id: '18003', mortalityRate: 37.8 }, // Fort Wayne
    { name: 'St. Joseph', id: '18141', mortalityRate: 41.6 }, // South Bend
    { name: 'Tippecanoe', id: '18157', mortalityRate: 33.5 }, // Lafayette / Purdue
    // Affluent suburban — lowest synthetic rate
    { name: 'Hamilton',   id: '18057', mortalityRate: 21.4 }, // Carmel / Noblesville
  ],
};

// Lookup used by ScenarioPanel and App to resolve the correct defaults
// by region name without per-callsite switch statements.
export const REGION_BASELINES = {
  National: NATIONAL_BASELINE,
  Indiana:  INDIANA_BASELINE,
};

// Returns the population_scalers payload for a POST /simulate call:
// only keys that differ from 1.0, or undefined when all are neutral.
export function apiScalersForRegion(region) {
  const defaults = REGION_BASELINES[region]?.sliderDefaults ?? {};
  const changed = Object.fromEntries(
    Object.entries(defaults).filter(([, v]) => Math.abs(v - 1) > 1e-6)
  );
  return Object.keys(changed).length ? changed : undefined;
}
