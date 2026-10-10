import { addDays, daysBetween } from "./dateUtils.js";
import { dayTotals, entryCount } from "./food.js";
import { emaSeries, sortedWeights, trendAt } from "./weight.js";

export const KCAL_PER_KG = 7700;
export const WINDOW_DAYS = 21;
export const MIN_DAYS = 10;
export const MIN_WEIGHTS = 3;
export const MIN_ENTRIES = 3;

export const GOALS = [
  { id: "lose-0.5", label: "Lose 0.5 kg/wk", rate: -0.5, proteinPerKg: 2.0 },
  { id: "lose-0.25", label: "Lose 0.25 kg/wk", rate: -0.25, proteinPerKg: 2.0 },
  { id: "maintain", label: "Maintain", rate: 0, proteinPerKg: 1.8 },
  { id: "gain-0.25", label: "Gain 0.25 kg/wk", rate: 0.25, proteinPerKg: 1.8 },
];

export function goalById(id) {
  return GOALS.find((g) => g.id === id) || GOALS[2];
}

export function estimateExpenditure({ logs, weights, today }) {
  const end = addDays(today, -1);
  const start = addDays(end, -(WINDOW_DAYS - 1));
  const kcals = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = addDays(start, i);
    const day = logs?.[d];
    if (entryCount(day) >= MIN_ENTRIES) kcals.push(dayTotals(day).kcal);
  }
  const series = emaSeries(sortedWeights(weights));
  const inWindow = series.filter((p) => p.date >= start && p.date <= today);
  const base = {
    at: today,
    start,
    end,
    days: kcals.length,
    readings: inWindow.length,
    kcal: null,
    intake: kcals.length ? kcals.reduce((a, b) => a + b, 0) / kcals.length : null,
    weeklyChange: null,
    trendKg: series.length ? series[series.length - 1].trend : null,
  };
  if (kcals.length < MIN_DAYS || inWindow.length < MIN_WEIGHTS) return { ...base, confidence: "none" };
  const first = trendAt(series, inWindow[0].date);
  const last = inWindow[inWindow.length - 1];
  const span = daysBetween(first.date, last.date);
  if (span < 7) return { ...base, confidence: "none" };
  const weeklyChange = ((last.trend - first.trend) / span) * 7;
  const kcal = base.intake - (KCAL_PER_KG * weeklyChange) / 7;
  let confidence = "low";
  if (kcals.length >= 17 && inWindow.length >= 8 && span >= 14) confidence = "high";
  else if (kcals.length >= 13 && inWindow.length >= 5 && span >= 10) confidence = "medium";
  return { ...base, kcal: Math.round(kcal / 10) * 10, weeklyChange, confidence };
}

export function confidenceNote(est) {
  if (!est || est.confidence === "none") {
    const need = [];
    if (!est || est.days < MIN_DAYS) need.push(`${MIN_DAYS - (est?.days || 0)} more days with ${MIN_ENTRIES}+ entries`);
    if (!est || est.readings < MIN_WEIGHTS) need.push(`${MIN_WEIGHTS - (est?.readings || 0)} more weigh-ins`);
    return need.length
      ? `Not enough data yet: log ${need.join(" and ")} in the last ${WINDOW_DAYS} days.`
      : `Not enough data yet: weigh-ins need to span at least a week.`;
  }
  const label = { high: "High", medium: "Medium", low: "Low" }[est.confidence];
  return `${label} confidence: ${est.days} of ${WINDOW_DAYS} days fully logged, ${est.readings} weigh-ins.`;
}

export function proposeTargets(est, goalId) {
  if (!est || est.kcal == null) return null;
  const g = goalById(goalId);
  const kcal = Math.max(1200, Math.round((est.kcal + (KCAL_PER_KG * g.rate) / 7) / 10) * 10);
  const protein = est.trendKg ? Math.round((est.trendKg * g.proteinPerKg) / 5) * 5 : null;
  return { kcal, protein };
}
