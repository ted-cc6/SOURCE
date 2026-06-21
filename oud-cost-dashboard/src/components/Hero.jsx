// src/components/Hero.jsx
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { useCountUp } from '../hooks/useCountUp.js';
import { formatCostShort, formatCostFull } from '../utils/format.js';
import InfoTip from './InfoTip.jsx';
import Delta from './Delta.jsx';

export default function Hero({ result, prevResult, loading }) {
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
          <InfoTip>
            Cumulative cost means this figure is not just an annual budget, it is the total, compounding financial impact aggregated over the entire 1999 - 2032 period. Because predicting the future involves uncertainty, our forecasting model is a Monte Carlo simulation. We ran this exact 33 year timeline through our computer model 1,000 different times, injecting slight variations each time to account for real world unpredictability. The median is the middle ground outcome of all 1,000 simulated futures.
          </InfoTip>
        </h1>

        <div className="hero__chart-wrap">
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
          <div className="hero__overlay">
            <p className="hero__total">
              {total != null ? formatCostFull(animatedTotal) : loading ? 'Loading…' : '—'}
              <Delta current={total} previous={prevResult?.summary?.total_cost_p50} />
            </p>
            {lo != null && hi != null && (
              <p className="hero__range">
                95% interval: <strong>{formatCostShort(lo)}</strong>
                <Delta current={lo} previous={prevResult?.summary?.total_cost_p025} />
                {' '}to{' '}
                <strong>{formatCostShort(hi)}</strong>
                <Delta current={hi} previous={prevResult?.summary?.total_cost_p975} />
                <InfoTip>To quantify the accuracy for future simulation, we used a realistic range based on our data and simulations. We are 95% confident that the true, real world cost will fall somewhere between these lower and upper bounds. It shows the best case and worst case scenarios if current trends hold.</InfoTip>
              </p>
            )}
          </div>
        </div>
        
        
      </div>
    </header>
  );
}
