import { IconButton } from "@shared/ui.jsx";

const R = 22;
const C = 2 * Math.PI * R;

export function fmtWater(ml, settings) {
  if (settings.unit === "glass" && settings.step > 0) {
    const g = Math.round((ml / settings.step) * 10) / 10;
    return `${g} ${g === 1 ? "glass" : "glasses"}`;
  }
  return ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 ? 2 : 1)} L` : `${Math.round(ml)} ml`;
}

export default function WaterCard({ ml, settings, onChange, readOnly }) {
  const target = settings.target || 0;
  const pct = target > 0 ? Math.min(1, ml / target) : 0;
  const stepLabel = settings.unit === "glass" ? "a glass" : `${settings.step} ml`;
  return (
    <div className="card watercard">
      <svg viewBox="0 0 56 56" className="waterring" aria-hidden="true">
        <circle cx="28" cy="28" r={R} className="ring-track" />
        {target > 0 && (
          <circle
            cx="28"
            cy="28"
            r={R}
            className={"ring-fill" + (ml >= target ? " full" : "")}
            strokeDasharray={`${C * pct} ${C}`}
            transform="rotate(-90 28 28)"
          />
        )}
      </svg>
      <div className="water-main">
        <span className="water-label">Water</span>
        <span className="water-val">
          {fmtWater(ml, settings)}
          {target > 0 && <span className="muted"> / {fmtWater(target, settings)}</span>}
        </span>
      </div>
      {!readOnly && (
        <div className="water-btns">
          <IconButton label={`Remove ${stepLabel}`} disabled={ml <= 0} onClick={() => onChange(-settings.step)}>
            −
          </IconButton>
          <IconButton label={`Add ${stepLabel}`} className="water-add" onClick={() => onChange(settings.step)}>
            +
          </IconButton>
        </div>
      )}
    </div>
  );
}
