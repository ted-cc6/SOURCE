// src/components/NarrativePanel.jsx
import { useState } from 'react';
import { postGenerateSummary, postGeneratePersona } from '../api/client.js';
import InfoTip from './InfoTip.jsx';

const DOMAIN_OPTIONS = ['Healthcare', 'Justice', 'Economic', 'Child Welfare'];
const INCOME_OPTIONS = ['Below $30k', '$30k to $75k', 'Above $75k'];

export default function NarrativePanel({ result }) {
  return (
    <section className="section" id="narrative">
      <div className="panel-heading">
        <h2>Narrative 
          <InfoTip>
            <p>The section translates abstraction into real world context. Use these tools to generate actionable policy briefings and understand the localized, human impact of your selected interventions. </p>
            <p><b>Generate executive summary:</b> Give immediate, data backed insights to share with policy makers and communities.</p>
            <p><b>Case study generator:</b> Translate the intervention into the lived experience of a single family in your community. </p>
          </InfoTip>
        </h2>
        <span className="eyebrow">Requires a local LM Studio server</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <ExecutiveSummaryCard result={result} />
        <PersonaCard />
      </div>
    </section>
  );
}

function ExecutiveSummaryCard({ result }) {
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setText(null);
    try {
      const res = await postGenerateSummary(result);
      setText(res.executive_summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Executive summary</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Three sentences for a county health director, generated from the current
        scenario's totals, top cost domain, and equity breakdown.
      </p>
      <button className="btn btn--primary" onClick={handleGenerate} disabled={loading || !result}>
        {loading ? 'Generating…' : 'Generate executive summary'}
      </button>

      {error && <div className="error-banner error-banner--on-paper">{error}</div>}
      {text && <div className="narrative-output">{text}</div>}
    </div>
  );
}

function PersonaCard() {
  const [domain, setDomain] = useState(DOMAIN_OPTIONS[0]);
  const [incomeBracket, setIncomeBracket] = useState(INCOME_OPTIONS[0]);
  const [intervention, setIntervention] = useState('');
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setText(null);
    try {
      const res = await postGeneratePersona({
        domain,
        income_bracket: incomeBracket,
        intervention_applied: intervention.trim() || undefined,
      });
      setText(res.persona_narrative);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Human cost — case study</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        A ~150-word hypothetical case study for the selected domain and income bracket.
      </p>

      <div className="persona-grid">
        <div className="field">
          <label htmlFor="persona-domain">Domain</label>
          <select id="persona-domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
            {DOMAIN_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="persona-income">Income bracket</label>
          <select
            id="persona-income"
            value={incomeBracket}
            onChange={(e) => setIncomeBracket(e.target.value)}
          >
            {INCOME_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="persona-intervention">Policy context (optional)</label>
        <input
          id="persona-intervention"
          type="text"
          placeholder="e.g. Expanded MAT Access"
          value={intervention}
          onChange={(e) => setIntervention(e.target.value)}
        />
      </div>

      <button className="btn btn--primary" onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating…' : 'Generate case study'}
      </button>

      {error && <div className="error-banner error-banner--on-paper">{error}</div>}
      {text && <div className="narrative-output">{text}</div>}
    </div>
  );
}
