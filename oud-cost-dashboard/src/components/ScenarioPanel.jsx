// src/components/ScenarioPanel.jsx
import { useState } from 'react';
import InfoTip from './InfoTip.jsx';

// Mirrors the valid population_scalers keys documented in main.py's
// SimulationRequest. Label/sub copy describes the lever in plain terms.
const SCALER_FIELDS = [
  { key: 'outpatient_mat_count', label: 'Outpatient MAT patients', sub: 'Medication-assisted treatment access' },
  { key: 'inpatient_rehab_count', label: 'Inpatient rehab admissions', sub: '30-day residential treatment entries' },
  { key: 'er_visit_overdose_count', label: 'ER overdose visits', sub: 'Emergency department contact' },
  { key: 'police_arrest_count', label: 'Police arrests', sub: 'Drug-related arrest events' },
  { key: 'incarceration_count', label: 'Incarceration', sub: 'People incarcerated at any time' },
  { key: 'lost_productivity_count', label: 'Lost productivity pool', sub: 'Untreated OUD, employment impact' },
  { key: 'foster_care_risk_count', label: 'Foster care risk', sub: 'Children in at-risk households' },
];

const SIM_COUNT_OPTIONS = [500, 1000, 2500, 5000, 10000];

function defaultScalers() {
  return SCALER_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: 1 }), {});
}

export default function ScenarioPanel({ onRun, running }) {
  const [scalers, setScalers] = useState(defaultScalers());
  const [nSimulations, setNSimulations] = useState(1000);
  const [seed, setSeed] = useState(42);

  function updateScaler(key, value) {
    setScalers((prev) => ({ ...prev, [key]: value }));
  }

  function handleRun() {
    // Only send scalers that differ from 1.0 — keeps the request payload
    // minimal and matches the "baseline = no intervention" convention
    // the backend uses for population_scalers_applied.
    const changed = Object.fromEntries(
      Object.entries(scalers).filter(([, v]) => Math.abs(v - 1) > 1e-6)
    );
    onRun({
      n_simulations: nSimulations,
      random_seed: seed,
      population_scalers: Object.keys(changed).length ? changed : undefined,
    });
  }

  function handleReset() {
    setScalers(defaultScalers());
    onRun({ n_simulations: nSimulations, random_seed: seed });
  }

  return (
    <section className="section" id="scenario">
      <div className="panel-heading">
        <h2>Model an intervention 
          <InfoTip>
            <p>Use this panel to adjust the simulation input variables to check how different policy interventions would alter long term financial and social costs.</p>
            <p>Each slider represents a real world domain affected by Opioid Use Disorder. The multiplier on the right alters the baseline trend:</p>
            
            <p><b>×1.00 (Default):</b> Represents the current baseline. No policy changes have been made.</p>
            <p><b>Under 1.00 (Decrease):</b> Simulates a reduction in events. For example, setting 'ER overdose visits' to ×0.80 models a harm reduction program that successfully prevents 20% of expected emergency room visits.</p>
            <p><b>Over 1.00 (Increase):</b> Simulates an expansion. For example, setting 'Outpatient MAT patients' to ×1.20 models a policy that successfully expands medication-assisted treatment capacity by 20%.</p>
          
          </InfoTip>
        </h2>
      </div>

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
            Reset
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
