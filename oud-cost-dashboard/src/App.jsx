// src/App.jsx
import { useCallback, useEffect, useState } from 'react';
import { getBaseline, postSimulate } from './api/client.js';
import Hero from './components/Hero.jsx';
import ScenarioPanel from './components/ScenarioPanel.jsx';
import CostChart from './components/CostChart.jsx';
import DomainLedger from './components/DomainLedger.jsx';
import EquityBreakdown from './components/EquityBreakdown.jsx';
import NarrativePanel from './components/NarrativePanel.jsx';

export default function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load the cached baseline on first paint — this is intentionally cheap
  // server-side (precomputed at startup), so the dashboard renders fast.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const baseline = await getBaseline();
        if (mounted) setResult(baseline);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleRun = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const res = await postSimulate(params);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="app-shell">
      <Hero result={result} loading={loading} />

      {error && (
        <div className="section" style={{ paddingBottom: 0 }}>
          <div className="error-banner error-banner--on-paper">{error}</div>
        </div>
      )}

      <ScenarioPanel onRun={handleRun} running={loading} />

      <CostChart result={result} />

      <section className="section">
        <div className="panel-heading">
          <h2>Where the money goes</h2>
          <span className="eyebrow">Median cost share by domain &amp; equity overlay</span>
        </div>
        <div className="grid-two">
          <div className="card">
            <DomainLedger result={result} />
          </div>
          <div className="card">
            <EquityBreakdown result={result} />
          </div>
        </div>
      </section>

      <NarrativePanel result={result} />

      <footer className="app-footer">
        Cost of Doing Nothing &middot; OUD Simulator &middot; figures are synthetic
        Monte Carlo estimates, not official statistics.
      </footer>
    </div>
  );
}
