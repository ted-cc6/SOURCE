// src/components/CostChart.jsx
import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCostShort, formatCostFull, formatMonthLabel } from '../utils/format.js';
import InfoTip from './InfoTip.jsx';

const DOMAIN_TABS = [
  { key: 'total', label: 'Total', color: '#a23b2e' },
  { key: 'healthcare', label: 'Healthcare', color: '#3c5a73' },
  { key: 'justice', label: 'Justice', color: '#b9853a' },
  { key: 'economic', label: 'Economic', color: '#5c7a5e' },
  { key: 'child_welfare', label: 'Child Welfare', color: '#7a4b6b' },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      style={{
        background: '#14181f',
        color: '#e7e4dc',
        padding: '10px 12px',
        borderRadius: 3,
        fontSize: 12.5,
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <div style={{ marginBottom: 4, color: '#8d94a1' }}>{formatMonthLabel(label)}</div>
      <div>median: {formatCostFull(row.p50)}</div>
      <div style={{ color: '#8d94a1' }}>
        95% CI: {formatCostFull(row.base)} – {formatCostFull(row.base + row.band)}
      </div>
    </div>
  );
}

export default function CostChart({ result }) {
  const [domain, setDomain] = useState('total');
  const activeTab = DOMAIN_TABS.find((d) => d.key === domain);

  const data = useMemo(() => {
    if (!result?.cumulative?.[domain] || !result?.months) return [];
    const series = result.cumulative[domain];
    return result.months.map((month, i) => {
      const lo = series.p025[i];
      const hi = series.p975[i];
      return {
        month,
        base: lo,
        band: hi - lo,
        p50: series.p50[i],
      };
    });
  }, [result, domain]);

  // Sparse tick marks: aim for roughly 6 labels across the horizon
  const tickInterval = Math.max(1, Math.floor(data.length / 6));

  return (
    <section className="section" id="trajectory">
      <div className="panel-heading">
        <h2>Cumulative cost trajectory 
          <InfoTip>
            <p>This chart displays cumulative costs, meaning each point on the line is the total running sum of all expenses added up from 1999 to that specific date. It is not an annual budget. Instead, it visualizes how costs continuously layer on top of each other and snowball over time if no action is taken.</p>
            <p>The solid center line tracks the median path across all simulations. Because forecasting decades into the future involves unpredictability, the lighter shaded area surrounding the line represents our 95% range of uncertainty. This shows the best case and worst case cost trajectories based on statistical volatility.</p>
          </InfoTip>
        </h2>
        <div className="domain-tabs">
          {DOMAIN_TABS.map((t) => (
            <button
              key={t.key}
              className={`domain-tab ${domain === t.key ? 'domain-tab--active' : ''}`}
              onClick={() => setDomain(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ height: 360 }}>
        {data.length === 0 ? (
          <p className="skeleton-text">Waiting for simulation data…</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={activeTab.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={activeTab.color} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#d9d4c6" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthLabel}
                interval={tickInterval}
                tick={{ fontFamily: 'IBM Plex Mono', fontSize: 11, fill: '#5d6168' }}
                axisLine={{ stroke: '#d9d4c6' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCostShort}
                tick={{ fontFamily: 'IBM Plex Mono', fontSize: 11, fill: '#5d6168' }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip content={<CustomTooltip />} />
              {/* Invisible base area lifts the visible band to start at p025 */}
              <Area type="monotone" dataKey="base" stackId="ci" stroke="none" fill="transparent" />
              <Area
                type="monotone"
                dataKey="band"
                stackId="ci"
                stroke="none"
                fill="url(#bandFill)"
                name="95% interval"
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke={activeTab.color}
                strokeWidth={2}
                dot={false}
                name="Median"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
