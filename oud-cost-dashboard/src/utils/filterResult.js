// Derives a result object filtered to [startYear, endYear] from the full simulation output.
// Since the cumulative arrays are running totals, any sub-period cost equals
// cumulative[endIdx] - cumulative[startIdx - 1].
export function filterResultByYears(result, startYear, endYear) {
  if (!result) return null;

  const { months, cumulative, summary, equity_distribution, metadata } = result;

  const startIdx = months.findIndex(m => m.startsWith(`${startYear}-`));
  let endIdx = -1;
  for (let i = months.length - 1; i >= 0; i--) {
    if (months[i].startsWith(`${endYear}-`)) { endIdx = i; break; }
  }
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return result;

  function sliceAndOffset(arr) {
    const base = startIdx > 0 ? arr[startIdx - 1] : 0;
    return arr.slice(startIdx, endIdx + 1).map(v => v - base);
  }

  const filteredCumulative = {};
  for (const [domain, series] of Object.entries(cumulative)) {
    filteredCumulative[domain] = {
      p025: sliceAndOffset(series.p025),
      p50:  sliceAndOffset(series.p50),
      p975: sliceAndOffset(series.p975),
    };
  }

  const filteredMonths = months.slice(startIdx, endIdx + 1);
  const n = filteredCumulative.total.p50.length;
  const total_cost_p50  = filteredCumulative.total.p50[n - 1];
  const total_cost_p025 = filteredCumulative.total.p025[n - 1];
  const total_cost_p975 = filteredCumulative.total.p975[n - 1];

  const domain_shares_pct = {};
  for (const domain of ['healthcare', 'justice', 'economic', 'child_welfare']) {
    const domainCost = filteredCumulative[domain]?.p50[n - 1] ?? 0;
    domain_shares_pct[domain] = total_cost_p50 > 0 ? (domainCost / total_cost_p50) * 100 : 0;
  }

  const scale = summary.total_cost_p50 > 0 ? total_cost_p50 / summary.total_cost_p50 : 1;
  const filteredEquity = {};
  for (const [cat, splits] of Object.entries(equity_distribution ?? {})) {
    filteredEquity[cat] = Object.fromEntries(
      Object.entries(splits).map(([k, v]) => [k, v * scale])
    );
  }

  // Slice trajectory to the same window and re-baseline cumulative values
  // so they start at 0 at startYear, matching sliceAndOffset behaviour above.
  let filteredTrajectory;
  if (result.trajectory) {
    const prev = startIdx > 0 ? result.trajectory[startIdx - 1] : null;
    filteredTrajectory = result.trajectory.slice(startIdx, endIdx + 1).map((row) => {
      if (!prev) return row;
      return {
        date:         row.date,
        total:        row.total        - prev.total,
        healthcare:   row.healthcare   - prev.healthcare,
        justice:      row.justice      - prev.justice,
        economic:     row.economic     - prev.economic,
        childWelfare: row.childWelfare - prev.childWelfare,
      };
    });
  }

  return {
    ...result,
    months: filteredMonths,
    cumulative: filteredCumulative,
    summary: { ...summary, total_cost_p50, total_cost_p025, total_cost_p975, domain_shares_pct },
    equity_distribution: filteredEquity,
    metadata: { ...metadata, time_range: `${startYear} → ${endYear}` },
    ...(filteredTrajectory !== undefined ? { trajectory: filteredTrajectory } : {}),
  };
}
