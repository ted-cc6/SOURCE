// src/components/CostChart.jsx
import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCostShort } from '../utils/format.js';
import InfoTip from './InfoTip.jsx';

// Stacked bottom-to-top: economic is the dominant cost category and anchors the base.
const STACK_LAYERS = [
  { key: 'economic',     label: 'Economic',      color: '#7c3a2b' },
  { key: 'healthcare',   label: 'Healthcare',    color: '#2e6b5a' },
  { key: 'justice',      label: 'Justice',       color: '#2b4a6e' },
  { key: 'childWelfare', label: 'Child Welfare', color: '#b57d30' },
];

// Epidemiological turning points grounded in OUD policy literature
const MILESTONES = [
  { date: '2010-01', label: '2010: Pill Mill Crackdown' },
  { date: '2014-01', label: '2014: Fentanyl Emergence'  },
  { date: '2020-01', label: '2020: Pandemic Disruption' },
];

const GHOST_COLOR = '#9aa0ac';

// "2026-01" -> "Jan 2026" without Date() UTC-offset edge cases on YYYY-MM strings
function formatDateLabel(yyyyMm) {
  if (!yyyyMm) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [year, mo] = yyyyMm.split('-');
  return `${MONTHS[parseInt(mo, 10) - 1]} ${year}`;
}

// Rotated SVG text label rendered at the top of a ReferenceLine, reading top-to-bottom
function MilestoneLabel({ viewBox, label }) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  return (
    <text
      x={x + 4}
      y={y + 4}
      fontSize={9}
      fill={GHOST_COLOR}
      fontFamily="IBM Plex Mono, monospace"
      opacity={0.65}
      textAnchor="start"
      transform={`rotate(90, ${x + 4}, ${y + 4})`}
    >
      {label}
    </text>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const domainEntries = payload.filter((e) => e.dataKey !== 'baselineTotal');
  const baselineEntry = payload.find((e) => e.dataKey === 'baselineTotal');
  const total  = domainEntries.reduce((sum, e) => sum + (e.value ?? 0), 0);
  const saving = baselineEntry?.value != null ? baselineEntry.value - total : null;

  return (
    <div
      style={{
        background: '#14181f',
        color: '#e7e4dc',
        padding: '10px 14px',
        borderRadius: 3,
        fontSize: 12.5,
        fontFamily: "'IBM Plex Mono', monospace",
        minWidth: 220,
      }}
    >
      <div style={{ marginBottom: 6, color: '#8d94a1' }}>{formatDateLabel(label)}</div>

      {/* Domain breakdown - reversed so top layer reads first */}
      {[...domainEntries].reverse().map((entry) => (
        <div
          key={entry.dataKey}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            color: entry.color,
            marginBottom: 2,
          }}
        >
          <span>{entry.name}</span>
          <span>{formatCostShort(entry.value)}</span>
        </div>
      ))}

      {/* Active scenario total */}
      <div
        style={{
          borderTop: '1px solid #2d3340',
          marginTop: 6,
          paddingTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Total</span>
        <span>{formatCostShort(total)}</span>
      </div>

      {/* Baseline and saving rows - only rendered when ghost line data is present */}
      {baselineEntry?.value != null && (
        <div
          style={{
            borderTop: '1px solid #2d3340',
            marginTop: 4,
            paddingTop: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: GHOST_COLOR,
            }}
          >
            <span>Baseline</span>
            <span>{formatCostShort(baselineEntry.value)}</span>
          </div>
          {saving !== null && saving > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#2e6b5a',
                marginTop: 2,
              }}
            >
              <span>Saving</span>
              <span>{formatCostShort(saving)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CostChart({ result, baselineTrajectory }) {
  const data = result?.trajectory ?? [];
  const tickInterval = Math.max(1, Math.floor(data.length / 6));

  // Merge baseline total into each active row so the ghost Line can reference "baselineTotal"
  // without needing its own separate data array.
  const mergedData = useMemo(() => {
    if (!data.length || !baselineTrajectory?.length) return data;
    const baseMap = new Map(baselineTrajectory.map((r) => [r.date, r.total]));
    return data.map((row) => ({ ...row, baselineTotal: baseMap.get(row.date) }));
  }, [data, baselineTrajectory]);

  // Filter milestones to only those dates that exist in the current year-range window
  const activeDates = useMemo(() => new Set(mergedData.map((r) => r.date)), [mergedData]);
  const visibleMilestones = MILESTONES.filter((m) => activeDates.has(m.date));

  return (
    <section className="section" id="trajectory">
      <div className="panel-heading">
        <h2>
          Cumulative cost trajectory
          <InfoTip>
            <p>Each colored band is one cost domain stacked on top of the others. The total height at any date is the combined cumulative OUD burden from 1999 to that point - not an annual figure, but an ever-growing running total.</p>
            <p>The dashed gray line traces the unmitigated baseline - the "cost of doing nothing" trajectory. Run a scenario with the sliders to create a gap between the stacked areas and the baseline line: that gap represents projected policy savings.</p>
            <p>Vertical markers denote three pivotal epidemiological moments that reshaped the OUD cost trajectory.</p>
          </InfoTip>
        </h2>

        {/* Legend: domain swatches (top layer listed first) + ghost line indicator */}
        <div
          style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            marginTop: 6,
            alignItems: 'center',
          }}
        >
          {[...STACK_LAYERS].reverse().map((d) => (
            <span
              key={d.key}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: d.color,
                  display: 'inline-block',
                  opacity: 0.85,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: '#5d6168',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {d.label}
              </span>
            </span>
          ))}

          {/* Ghost line swatch - inline SVG dashed line */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width={18} height={10} aria-hidden="true">
              <line
                x1={0} y1={5} x2={18} y2={5}
                stroke={GHOST_COLOR}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.75}
              />
            </svg>
            <span
              style={{
                fontSize: 11,
                color: '#5d6168',
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              Baseline (no action)
            </span>
          </span>
        </div>
      </div>

      <div className="card" style={{ height: 360 }}>
        {mergedData.length === 0 ? (
          <p className="skeleton-text">Waiting for simulation data...</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={mergedData}
              margin={{ top: 8, right: 12, bottom: 0, left: 8 }}
            >
              <defs>
                {STACK_LAYERS.map((d) => (
                  <linearGradient
                    key={d.key}
                    id={`grad-${d.key}`}
                    x1="0" y1="0" x2="0" y2="1"
                  >
                    <stop offset="0%"   stopColor={d.color} stopOpacity={0.92} />
                    <stop offset="100%" stopColor={d.color} stopOpacity={0.72} />
                  </linearGradient>
                ))}
              </defs>

              <CartesianGrid stroke="#d9d4c6" vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(0, 4)}
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

              {/* Stacked domain areas - rendered first so they form the base layer */}
              {STACK_LAYERS.map((d) => (
                <Area
                  key={d.key}
                  type="monotone"
                  dataKey={d.key}
                  name={d.label}
                  stackId="1"
                  stroke={d.color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${d.key})`}
                  fillOpacity={1}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}

              {/* Vertical milestone markers - subtle background structural guides */}
              {visibleMilestones.map((m) => (
                <ReferenceLine
                  key={m.date}
                  x={m.date}
                  stroke={GHOST_COLOR}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  strokeOpacity={0.35}
                  label={<MilestoneLabel label={m.label} />}
                />
              ))}

              {/* Ghost line: unmitigated baseline total - no stackId so it floats freely */}
              <Line
                type="monotone"
                dataKey="baselineTotal"
                name="Baseline (no action)"
                stroke={GHOST_COLOR}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                strokeOpacity={0.75}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
