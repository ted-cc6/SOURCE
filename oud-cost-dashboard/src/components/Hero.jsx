// src/components/Hero.jsx
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { useCountUp } from '../hooks/useCountUp.js';
import { formatCostShort, formatCostFull } from '../utils/format.js';

export default function Hero({ result, loading }) {
  const total = result?.summary?.total_cost_p50 ?? null;
  const lo = result?.summary?.total_cost_p025 ?? null;
  const hi = result?.summary?.total_cost_p975 ?? null;
  const animatedTotal = useCountUp(total, 1400);

  const sparkData =
    result?.cumulative?.total?.p50?.map((v, i) => ({ i, v })) ?? [];

  return (
    <header className="hero">
      <div className="hero__inner">
        <div className="eyebrow eyebrow--on-ink">
          Cost of Doing Nothing &middot; Opioid Use Disorder &middot;{' '}
          {result?.metadata?.time_range ?? '1999 → 2032'}
        </div>
        <h1 className="hero__title">
          Cumulative cost if current trends continue, median of{' '}
          {result?.metadata?.n_simulations?.toLocaleString() ?? '—'} Monte Carlo runs
        </h1>

        <p className="hero__total">
          {total != null ? formatCostFull(animatedTotal) : loading ? 'Loading…' : '—'}
        </p>

        {lo != null && hi != null && (
          <p className="hero__range">
            95% interval: <strong>{formatCostShort(lo)}</strong> to{' '}
            <strong>{formatCostShort(hi)}</strong>
          </p>
        )}

        {sparkData.length > 0 && (
          <div className="hero__chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a23b2e" stopOpacity={0.55} />
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

        <p className="hero__status">
          {loading
            ? 'Running simulation…'
            : result
            ? 'Adjust the levers below to model an intervention.'
            : 'Connecting to the simulation API…'}
        </p>
      </div>
    </header>
  );
}
