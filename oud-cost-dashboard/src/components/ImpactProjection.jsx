// src/components/ImpactProjection.jsx
import { useState } from 'react';
import { postProjectImpact } from '../api/client.js';

const COMMUNITY_FOCUS = 'Indiana rural and urban communities';

export default function ImpactProjection({ result }) {
  const [narrative, setNarrative] = useState(null);
  const [themes, setThemes]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setNarrative(null);
    setThemes([]);
    try {
      const outcomes = result?.summary
        ? {
            total_cost_p50:      result.summary.total_cost_p50,
            domain_shares_pct:   result.summary.domain_shares_pct,
            equity_distribution: result.equity_distribution ?? {},
          }
        : {};
      const data = await postProjectImpact(outcomes, COMMUNITY_FOCUS);
      setNarrative(data.narrative);
      setThemes(data.key_themes ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const hasOutput = narrative || error;

  return (
    <div className="card">
      <div className="pa-section-label">Section 03</div>
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>Local Impact Projection</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Translate the active simulation data into a qualitative community outcome
        narrative. Gemini describes what the current policy choices mean for
        families and individuals across Indiana - not as statistics, but as a
        lived experience.
      </p>

      <button
        className="btn btn--primary"
        onClick={handleGenerate}
        disabled={loading}
        style={loading ? { display: 'flex', alignItems: 'center', gap: 6 } : {}}
      >
        {loading && <span className="spinner" style={{ width: 14, height: 14 }} />}
        {loading ? 'Generating...' : 'Generate Community Outcome Narrative'}
      </button>

      {error && (
        <div className="error-banner error-banner--on-paper" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}

      {!hasOutput && !loading && (
        <div className="pa-empty-state">
          Click the button above to generate a qualitative narrative based on
          the currently active simulation parameters. The story will shift as
          your policy scenario changes.
        </div>
      )}

      {loading && (
        <div className="pa-loading-row">
          <span className="spinner" />
          Composing community narrative...
        </div>
      )}

      {narrative && (
        <div style={{ marginTop: 20 }}>
          <div className="pa-narrative-output">{narrative}</div>

          {themes.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Key themes identified
              </div>
              <div className="pa-theme-row">
                {themes.map((theme, i) => (
                  <span key={i} className="pa-theme-pill">{theme}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
