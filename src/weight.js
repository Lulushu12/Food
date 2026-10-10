import { daysBetween } from "./dateUtils.js";

export const EMA_ALPHA = 0.1;

export function sortedWeights(weights) {
  return Object.entries(weights || {})
    .filter(([, w]) => w && Number.isFinite(w.kg))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, w]) => ({ date, kg: w.kg }));
}

export function emaSeries(points, alpha = EMA_ALPHA) {
  const out = [];
  let trend = null;
  let prevDate = null;
  for (const p of points) {
    if (trend == null) {
      trend = p.kg;
    } else {
      const gap = Math.max(1, daysBetween(prevDate, p.date));
      const a = 1 - Math.pow(1 - alpha, gap);
      trend = trend + a * (p.kg - trend);
    }
    prevDate = p.date;
    out.push({ date: p.date, kg: p.kg, trend });
  }
  return out;
}

export function trendAt(series, date) {
  let found = null;
  for (const p of series) {
    if (p.date > date) break;
    found = p;
  }
  return found;
}

export function weeklyRate(series) {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  let ref = null;
  for (const p of series) {
    if (daysBetween(p.date, last.date) >= 7) ref = p;
    else break;
  }
  if (!ref) ref = series[0];
  const days = daysBetween(ref.date, last.date);
  if (days < 3) return null;
  return ((last.trend - ref.trend) / days) * 7;
}

export function weightSummary(weights) {
  const series = emaSeries(sortedWeights(weights));
  const last = series[series.length - 1] || null;
  return { series, trend: last ? last.trend : null, rate: weeklyRate(series) };
}
