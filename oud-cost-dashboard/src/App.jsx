// src/App.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { postSimulate } from './api/client.js';
import { apiScalersForRegion } from './constants/indiana.js';
import Hero from './components/Hero.jsx';
import ScenarioPanel from './components/ScenarioPanel.jsx';
import YearRangePicker from './components/YearRangePicker.jsx';
import CostChart from './components/CostChart.jsx';
import DomainLedger from './components/DomainLedger.jsx';
import EquityBreakdown from './components/EquityBreakdown.jsx';
import NarrativePanel from './components/NarrativePanel.jsx';
import GeographyMap from './components/GeographyMap.jsx';
import CrisisConditionPanel from './components/CrisisConditionPanel.jsx';
import PrecedentSearch from './components/PrecedentSearch.jsx';
import PolicyDrafter from './components/PolicyDrafter.jsx';
import ImpactProjection from './components/ImpactProjection.jsx';
import InfoTip from './components/InfoTip.jsx';
import { filterResultByYears } from './utils/filterResult.js';

const MIN_YEAR = 1999;
const MAX_YEAR = 2032;

const TABS = [
  { id: 'about',             label: 'About'             },
  { id: 'problem-statement', label: 'Problem Statement' },
  { id: 'trajectory',        label: 'Trajectory'        },
  { id: 'breakdown',         label: 'Breakdown'         },
  { id: 'narrative',         label: 'Narrative'         },
  { id: 'policy-architect',  label: 'Policy Architect'  },
];

export default function App() {
  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);
  const [baselineResult, setBaselineResult] = useState(null);
  const [baselineTrajectory, setBaselineTrajectory] = useState(null);
  const [activeTrajectory, setActiveTrajectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [yearRange, setYearRange] = useState([MIN_YEAR, MAX_YEAR]);
  // Region drives both GeographyMap and ScenarioPanel slider defaults.
  const [selectedRegion, setSelectedRegion] = useState('Indiana');

  const filteredResult = useMemo(
    () => filterResultByYears(result, yearRange[0], yearRange[1]),
    [result, yearRange]
  );
  const filteredPrevResult = useMemo(
    () => filterResultByYears(prevResult, yearRange[0], yearRange[1]),
    [prevResult, yearRange]
  );
  const filteredBaselineResult = useMemo(
    () => filterResultByYears(baselineResult, yearRange[0], yearRange[1]),
    [baselineResult, yearRange]
  );

  // On first paint, POST /simulate with the initial region's scalers so the
  // Hero number immediately reflects Indiana's reality, not the neutral baseline.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const initial = await postSimulate({
          n_simulations: 1000,
          random_seed: 42,
          population_scalers: apiScalersForRegion('Indiana'),
        });
        if (mounted) {
          setResult(initial);
          setBaselineResult(initial);
          setBaselineTrajectory(initial.trajectory ?? null);
          setActiveTrajectory(initial.trajectory ?? null);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Called by "Run scenario" -- updates only the active trajectory.
  const handleRun = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const res = await postSimulate(params);
      setResult((prev) => { setPrevResult(prev); return res; });
      setActiveTrajectory(res.trajectory ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Called on region change -- locks a new baseline and resets active to match.
  const handleBaselineRun = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const res = await postSimulate(params);
      setResult((prev) => { setPrevResult(prev); return res; });
      setBaselineResult(res);
      setBaselineTrajectory(res.trajectory ?? null);
      setActiveTrajectory(res.trajectory ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Called by "Reset to baseline" -- no API call; restores locked baseline.
  const handleReset = useCallback(() => {
    setResult((prev) => { setPrevResult(prev); return baselineResult; });
    setActiveTrajectory(baselineTrajectory);
  }, [baselineResult, baselineTrajectory]);

  return (
    <div className="app-shell">
      <Hero
        result={filteredResult}
        prevResult={filteredPrevResult}
        baselineResult={filteredBaselineResult}
        loading={loading}
      />

      {error && (
        <div className="section" style={{ paddingBottom: 0 }}>
          <div className="error-banner error-banner--on-paper">{error}</div>
        </div>
      )}

      <div className="main-layout">
        <aside className="sidebar">
          <ScenarioPanel
            onRun={handleRun}
            onBaselineRun={handleBaselineRun}
            onReset={handleReset}
            running={loading}
            selectedRegion={selectedRegion}
            onRegionChange={setSelectedRegion}
          />
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
            {TABS.map((t) => (
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
              <p>Cumulative cost means this figure is not just an annual budget, it is the total, compounding financial impact aggregated over the entire 1999–2032 period. Because predicting the future involves uncertainty, our forecasting model is a Monte Carlo simulation. We ran this exact 33-year timeline through our computer model 1,000 different times, injecting slight variations each time to account for real-world unpredictability. The median is the middle-ground outcome of all 1,000 simulated futures.</p>
              <h3>Data Sources</h3>
              <p>Epidemiological Foundation:</p>
              <ul>
                <li>FDA/SOURCE system dynamics model</li>
                <li>NSDUH: National Survey on Drug Use and Health</li>
                <li>NVSS: National Vital Statistics System</li>
                <li>SAMHSA/TEDS: Treatment Episode Data Set</li>
              </ul>
              <p>Cost Calibration:</p>
              <ul>
                <li>MEPS: Medical Expenditure Panel Survey</li>
                <li>BJS: Bureau of Justice Statistics</li>
                <li>BLS: Bureau of Labor Statistics</li>
                <li>AFCARS: Adoption and Foster Care Analysis and Reporting System</li>
                <li>CDC WONDER overdose mortality data</li>
              </ul>
            </div>
          )}

          {activeTab === 'trajectory' && (
            <CostChart
              result={filteredResult}
              baselineTrajectory={filteredBaselineResult?.trajectory ?? null}
            />
          )}

          {activeTab === 'breakdown' && (
            <>
              <div className="panel-heading">
                <h2>
                  Where the money goes
                  <InfoTip>
                    <p>To generate this demographic breakdown, we take the overall costs simulated by our mathematical engine and apply established, research-backed national distribution percentages. This provides a reliable estimate of how these financial burdens are distributed across society.</p>
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

          {activeTab === 'problem-statement' && (
            <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr' }}>
              <GeographyMap selectedRegion={selectedRegion} />
              <CrisisConditionPanel selectedRegion={selectedRegion} />
            </div>
          )}

          {activeTab === 'narrative' && <NarrativePanel result={filteredResult} />}

          {activeTab === 'policy-architect' && (
            <div className="pa-stack">
              <PrecedentSearch />
              <PolicyDrafter result={filteredResult} />
              <ImpactProjection result={filteredResult} />
            </div>
          )}
        </div>
      </div>

      <footer className="app-footer">
        Opioid Action Engine &middot; figures are synthetic
        Monte Carlo estimates, not official statistics.
      </footer>
    </div>
  );
}
