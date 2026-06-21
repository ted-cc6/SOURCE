// src/components/PrecedentSearch.jsx
import { useState } from 'react';
import { postSearchPrecedents } from '../api/client.js';

const CHIPS = [
  { label: 'Justice Reform',  query: 'pre-arrest diversion law enforcement OUD justice reform' },
  { label: 'Harm Reduction',  query: 'harm reduction naloxone syringe exchange overdose prevention' },
  { label: 'Rural Support',   query: 'rural OUD syringe services Indiana county program' },
];

export default function PrecedentSearch() {
  const [query, setQuery]     = useState('');
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  async function runSearch(overrideQuery) {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setRecords(null);
    try {
      const data = await postSearchPrecedents(q, 3);
      setRecords(data.records);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleChip(chip) {
    setQuery(chip.query);
    runSearch(chip.query);
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch();
  }

  return (
    <div className="card">
      <div className="pa-section-label">Section 01</div>
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>Precedent Engine</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Search our local vector database of historical US public health interventions.
        Results are retrieved by semantic similarity, not keyword matching.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search historical interventions..."
          aria-label="Search historical interventions"
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          className="btn btn--primary"
          disabled={loading || !query.trim()}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="pa-chip-row">
        <span className="pa-chip-label">Suggested:</span>
        {CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="domain-tab"
            onClick={() => handleChip(chip)}
            disabled={loading}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="pa-loading-row">
          <span className="spinner" />
          Querying vector store...
        </div>
      )}

      {error && (
        <div className="error-banner error-banner--on-paper" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}

      {records && records.length === 0 && (
        <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
          No matching precedents found. Try broadening your search terms.
        </p>
      )}

      {records && records.length > 0 && (
        <div className="pa-card-grid">
          {records.map((record, i) => (
            <PrecedentCard key={i} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrecedentCard({ record }) {
  return (
    <div className="pa-precedent-card">
      <div className="pa-section-label" style={{ marginBottom: 0 }}>
        Intervention Record
      </div>

      <h4 className="pa-precedent-card__title">{record.title}</h4>

      <p className="pa-precedent-card__summary">{record.summary}</p>

      <div className="pa-impact-badge">
        <span className="pa-impact-badge__label">Measured Impact</span>
        {record.impact}
      </div>
    </div>
  );
}
