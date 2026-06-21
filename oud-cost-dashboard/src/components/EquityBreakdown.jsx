// src/components/EquityBreakdown.jsx
import { useState } from 'react';
import { formatCostShort } from '../utils/format.js';
import Delta from './Delta.jsx';

const CATEGORY_TABS = [
  { key: 'income_bracket', label: 'Income bracket' },
  { key: 'race_ethnicity', label: 'Race / ethnicity' },
];

const LABEL_OVERRIDES = {
  below_30k: 'Below $30k',
  '30k_to_75k': '$30k–$75k',
  above_75k: 'Above $75k',
  white_non_hispanic: 'White (non-Hispanic)',
  black_non_hispanic: 'Black (non-Hispanic)',
  hispanic: 'Hispanic',
  american_indian_ak: 'American Indian / AK Native',
  asian_pacific: 'Asian / Pacific Islander',
  other_multiracial: 'Other / multiracial',
};

function prettyLabel(key) {
  return LABEL_OVERRIDES[key] ?? key.replace(/_/g, ' ');
}

export default function EquityBreakdown({ result, prevResult }) {
  const [category, setCategory] = useState('income_bracket');
  const splits = result?.equity_distribution?.[category];
  const prevSplits = prevResult?.equity_distribution?.[category];

  return (
    <div>
      <div className="domain-tabs" style={{ marginBottom: 14 }}>
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.key}
            className={`domain-tab ${category === t.key ? 'domain-tab--active' : ''}`}
            onClick={() => setCategory(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!splits ? (
        <p className="skeleton-text">Waiting for simulation data…</p>
      ) : (
        Object.entries(splits)
          .sort((a, b) => b[1] - a[1])
          .map(([key, dollars]) => {
            const max = Math.max(...Object.values(splits));
            const prevDollars = prevSplits?.[key] ?? null;
            return (
              <div className="bar-row" key={key}>
                <div className="bar-row__top">
                  <span className="bar-row__label">{prettyLabel(key)}</span>
                  <span className="bar-row__value">
                    {formatCostShort(dollars)}
                    <Delta current={dollars} previous={prevDollars} />
                  </span>
                </div>
                <div className="bar-row__track">
                  <div
                    className="bar-row__fill"
                    style={{ width: `${(dollars / max) * 100}%`, background: '#b9853a' }}
                  />
                </div>
              </div>
            );
          })
      )}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 14, marginBottom: 0 }}>
        These splits apply fixed national demographic burden percentages to the
        simulated median total cost — they are not independently modeled by the
        Monte Carlo engine. See SYNTHETIC_DEMOGRAPHICS in main.py for sourcing.
      </p>
    </div>
  );
}
