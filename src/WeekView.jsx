import { useEffect, useState } from "react";
import { lastNDates, fmtDateHeader, fmtShortDay } from "./dateUtils.js";
import { dayTotals } from "./food.js";
import { TopBar, fmtNum } from "./ui.jsx";
import { weightSummary } from "./weight.js";
import { estimateExpenditure } from "./tdee.js";
import EnergyCard from "./EnergyCard.jsx";

const ADHERENCE_BAND = 0.1;

export default function WeekView({ logs, weights, targets, endDate, today, onBack, goal, onGoal, onApply, onEstimate }) {
  const [est] = useState(() => estimateExpenditure({ logs, weights, today }));
  useEffect(() => {
    onEstimate?.(est);
  }, [est]);
  const days = lastNDates(endDate, 7).map((date) => {
    const day = logs[date];
    const t = dayTotals(day);
    const logged = t.kcal > 0;
    return { date, ...t, logged };
  });
  const logged = days.filter((d) => d.logged);
  const avg = (k) => (logged.length ? logged.reduce((a, d) => a + d[k], 0) / logged.length : 0);
  const target = targets.kcal || 0;
  const maxKcal = Math.max(target * 1.2, ...days.map((d) => d.kcal), 1);
  const onTarget = target > 0 ? logged.filter((d) => Math.abs(d.kcal - target) <= target * ADHERENCE_BAND).length : null;
  const { rate } = weightSummary(weights);

  const W = 320;
  const H = 150;
  const top = 12;
  const bottom = 22;
  const slot = W / 7;
  const barW = slot * 0.56;
  const y = (v) => top + (1 - v / maxKcal) * (H - top - bottom);

  return (
    <div className="page">
      <TopBar title="This week" sub={`7 days to ${fmtDateHeader(endDate, today)}`} onBack={onBack} />
      <div className="card">
        <svg viewBox={`0 0 ${W} ${H}`} className="weeksvg" role="img" aria-label="Calories per day for the last 7 days">
          {target > 0 && (
            <>
              <line x1="0" x2={W} y1={y(target)} y2={y(target)} className="targetline" />
              <text x={W - 2} y={y(target) - 4} textAnchor="end" className="axislabel">
                {target} kcal
              </text>
            </>
          )}
          {days.map((d, i) => {
            const h = Math.max(0, y(0) - y(d.kcal));
            const over = target > 0 && d.kcal > target * (1 + ADHERENCE_BAND);
            return (
              <g key={d.date}>
                <rect
                  x={i * slot + (slot - barW) / 2}
                  y={y(0) - h}
                  width={barW}
                  height={h}
                  rx="3"
                  className={"bar" + (over ? " over" : "") + (d.date === endDate ? " current" : "")}
                >
                  <title>{`${d.date}: ${Math.round(d.kcal)} kcal`}</title>
                </rect>
                <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" className="axislabel">
                  {fmtShortDay(d.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="statgrid">
        <div className="stat card">
          <span className="stat-val">{Math.round(avg("kcal"))}</span>
          <span className="stat-label">Avg kcal ({logged.length} logged days)</span>
        </div>
        <div className="stat card">
          <span className="stat-val">{fmtNum(avg("protein"))} g</span>
          <span className="stat-label">
            Avg protein{targets.protein > 0 ? ` (target ${targets.protein} g)` : ""}
          </span>
        </div>
        <div className="stat card">
          <span className="stat-val">{onTarget == null ? "n/a" : `${onTarget}/${logged.length}`}</span>
          <span className="stat-label">{onTarget == null ? "Set a calorie target" : "Days within 10% of target"}</span>
        </div>
        <div className="stat card">
          <span className="stat-val">{rate == null ? "n/a" : `${rate > 0 ? "+" : ""}${rate.toFixed(2)} kg`}</span>
          <span className="stat-label">Weight trend per week</span>
        </div>
      </div>
      <h2>Energy target</h2>
      <EnergyCard est={est} goal={goal} targets={targets} today={today} onGoal={onGoal} onApply={onApply} />
      <div className="card">
        {days
          .slice()
          .reverse()
          .map((d) => (
            <div key={d.date} className="histrow">
              <span className="histrow-date">{fmtDateHeader(d.date, today)}</span>
              <span className="histrow-detail">
                {d.logged ? `${Math.round(d.kcal)} kcal · P ${Math.round(d.protein)} g` : "Not logged"}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
