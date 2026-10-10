import { useEffect, useState } from "react";
import { NumInput } from "@shared/ui.jsx";
import { fmtDateHeader, addDays } from "./dateUtils.js";
import { dayTotals, entryMacros, macrosForGrams, entryLabel, piecesForGrams } from "./food.js";
import { ProgressBar, Modal, fmtNum, DayNav, MacroRow } from "./ui.jsx";
import { MEALS, MEAL_LABELS } from "./storage.js";
import WaterCard from "./WaterCard.jsx";

export default function TodayView({
  date,
  today,
  onStepDate,
  dayLogs,
  targets,
  microTargets,
  archived,
  waterMl,
  waterSettings,
  onWater,
  view,
  highlight,
  onAddFood,
  defaultMeal,
  onOpenEntry,
  onOpenMenu,
  onOpenWeek,
  onCloseOverlay,
  logsFor,
  onUpdateEntry,
  onDeleteEntry,
  onCopyMeal,
  onSaveTemplate,
}) {
  const totals = archived ? archivedTotals(archived) : dayTotals(dayLogs);
  const noTargets = targets.kcal <= 0 && targets.protein <= 0 && targets.carbs <= 0 && targets.fat <= 0;
  const remaining = targets.kcal > 0 ? targets.kcal - totals.kcal : null;

  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`entry-${highlight}`);
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [highlight]);

  let overlay = null;
  if (view.screen === "entry") {
    const entryDate = view.date || date;
    const entry = (logsFor(entryDate)[view.meal] || []).find((e) => e.id === view.entryId);
    if (entry) {
      overlay = (
        <EditEntryModal
          key={entry.id}
          entry={entry}
          onClose={onCloseOverlay}
          onSave={(patch) => {
            onUpdateEntry(entryDate, view.meal, entry.id, patch);
            onCloseOverlay();
          }}
          onDelete={() => {
            onDeleteEntry(entryDate, view.meal, entry.id);
            onCloseOverlay();
          }}
        />
      );
    }
  } else if (view.screen === "mealmenu" && MEALS.includes(view.meal)) {
    overlay = (
      <MealMenu
        meal={view.meal}
        date={date}
        entries={dayLogs[view.meal] || []}
        onClose={onCloseOverlay}
        onCopyYesterday={() => {
          onCopyMeal(addDays(date, -1), view.meal, date, view.meal);
          onCloseOverlay();
        }}
        onCopyTo={(target) => {
          onCopyMeal(date, view.meal, date, target);
          onCloseOverlay();
        }}
        onSaveTemplate={(name) => {
          onSaveTemplate(name, view.meal, dayLogs[view.meal] || []);
          onCloseOverlay();
        }}
      />
    );
  }

  return (
    <div className="page page-tabs">
      <DayNav date={date} today={today} onDate={onStepDate} label={fmtDateHeader(date, today)} />

      <div className="card">
        <ProgressBar label="Calories" value={totals.kcal} target={targets.kcal} unit=" kcal" />
        <ProgressBar label="Protein" value={totals.protein} target={targets.protein} unit="g" />
        <ProgressBar label="Carbs" value={totals.carbs} target={targets.carbs} unit="g" />
        <ProgressBar label="Fat" value={totals.fat} target={targets.fat} unit="g" />
        <MicroLine totals={totals} targets={microTargets} />
        {noTargets && (
          <p className="hint small">
            Totals: {Math.round(totals.kcal)} kcal · P {fmtNum(totals.protein)}g · C {fmtNum(totals.carbs)}g · F{" "}
            {fmtNum(totals.fat)}g. Set targets in Settings to see progress bars.
          </p>
        )}
        <div className="totals-foot">
          {remaining != null && (
            <span className={remaining < 0 ? "over-text" : "muted"}>
              {remaining >= 0 ? `${Math.round(remaining)} kcal left` : `${Math.round(-remaining)} kcal over`}
            </span>
          )}
          <button type="button" className="linkbtn" onClick={onOpenWeek}>
            This week
          </button>
        </div>
      </div>

      {!archived && (
        <button type="button" className="bigbtn quicklog" onClick={() => onAddFood(defaultMeal)}>
          + Add to {MEAL_LABELS[defaultMeal]}
        </button>
      )}

      <WaterCard ml={waterMl} settings={waterSettings} onChange={onWater} readOnly={!!archived} />

      {archived && (
        <p className="hint small archived-note">
          Archived day: entries older than 12 months are kept as daily totals only ({archived.entries || 0}{" "}
          {archived.entries === 1 ? "item" : "items"} logged).
        </p>
      )}

      {!archived && MEALS.map((meal) => {
        const entries = dayLogs[meal] || [];
        const mealKcal = entries.reduce((a, e) => a + entryMacros(e).kcal, 0);
        return (
          <section key={meal} className={`mealblock meal-${meal}`} aria-label={MEAL_LABELS[meal]}>
            <div className="mealhead">
              <h2>
                {MEAL_LABELS[meal]}
                {entries.length > 0 && <span className="mealkcal"> · {Math.round(mealKcal)} kcal</span>}
              </h2>
              <button
                type="button"
                className="iconbtn ghosticon"
                aria-label={`${MEAL_LABELS[meal]} options`}
                onClick={() => onOpenMenu(meal)}
              >
                ⋯
              </button>
            </div>
            <div className="card">
              {entries.length === 0 && (
                <p className="hint small" style={{ margin: "4px 2px" }}>
                  No entries yet.
                </p>
              )}
              {entries.map((e) => {
                const m = entryMacros(e);
                return (
                  <button
                    type="button"
                    key={e.id}
                    id={`entry-${e.id}`}
                    className={"logrow" + (highlight === e.id ? " flash" : "")}
                    onClick={() => onOpenEntry(meal, e.id)}
                  >
                    <span className="logrow-main">
                      <span className="logrow-name">{e.name}</span>
                      <span className="logrow-sub">
                        {entryLabel(e)} · {Math.round(m.kcal)} kcal · P {fmtNum(m.protein)}g · C {fmtNum(m.carbs)}g · F{" "}
                        {fmtNum(m.fat)}g
                      </span>
                    </span>
                  </button>
                );
              })}
              <button type="button" className="linkbtn addfoodbtn" onClick={() => onAddFood(meal)}>
                + Add food
              </button>
            </div>
          </section>
        );
      })}
      {overlay}
    </div>
  );
}

function archivedTotals(a) {
  const hasMicro = (a.fiber || 0) + (a.sugars || 0) + (a.satFat || 0) + (a.salt || 0) > 0;
  return {
    kcal: a.kcal || 0,
    protein: a.protein || 0,
    carbs: a.carbs || 0,
    fat: a.fat || 0,
    fiber: a.fiber || 0,
    sugars: a.sugars || 0,
    satFat: a.satFat || 0,
    salt: a.salt || 0,
    entries: a.entries || 0,
    withMicros: hasMicro ? a.entries || 1 : 0,
  };
}

function MicroLine({ totals, targets }) {
  if (!totals.withMicros) return null;
  const part = (label, v, t) => `${label} ${fmtNum(v)}${t > 0 ? `/${fmtNum(t)}` : ""} g`;
  const items = [
    { key: "fiber", text: part("Fibre", totals.fiber, targets?.fiber), low: targets?.fiber > 0 && totals.fiber < targets.fiber },
    { key: "sugars", text: part("Sugars", totals.sugars, 0) },
    { key: "satFat", text: part("Sat. fat", totals.satFat, 0) },
    { key: "salt", text: part("Salt", totals.salt, targets?.salt), over: targets?.salt > 0 && totals.salt > targets.salt },
  ];
  return (
    <div className="microline">
      {items.map((it) => (
        <span key={it.key} className={"macro" + (it.over ? " over-text" : "")}>
          {it.text}
        </span>
      ))}
      {totals.withMicros < totals.entries && (
        <span className="macro microcov">
          ({totals.withMicros} of {totals.entries} items have data)
        </span>
      )}
    </div>
  );
}

function EditEntryModal({ entry, onClose, onSave, onDelete }) {
  const pw = entry.pieceWeight || (entry.pieces > 0 ? entry.grams / entry.pieces : 0);
  const isPiece = entry.pieces > 0 && pw > 0;
  const [grams, setGrams] = useState(entry.grams);
  const [kcal, setKcal] = useState(entry.kcal100);
  const [protein, setProtein] = useState(entry.protein100);
  const [carbs, setCarbs] = useState(entry.carbs100);
  const [fat, setFat] = useState(entry.fat100);
  const [eatenAt, setEatenAt] = useState(entry.eatenAt || "");
  const pieceFood = { pieceWeight: pw };
  const pieces = isPiece ? piecesForGrams(pieceFood, grams) : null;

  const m = entry.quick
    ? { kcal, protein, carbs, fat }
    : macrosForGrams(entry, grams);

  const save = () => {
    const time = /^\d{2}:\d{2}$/.test(eatenAt) ? { eatenAt } : {};
    if (entry.quick) onSave({ kcal100: kcal, protein100: protein, carbs100: carbs, fat100: fat, ...time });
    else onSave(isPiece ? { grams, pieces, pieceWeight: pw, ...time } : { grams, ...time });
  };

  return (
    <Modal onClose={onClose} title={entry.name}>
      {entry.quick ? (
        <>
          <div className="setrow">
            <span className="setlabel">Calories (kcal)</span>
            <NumInput value={kcal} onChange={setKcal} min={0} max={9000} step={10} label="Calories" />
          </div>
          <div className="setrow">
            <span className="setlabel">Protein (g)</span>
            <NumInput value={protein} onChange={setProtein} min={0} max={500} step={1} label="Protein" />
          </div>
          <div className="setrow">
            <span className="setlabel">Carbs (g)</span>
            <NumInput value={carbs} onChange={setCarbs} min={0} max={900} step={1} label="Carbs" />
          </div>
          <div className="setrow">
            <span className="setlabel">Fat (g)</span>
            <NumInput value={fat} onChange={setFat} min={0} max={400} step={1} label="Fat" />
          </div>
        </>
      ) : (
        <>
          {isPiece && (
            <div className="setrow">
              <span className="setlabel">Pieces ({fmtNum(pw)} g each)</span>
              <NumInput
                value={pieces}
                onChange={(p) => setGrams(Math.round(p * pw * 10) / 10)}
                min={0}
                max={99}
                step={1}
                decimals={1}
                label="Pieces"
              />
            </div>
          )}
          <div className="setrow">
            <span className="setlabel">Grams</span>
            <NumInput value={grams} onChange={setGrams} min={0} max={5000} step={5} label="Grams" />
          </div>
        </>
      )}
      <div className="setrow">
        <label className="setlabel" htmlFor="entry-time">
          Eaten at
        </label>
        <input
          id="entry-time"
          className="input timeinput"
          type="time"
          value={eatenAt}
          onChange={(e) => setEatenAt(e.target.value)}
        />
      </div>
      <div className="card inset">
        <MacroRow {...m} />
      </div>
      <div className="btnrow" style={{ justifyContent: "space-between" }}>
        <button type="button" className="linkbtn danger-text" onClick={onDelete}>
          Delete
        </button>
        <div className="btnrow-inner">
          <button type="button" className="linkbtn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="bigbtn" onClick={save} disabled={!entry.quick && !(grams > 0)}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MealMenu({ meal, date, entries, onClose, onCopyYesterday, onCopyTo, onSaveTemplate }) {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState(`${MEAL_LABELS[meal]} ${date.slice(5)}`);
  const others = MEALS.filter((m) => m !== meal);

  return (
    <Modal sheet onClose={onClose} title={`${MEAL_LABELS[meal]} options`}>
      {mode === null && (
        <div className="menu-list">
          <button type="button" className="menu-item" onClick={onCopyYesterday}>
            Copy from yesterday
          </button>
          <button type="button" className="menu-item" disabled={!entries.length} onClick={() => setMode("copy")}>
            Copy to another meal
          </button>
          <button type="button" className="menu-item" disabled={!entries.length} onClick={() => setMode("template")}>
            Save as template
          </button>
          <button type="button" className="menu-item muted" onClick={onClose}>
            Cancel
          </button>
        </div>
      )}
      {mode === "copy" && (
        <>
          <p className="hint small">Copy {entries.length} {entries.length === 1 ? "item" : "items"} to:</p>
          <div className="chips">
            {others.map((m) => (
              <button type="button" key={m} className="chip" onClick={() => onCopyTo(m)}>
                {MEAL_LABELS[m]}
              </button>
            ))}
          </div>
          <button type="button" className="linkbtn" onClick={() => setMode(null)}>
            Back
          </button>
        </>
      )}
      {mode === "template" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSaveTemplate(name.trim());
          }}
        >
          <label className="flabel" htmlFor="tpl-name">
            Template name
          </label>
          <input id="tpl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <p className="hint small">
            Saves the {entries.length} {entries.length === 1 ? "item" : "items"} in this meal. Apply it from Add food.
          </p>
          <div className="sheet-actions">
            <button type="button" className="bigbtn secondary" onClick={() => setMode(null)}>
              Back
            </button>
            <button type="submit" className="bigbtn" disabled={!name.trim()}>
              Save template
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
