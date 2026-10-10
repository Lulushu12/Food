import { useEffect, useState } from "react";
import { NumInput, IconButton } from "@shared/ui.jsx";
import { fmtDateHeader, lastNDates } from "./dateUtils.js";
import { DayNav } from "./ui.jsx";
import { weightSummary } from "./weight.js";

const W = 320;
const H = 140;
const PAD_L = 38;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 18;

function WeightChart({ series, endDate, today }) {
  const days = lastNDates(endDate, 30);
  const first = days[0];
  const inRange = series.filter((p) => p.date >= first && p.date <= endDate);
  if (inRange.length < 2) return <p className="hint small">Log at least two days to see a trend.</p>;

  const values = inRange.flatMap((p) => [p.kg, p.trend]);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1) {
    const mid = (max + min) / 2;
    min = mid - 0.5;
    max = mid + 0.5;
  }
  const idx = new Map(days.map((d, i) => [d, i]));
  const x = (d) => PAD_L + (idx.get(d) / (days.length - 1)) * (W - PAD_L - PAD_R);
  const y = (kg) => PAD_T + (1 - (kg - min) / (max - min)) * (H - PAD_T - PAD_B);
  const trendD = inRange.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(" ");
  const rawD = inRange.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="trendsvg"
        role="img"
        aria-label={`Weight over the last 30 days, from ${min.toFixed(1)} to ${max.toFixed(1)} kg`}
      >
        <line x1={PAD_L} x2={W - PAD_R} y1={y(max)} y2={y(max)} className="gridline" />
        <line x1={PAD_L} x2={W - PAD_R} y1={y(min)} y2={y(min)} className="gridline" />
        <text x={PAD_L - 6} y={y(max) + 4} className="axislabel" textAnchor="end">
          {max.toFixed(1)}
        </text>
        <text x={PAD_L - 6} y={y(min) + 4} className="axislabel" textAnchor="end">
          {min.toFixed(1)}
        </text>
        <text x={PAD_L} y={H - 4} className="axislabel" textAnchor="start">
          {fmtDateHeader(first, today)}
        </text>
        <text x={W - PAD_R} y={H - 4} className="axislabel" textAnchor="end">
          {fmtDateHeader(endDate, today)}
        </text>
        <path d={rawD} fill="none" className="rawline" />
        <path d={trendD} fill="none" className="trendline" />
        {inRange.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r="2.6" className="rawdot" />
        ))}
      </svg>
      <figcaption className="legend">
        <span className="lg lg-raw">Scale</span>
        <span className="lg lg-trend">Trend (EMA)</span>
      </figcaption>
    </figure>
  );
}

export default function WeightView({ date, today, onStepDate, onSetDate, weights, onSaveWeight, onDeleteWeight }) {
  const [kg, setKg] = useState(() => weights[date]?.kg ?? weights[today]?.kg ?? lastKg(weights) ?? 70);

  useEffect(() => {
    setKg(weights[date]?.kg ?? lastKg(weights) ?? 70);
  }, [date]);

  const { series, trend, rate } = weightSummary(weights);
  const recent = [...series].reverse().slice(0, 14);

  return (
    <div className="page page-tabs">
      <DayNav date={date} today={today} onDate={onStepDate} label={fmtDateHeader(date, today)} />

      <div className="card">
        <div className="setrow">
          <span className="setlabel">Weight (kg)</span>
          <NumInput value={kg} onChange={setKg} min={20} max={400} step={0.1} label="Weight in kg" />
        </div>
        <button type="button" className="bigbtn start" disabled={!(kg >= 20)} onClick={() => onSaveWeight(date, kg)}>
          {weights[date] ? "Update entry" : "Save entry"}
        </button>
      </div>

      <h2>30-day trend</h2>
      <div className="card">
        {trend != null && (
          <div className="statrow">
            <div className="stat">
              <span className="stat-val">{trend.toFixed(1)} kg</span>
              <span className="stat-label">Trend weight</span>
            </div>
            <div className="stat">
              <span className="stat-val">
                {rate == null ? "n/a" : `${rate > 0 ? "+" : ""}${rate.toFixed(2)} kg`}
              </span>
              <span className="stat-label">Per week</span>
            </div>
          </div>
        )}
        <WeightChart series={series} endDate={today} today={today} />
        <p className="hint small">
          The trend smooths out day-to-day water swings (exponential moving average, 10% weight per day).
        </p>
      </div>

      <h2>Recent entries</h2>
      <div className="card">
        {recent.length === 0 && (
          <p className="hint small" style={{ margin: "4px 2px" }}>
            No entries yet.
          </p>
        )}
        {recent.map((p) => (
          <div key={p.date} className="logrow static">
            <button type="button" className="logrow-main" onClick={() => onSetDate(p.date)}>
              <span className="logrow-name">{fmtDateHeader(p.date, today)}</span>
              <span className="logrow-sub">
                {p.kg.toFixed(1)} kg · trend {p.trend.toFixed(1)}
              </span>
            </button>
            <IconButton label={`Delete weight for ${p.date}`} onClick={() => onDeleteWeight(p.date)}>
              ✕
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function lastKg(weights) {
  const dates = Object.keys(weights).sort();
  return dates.length ? weights[dates[dates.length - 1]].kg : null;
}
