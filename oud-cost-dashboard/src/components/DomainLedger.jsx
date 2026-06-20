// src/components/DomainLedger.jsx
import { formatCostShort } from '../utils/format.js';

const DOMAIN_META = {
  healthcare: { label: 'Healthcare', color: '#3c5a73' },
  justice: { label: 'Justice', color: '#b9853a' },
  economic: { label: 'Economic', color: '#5c7a5e' },
  child_welfare: { label: 'Child Welfare', color: '#7a4b6b' },
};

export default function DomainLedger({ result }) {
  const shares = result?.summary?.domain_shares_pct;
  const total = result?.summary?.total_cost_p50;
  if (!shares || total == null) {
    return <p className="skeleton-text">Waiting for simulation data…</p>;
  }

  const rows = Object.entries(shares)
    .map(([key, pct]) => ({
      key,
      pct,
      dollars: total * (pct / 100),
      ...DOMAIN_META[key],
    }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <div>
      {rows.map((r) => (
        <div className="bar-row" key={r.key}>
          <div className="bar-row__top">
            <span className="bar-row__label">{r.label}</span>
            <span className="bar-row__value">
              {formatCostShort(r.dollars)} &middot; {r.pct.toFixed(1)}%
            </span>
          </div>
          <div className="bar-row__track">
            <div
              className="bar-row__fill"
              style={{ width: `${r.pct}%`, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
