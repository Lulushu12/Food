import { GOALS, confidenceNote, proposeTargets } from "./tdee.js";
import { fmtDateHeader } from "./dateUtils.js";

function whenLabel(date, today) {
  const l = fmtDateHeader(date, today);
  return l === "Today" || l === "Yesterday" ? l.toLowerCase() : `on ${l}`;
}

export default function EnergyCard({ est, goal, targets, today, onGoal, onApply, stale }) {
  const proposal = proposeTargets(est, goal);
  const same = proposal && proposal.kcal === targets.kcal && (proposal.protein == null || proposal.protein === targets.protein);
  return (
    <div className="card energy">
      <div className="energy-head">
        {est?.kcal != null ? (
          <span className="energy-val">Estimated expenditure: {est.kcal} kcal</span>
        ) : (
          <span className="energy-val muted">Estimated expenditure: not enough data</span>
        )}
      </div>
      <p className={"hint small conf conf-" + (est?.confidence || "none")}>{confidenceNote(est)}</p>
      {est?.kcal != null && (
        <p className="hint small">
          Avg intake {Math.round(est.intake)} kcal, trend {est.weeklyChange > 0 ? "+" : ""}
          {est.weeklyChange.toFixed(2)} kg/wk.
        </p>
      )}
      {stale && est?.at && (
        <p className="hint small">
          Calculated {whenLabel(est.at, today)}. Open This week on Today to refresh.
        </p>
      )}
      <div className="flabel">Goal</div>
      <div className="chips" role="radiogroup" aria-label="Goal">
        {GOALS.map((g) => (
          <button
            type="button"
            key={g.id}
            role="radio"
            aria-checked={goal === g.id}
            className={"chip small" + (goal === g.id ? " sel" : "")}
            onClick={() => onGoal(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      {proposal ? (
        <div className="energy-proposal">
          <span>
            Proposed: <strong>{proposal.kcal} kcal</strong>
            {proposal.protein != null && (
              <>
                , <strong>{proposal.protein} g protein</strong>
              </>
            )}
          </span>
          <button type="button" className="bigbtn small" disabled={same} onClick={() => onApply(proposal)}>
            {same ? "Applied" : "Apply"}
          </button>
        </div>
      ) : (
        <p className="hint small">A proposal appears once the estimate is available.</p>
      )}
    </div>
  );
}
