// src/App.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBaseline, postSimulate } from './api/client.js';
import Hero from './components/Hero.jsx';
import ScenarioPanel from './components/ScenarioPanel.jsx';
import YearRangePicker from './components/YearRangePicker.jsx';
import CostChart from './components/CostChart.jsx';
import DomainLedger from './components/DomainLedger.jsx';
import EquityBreakdown from './components/EquityBreakdown.jsx';
import NarrativePanel from './components/NarrativePanel.jsx';
import InfoTip from './components/InfoTip.jsx';
import { filterResultByYears } from './utils/filterResult.js';

const MIN_YEAR = 1999;
const MAX_YEAR = 2032;

export default function App() {
  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [yearRange, setYearRange] = useState([MIN_YEAR, MAX_YEAR]);

  const filteredResult = useMemo(
    () => filterResultByYears(result, yearRange[0], yearRange[1]),
    [result, yearRange]
  );
  const filteredPrevResult = useMemo(
    () => filterResultByYears(prevResult, yearRange[0], yearRange[1]),
    [prevResult, yearRange]
  );

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
      setResult(prev => { setPrevResult(prev); return res; });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="app-shell">
      <Hero result={filteredResult} prevResult={filteredPrevResult} loading={loading} />

      {error && (
        <div className="section" style={{ paddingBottom: 0 }}>
          <div className="error-banner error-banner--on-paper">{error}</div>
        </div>
      )}

      <div className="main-layout">
        <aside className="sidebar">
          <ScenarioPanel onRun={handleRun} running={loading} />
          <YearRangePicker
            startYear={yearRange[0]}
            endYear={yearRange[1]}
            minYear={MIN_YEAR}
            maxYear={MAX_YEAR}
            onChange={setYearRange}
          />
        </aside>

        <div className="content-pane">
          <div className="page-tabs">
            {[
              { id: 'about',      label: 'About'      },
              { id: 'trajectory', label: 'Trajectory' },
              { id: 'breakdown',  label: 'Breakdown'  },
              { id: 'narrative',  label: 'Narrative'  },
            ].map(t => (
              <button
                key={t.id}
                className={`page-tab${activeTab === t.id ? ' page-tab--active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'about' && (
            <div className="card about-panel">
              <h2>About This Simulator</h2>
              <p>This simulation represents the total financial and societal cost of Opioid Use Disorder (OUD) if we maintain the status quo and introduce no new policies. The timeline spans from 1999 to 2032, capturing both historical data and future projections to show exactly how these health, criminal justice, and economic costs snowball over time.</p>
              <p>Cumulative cost means this figure is not just an annual budget, it is the total, compounding financial impact aggregated over the entire 1999 - 2032 period. Because predicting the future involves uncertainty, our forecasting model is a Monte Carlo simulation. We ran this exact 33 year timeline through our computer model 1,000 different times, injecting slight variations each time to account for real world unpredictability. The median is the middle ground outcome of all 1,000 simulated futures.</p>
              <h3>How It Works</h3>
              <p>[Placeholder: Explain the Monte Carlo simulation approach, what inputs drive it, and how confidence intervals are produced.]</p>

              <h3>Background</h3>
              <p>[Placeholder: Context on the OUD crisis — prevalence, economic burden, why a cost-of-inaction framing matters.]</p>

              <h3>Data Sources</h3>
              <p>[Placeholder: List the datasets, studies, or agencies the cost estimates are drawn from.]</p>

              <h3>Limitations</h3>
              <p>[Placeholder: Caveats — synthetic estimates, geographic scope, what the model does not capture.]</p>
            </div>
          )}

          {activeTab === 'trajectory' && <CostChart result={filteredResult} />}

          {activeTab === 'breakdown' && (
            <>
              <div className="panel-heading">
                <h2>Where the money goes 
                  <InfoTip>
                    <p>To generate this demographic breakdown, we take the overall costs simulated by our mathematical engine and apply established, research backed national distribution percentages. This provides a reliable estimate of how these financial burdens are distributed across society.</p>
                    <p>The top panel showcases how the intervention would cover different aspects of the policy.</p>
                    <p>The bottom panel demonstrates which group would bear the most burden for OUD, in income bracket and also ethnicity groups.</p>
                  </InfoTip>
                </h2>
                <span className="eyebrow">Median cost share by domain &amp; equity overlay</span>
              </div>
              <div className="card">
                <DomainLedger result={filteredResult} prevResult={filteredPrevResult} />
              </div>
              <div className="card" style={{ marginTop: '16px' }}>
                <EquityBreakdown result={filteredResult} prevResult={filteredPrevResult} />
              </div>
            </>
          )}

          {activeTab === 'narrative' && <NarrativePanel result={filteredResult} />}
        </div>
      </div>

      <footer className="app-footer">
        Cost of Doing Nothing &middot; OUD Simulator &middot; figures are synthetic
        Monte Carlo estimates, not official statistics.
      </footer>
    </div>
  );
}
