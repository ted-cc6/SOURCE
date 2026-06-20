// src/utils/format.js

/** Format a USD figure with trillion/billion/million suffixes for headline numbers. */
export function formatCostShort(value) {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${Math.round(value).toLocaleString()}`;
}

/** Full precision dollar string, e.g. for tooltips. */
export function formatCostFull(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

/** "2034-01-01" -> "Jan 2034" */
export function formatMonthLabel(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function titleCase(slug) {
  return slug
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
