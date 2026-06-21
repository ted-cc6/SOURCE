export default function YearRangePicker({ startYear, endYear, minYear, maxYear, onChange }) {
  const range = maxYear - minYear;
  const pctStart = ((startYear - minYear) / range) * 100;
  const pctEnd   = ((endYear   - minYear) / range) * 100;

  function handleStart(e) {
    const val = Math.min(parseInt(e.target.value), endYear - 1);
    onChange([val, endYear]);
  }

  function handleEnd(e) {
    const val = Math.max(parseInt(e.target.value), startYear + 1);
    onChange([startYear, val]);
  }

  return (
    <section className="section" id="year-range">
      <div className="panel-heading">
        <h2>Time window</h2>
        <span className="eyebrow">Cumulative period</span>
      </div>
      <div className="card">
        <div className="dual-range-labels">
          <span className="dual-range-label">{startYear}</span>
          <span className="dual-range-label">{endYear}</span>
        </div>
        <div
          className="dual-range"
          style={{ '--pct-start': `${pctStart}%`, '--pct-end': `${pctEnd}%` }}
        >
          <input
            type="range"
            className="dual-range__input"
            min={minYear}
            max={maxYear}
            value={startYear}
            onChange={handleStart}
            aria-label="Start year"
          />
          <input
            type="range"
            className="dual-range__input"
            min={minYear}
            max={maxYear}
            value={endYear}
            onChange={handleEnd}
            aria-label="End year"
          />
        </div>
      </div>
    </section>
  );
}
