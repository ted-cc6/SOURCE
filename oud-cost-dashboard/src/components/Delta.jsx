import { formatCostShort } from '../utils/format.js';

export default function Delta({ current, previous, format = 'currency' }) {
  if (previous == null || current == null) return null;
  const diff = current - previous;
  if (Math.abs(diff / previous) < 0.0001) return null;

  const sign = diff > 0 ? '+' : '';
  const label = format === 'pct'
    ? `${sign}${diff.toFixed(1)}%`
    : `${sign}${formatCostShort(diff)}`;

  return (
    <span className={`delta delta--${diff > 0 ? 'up' : 'down'}`}>
      {diff > 0 ? '↑' : '↓'} {label}
    </span>
  );
}
