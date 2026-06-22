// src/components/Hero.jsx
import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { useCountUp } from '../hooks/useCountUp.js';
import { formatCostShort, formatCostFull } from '../utils/format.js';
import InfoTip from './InfoTip.jsx';
import Delta from './Delta.jsx';

// Derive the annual cost for a given year from a cumulative trajectory array.
// Returns null when either boundary month is outside the filtered window.
function calcAnnualCost(trajectory, year) {
  if (!trajectory?.length) return null;
  const dec     = trajectory.find((r) => r.date === `${year}-12`);
  const decPrev = trajectory.find((r) => r.date === `${year - 1}-12`);
  if (!dec || !decPrev) return null;
  return dec.total - decPrev.total;
}

// Derive the gap between the last entry of two cumulative trajectory arrays.
// A positive result means the active scenario costs less than the baseline.
function calcNetSavings(activeTraj, baseTraj) {
  if (!activeTraj?.length || !baseTraj?.length) return 0;
  const baseEnd   = baseTraj[baseTraj.length - 1]?.total ?? 0;
  const activeEnd = activeTraj[activeTraj.length - 1]?.total ?? 0;
  return baseEnd - activeEnd;
}

export default function Hero({ result, prevResult, baselineResult, loading }) {
  const total = result?.summary?.total_cost_p50 ?? null;
  const lo    = result?.summary?.total_cost_p025 ?? null;
  const hi    = result?.summary?.total_cost_p975 ?? null;
  const animatedTotal = useCountUp(total, 1400);

  const sparkData =
    result?.cumulative?.total?.p50?.map((v, i) => ({ i, v })) ?? [];

  // Memoised so slider-driven re-renders do not repeat array traversal
  const annualCost2025 = useMemo(
    () => calcAnnualCost(result?.trajectory, 2025),
    [result?.trajectory],
  );

  const netSavings = useMemo(
    () => calcNetSavings(result?.trajectory, baselineResult?.trajectory),
    [result?.trajectory, baselineResult?.trajectory],
  );

  const hasSavings = netSavings > 0;

  return (
    <header className="hero">
      <div className="hero__inner">
        <div className="eyebrow eyebrow--on-ink">
          Opioid Action Engine &middot;{' '}
          {result?.metadata?.time_range ?? '1999 - 2032'}
        </div>
        <h1 className="hero__title">
          Cumulative cost if current trends continue, median of{' '}
          {result?.metadata?.n_simulations?.toLocaleString() ?? '-'} Monte Carlo runs
        </h1>

        <div className="hero__chart-wrap">
          {sparkData.length > 0 && (
            <div className="hero__chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={sparkData}
                  margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#a23b2e" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#a23b2e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={['auto', 'auto']} />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#c4543f"
                    strokeWidth={1.5}
                    fill="url(#sparkFill)"
                    isAnimationActive={true}
                    animationDuration={1200}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="hero__overlay">
            <p className="hero__total">
              {total != null ? formatCostFull(animatedTotal) : loading ? 'Loading...' : '-'}
              <Delta current={total} previous={prevResult?.summary?.total_cost_p50} />
            </p>
            {lo != null && hi != null && (
              <p className="hero__range">
                95% interval: <strong>{formatCostShort(lo)}</strong>
                <Delta current={lo} previous={prevResult?.summary?.total_cost_p025} />
                {' '}to{' '}
                <strong>{formatCostShort(hi)}</strong>
                <Delta current={hi} previous={prevResult?.summary?.total_cost_p975} />
                <InfoTip>
                  To quantify the accuracy for future simulation, we used a realistic
                  range based on our data and simulations. We are 95% confident that the
                  true, real world cost will fall somewhere between these lower and upper
                  bounds. It shows the best case and worst case scenarios if current
                  trends hold.
                </InfoTip>
              </p>
            )}
          </div>
        </div>

        
      </div>
    </header>
  );
}
