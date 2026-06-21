// src/components/ScenarioPanel.jsx
import { useState } from 'react';
import InfoTip from './InfoTip.jsx';
import { REGION_BASELINES } from '../constants/indiana.js';

const SCALER_FIELDS = [
  { key: 'outpatient_mat_count',    label: 'Outpatient MAT patients',   sub: 'Medication-assisted treatment access' },
  { key: 'inpatient_rehab_count',   label: 'Inpatient rehab admissions', sub: '30-day residential treatment entries' },
  { key: 'er_visit_overdose_count', label: 'ER overdose visits',         sub: 'Emergency department contact' },
  { key: 'police_arrest_count',     label: 'Police arrests',             sub: 'Drug-related arrest events' },
  { key: 'incarceration_count',     label: 'Incarceration',              sub: 'People incarcerated at any time' },
  { key: 'lost_productivity_count', label: 'Lost productivity pool',     sub: 'Untreated OUD, employment impact' },
  { key: 'foster_care_risk_count',  label: 'Foster care risk',           sub: 'Children in at-risk households' },
];

const SIM_COUNT_OPTIONS = [500, 1000, 2500, 5000, 10000];

// Builds the full 7-key scaler map for a given region, defaulting any
// key not present in the region's sliderDefaults to 1.00.
function scalersForRegion(region) {
  const defaults = REGION_BASELINES[region]?.sliderDefaults ?? {};
  return SCALER_FIELDS.reduce(
    (acc, f) => ({ ...acc, [f.key]: defaults[f.key] ?? 1 }),
    {}
  );
}

// Returns only scalers that differ from 1.0 — the backend treats omitted
// keys as unchanged baseline (population_scalers convention in main.py).
function changedScalers(scalers) {
  const changed = Object.fromEntries(
    Object.entries(scalers).filter(([, v]) => Math.abs(v - 1) > 1e-6)
  );
  return Object.keys(changed).length ? changed : undefined;
}

// All 50 US states in alphabetical order for the region dropdown.
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
  'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
  'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

function getBadgeCopy(region) {
  if (region === 'National') return 'National Baseline';
  if (region === 'Indiana')  return 'Calibrated to Indiana';
  return 'National Defaults';
}

export default function ScenarioPanel({ onRun, running, selectedRegion, onRegionChange }) {
  // Seed from the prop so first render matches the initial POST /simulate in App.
  const [scalers, setScalers] = useState(() => scalersForRegion(selectedRegion));
  const [nSimulations, setNSimulations] = useState(1000);
  const [seed, setSeed] = useState(42);

  function updateScaler(key, value) {
    setScalers((prev) => ({ ...prev, [key]: value }));
  }

  function handleRun() {
    onRun({
      n_simulations: nSimulations,
      random_seed: seed,
      population_scalers: changedScalers(scalers),
    });
  }

  // Switching region: snap sliders to the new baseline, notify the parent
  // (so GeographyMap updates), and immediately re-run the simulation.
  function handleRegionChange(region) {
    const newScalers = scalersForRegion(region);
    setScalers(newScalers);
    onRegionChange(region);
    onRun({
      n_simulations: nSimulations,
      random_seed: seed,
      population_scalers: changedScalers(newScalers),
    });
  }

  // Reset snaps back to the currently active region's defaults, not to 1.00.
  function handleReset() {
    const baseline = scalersForRegion(selectedRegion);
    setScalers(baseline);
    onRun({
      n_simulations: nSimulations,
      random_seed: seed,
      population_scalers: changedScalers(baseline),
    });
  }

  return (
    <section className="section" id="scenario">
      <div className="panel-heading">
        <h2>
          Model an intervention
          <InfoTip>
            <p>Use this panel to adjust the simulation input variables to check how different policy interventions would alter long term financial and social costs.</p>
            <p>Each slider represents a real world domain affected by Opioid Use Disorder. The multiplier on the right alters the baseline trend:</p>
            <p><b>×1.00 (Default):</b> Represents the current baseline. No policy changes have been made.</p>
            <p><b>Under 1.00 (Decrease):</b> Simulates a reduction in events. For example, setting 'ER overdose visits' to ×0.80 models a harm reduction program that successfully prevents 20% of expected emergency room visits.</p>
            <p><b>Over 1.00 (Increase):</b> Simulates an expansion. For example, setting 'Outpatient MAT patients' to ×1.20 models a policy that successfully expands medication-assisted treatment capacity by 20%.</p>
          </InfoTip>
        </h2>

        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          {getBadgeCopy(selectedRegion)}
        </span>
      </div>

      {/* Region selector: National default plus all 50 US states */}
      <div className="mb-3">
        <label htmlFor="region-select" className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
          Region
        </label>
        <select
          id="region-select"
          value={selectedRegion}
          onChange={(e) => handleRegionChange(e.target.value)}
          disabled={running}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="National">National (Default)</option>
          <optgroup label="States">
            {US_STATES.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* ── Sliders ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="ledger">
          {SCALER_FIELDS.map((f) => (
            <div className="ledger-row" key={f.key}>
              <span className="ledger-row__label">
                {f.label}
                <span className="ledger-row__sub">{f.sub}</span>
              </span>
              <input
                className="slider"
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={scalers[f.key]}
                disabled={running}
                onChange={(e) => updateScaler(f.key, parseFloat(e.target.value))}
                aria-label={`${f.label} multiplier`}
              />
              <span className="ledger-row__value">×{scalers[f.key].toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="btn-row" style={{ alignItems: 'flex-end' }}>
          <button className="btn btn--primary" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run scenario'}
          </button>
          <button className="btn btn--ghost" onClick={handleReset} disabled={running}>
            Reset to baseline
          </button>

          <div className="field">
            <label htmlFor="n-sims">Simulations</label>
            <select
              id="n-sims"
              value={nSimulations}
              onChange={(e) => setNSimulations(parseInt(e.target.value, 10))}
              disabled={running}
            >
              {SIM_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="seed">Random seed</label>
            <input
              id="seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
              disabled={running}
              style={{ width: 100 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
