// src/components/PolicyDrafter.jsx
import { useState } from 'react';
import { postDraftPolicy } from '../api/client.js';

const FOCUS_AREAS = [
  'Expand MAT Access',
  'Harm Reduction',
  'Decriminalize Non-Violent Offenses',
  'Foster Care Support',
];

const AMBITION_LEVELS = [
  'Incremental Pilot',
  'Moderate Expansion',
  'Aggressive Overhaul',
];

// Pre-computed slider recommendations keyed by [focusArea][ambitionLevel].
// Values are multipliers matching the ScenarioPanel SCALER_FIELDS keys.
// These tell the user exactly what to dial in on the left sidebar to test
// the drafted policy against the Monte Carlo engine.
const SIM_PARAMS = {
  'Expand MAT Access': {
    'Incremental Pilot': {
      outpatient_mat_count: 1.10,
    },
    'Moderate Expansion': {
      outpatient_mat_count: 1.20,
      inpatient_rehab_count: 1.10,
    },
    'Aggressive Overhaul': {
      outpatient_mat_count: 1.35,
      inpatient_rehab_count: 1.20,
      er_visit_overdose_count: 0.90,
    },
  },
  'Harm Reduction': {
    'Incremental Pilot': {
      er_visit_overdose_count: 0.95,
    },
    'Moderate Expansion': {
      er_visit_overdose_count: 0.85,
      lost_productivity_count: 0.95,
    },
    'Aggressive Overhaul': {
      er_visit_overdose_count: 0.80,
      police_arrest_count: 0.90,
      lost_productivity_count: 0.90,
    },
  },
  'Decriminalize Non-Violent Offenses': {
    'Incremental Pilot': {
      police_arrest_count: 0.90,
    },
    'Moderate Expansion': {
      police_arrest_count: 0.80,
      incarceration_count: 0.85,
    },
    'Aggressive Overhaul': {
      police_arrest_count: 0.70,
      incarceration_count: 0.70,
      lost_productivity_count: 0.95,
    },
  },
  'Foster Care Support': {
    'Incremental Pilot': {
      foster_care_risk_count: 0.95,
    },
    'Moderate Expansion': {
      foster_care_risk_count: 0.85,
      outpatient_mat_count: 1.10,
    },
    'Aggressive Overhaul': {
      foster_care_risk_count: 0.75,
      outpatient_mat_count: 1.20,
      lost_productivity_count: 0.90,
    },
  },
};

const SLIDER_LABELS = {
  outpatient_mat_count:    'Outpatient MAT patients',
  inpatient_rehab_count:   'Inpatient rehab admissions',
  er_visit_overdose_count: 'ER overdose visits',
  police_arrest_count:     'Police arrests',
  incarceration_count:     'Incarceration',
  lost_productivity_count: 'Lost productivity pool',
  foster_care_risk_count:  'Foster care risk',
};

export default function PolicyDrafter({ result }) {
  const [focusArea, setFocusArea]       = useState(FOCUS_AREAS[0]);
  const [ambitionLevel, setAmbitionLevel] = useState(AMBITION_LEVELS[0]);
  const [draft, setDraft]               = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  async function handleDraft() {
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const stateData = result?.summary
        ? {
            total_cost_p50:    result.summary.total_cost_p50,
            domain_shares_pct: result.summary.domain_shares_pct,
          }
        : {};
      const data = await postDraftPolicy(focusArea, ambitionLevel, stateData);
      setDraft(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const simParams = SIM_PARAMS[focusArea]?.[ambitionLevel] ?? {};

  return (
    <div className="card">
      <div className="pa-section-label">Section 02</div>
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>Interactive Policy Drafter</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>
        Select a focus area and ambition level. Gemini will generate formal legislative
        language, then this panel will translate that policy into exact simulator settings
        you can apply in the left sidebar.
      </p>

      <div className="pa-form-grid">
        <div className="field">
          <label htmlFor="pa-focus">Focus Area</label>
          <select
            id="pa-focus"
            value={focusArea}
            onChange={(e) => { setFocusArea(e.target.value); setDraft(null); }}
            disabled={loading}
          >
            {FOCUS_AREAS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pa-ambition">Ambition Level</label>
          <select
            id="pa-ambition"
            value={ambitionLevel}
            onChange={(e) => { setAmbitionLevel(e.target.value); setDraft(null); }}
            disabled={loading}
          >
            {AMBITION_LEVELS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <button
        className="btn btn--primary"
        onClick={handleDraft}
        disabled={loading}
        style={loading ? { display: 'flex', alignItems: 'center', gap: 6 } : {}}
      >
        {loading && <span className="spinner" style={{ width: 14, height: 14 }} />}
        {loading ? 'Drafting...' : 'Draft Legislation'}
      </button>

      {error && (
        <div className="error-banner error-banner--on-paper" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}

      {draft && (
        <>
          <LegislativeDocument
            draft={draft}
            ambitionLevel={ambitionLevel}
          />
          <SimParamsCallout params={simParams} />
        </>
      )}
    </div>
  );
}

function LegislativeDocument({ draft, ambitionLevel }) {
  return (
    <div className="pa-bill">
      <div className="pa-bill__header">
        <div className="pa-bill__meta">State of Indiana - Legislative Draft</div>
        <h4 className="pa-bill__title">{draft.title}</h4>
        <div className="pa-bill__subtitle">
          Ambition Level: {ambitionLevel} | AI Legislative Drafter
        </div>
      </div>

      <div className="pa-bill__body">{draft.summary}</div>

      {draft.provisions?.length > 0 && (
        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
          <div className="pa-bill__provisions-label">Key Provisions</div>
          <ol className="pa-bill__provisions">
            {draft.provisions.map((provision, i) => (
              <li key={i}>{provision}</li>
            ))}
          </ol>
        </div>
      )}

      {draft.fiscal_note && (
        <div className="pa-fiscal-note" style={{ marginTop: 16 }}>
          <span className="pa-fiscal-note__label">Fiscal Note</span>
          {draft.fiscal_note}
        </div>
      )}
    </div>
  );
}

function SimParamsCallout({ params }) {
  const entries = Object.entries(params);
  if (entries.length === 0) return null;

  return (
    <div className="pa-sim-callout">
      <div className="pa-sim-callout__heading">
        Recommended Simulation Parameters
      </div>
      <p className="pa-sim-callout__desc">
        To test this policy in the simulator, apply the following multipliers
        using the sliders in the left-hand control panel, then click "Run scenario".
      </p>
      <div>
        {entries.map(([key, value]) => (
          <div key={key} className="pa-sim-row">
            <span>{SLIDER_LABELS[key] ?? key}</span>
            <span
              className="pa-sim-row__value"
              style={{ color: value >= 1 ? 'var(--sage)' : 'var(--rust)' }}
            >
              x{value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
