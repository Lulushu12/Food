import { useState } from "react";
import { IconButton } from "@shared/ui.jsx";
import { newId } from "@shared/store.js";
import FoodEditor from "./FoodEditor.jsx";
import { MEAL_LABELS } from "./storage.js";
import { macrosForGrams, matchesQuery } from "./food.js";
import { fmtNum } from "./ui.jsx";

export default function FoodsView({
  foods,
  templates,
  editingId,
  onOpen,
  onBack,
  onSaveFood,
  onDeleteFood,
  onToggleFavorite,
  onDeleteTemplate,
}) {
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);

  if (editingId !== undefined) {
    const food = editingId === null ? null : foods[editingId];
    return (
      <FoodEditor
        key={editingId || "new"}
        food={food}
        onCancel={onBack}
        onSave={(draft) => {
          const id = food?.id || newId();
          onSaveFood({ ...draft, id });
          onBack();
        }}
        onDelete={
          food
            ? () => {
                onDeleteFood(food.id);
                onBack();
              }
            : undefined
        }
      />
    );
  }

  const list = Object.values(foods)
    .filter((f) => matchesQuery(f, query.trim()) && (!onlyFav || f.favorite))
    .sort((a, b) => a.name.localeCompare(b.name));
  const tpls = Object.values(templates || {}).sort(
    (a, b) => a.meal.localeCompare(b.meal) || a.name.localeCompare(b.name)
  );

  return (
    <div className="page page-tabs">
      <h1 className="apptitle">
        Foods<span>.</span>
      </h1>
      <input
        className="input"
        type="search"
        aria-label="Search your foods"
        placeholder="Search your foods"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chips">
        <button type="button" className={"chip" + (!onlyFav ? " sel" : "")} onClick={() => setOnlyFav(false)}>
          All ({Object.keys(foods).length})
        </button>
        <button type="button" className={"chip" + (onlyFav ? " sel" : "")} onClick={() => setOnlyFav(true)}>
          Favourites
        </button>
      </div>
      <button type="button" className="bigbtn" onClick={() => onOpen(null)}>
        + New custom food
      </button>
      <p className="hint small">
        Foods you log from search or barcode are saved here, so logging them again works offline.
      </p>
      {list.length === 0 && <p className="hint">No foods here yet.</p>}
      {list.map((f) => (
        <div key={f.id} className="card foodrow">
          <button type="button" className="foodrow-main" onClick={() => onOpen(f.id)}>
            <span className="foodrow-name">{f.name}</span>
            <span className="foodrow-sub">
              {f.brand ? `${f.brand} · ` : ""}
              {Math.round(f.kcal100)} kcal · P {fmtNum(f.protein100)}g · C {fmtNum(f.carbs100)}g · F {fmtNum(f.fat100)}g
              <span className="tag">{f.source === "off" ? "OFF" : "custom"}</span>
              {f.macrosIncomplete && <span className="tag tag-warn">Macros incomplete</span>}
            </span>
          </button>
          <IconButton
            label={f.favorite ? `Remove ${f.name} from favourites` : `Add ${f.name} to favourites`}
            className={"star" + (f.favorite ? " on" : "")}
            aria-pressed={!!f.favorite}
            onClick={() => onToggleFavorite(f.id)}
          >
            {f.favorite ? "★" : "☆"}
          </IconButton>
        </div>
      ))}

      <h2>Meal templates</h2>
      <p className="hint small">Save a meal as a template from its ⋯ menu on Today. Apply one from Add food.</p>
      {tpls.length === 0 && <p className="hint small">No templates.</p>}
      {tpls.length > 0 && (
        <div className="card">
          {tpls.map((t) => {
            const kcal = t.items.reduce((a, e) => a + macrosForGrams(e, e.grams).kcal, 0);
            return (
              <div key={t.id} className="logrow static">
                <span className="logrow-main">
                  <span className="logrow-name">{t.name}</span>
                  <span className="logrow-sub">
                    {MEAL_LABELS[t.meal]} · {t.items.length} {t.items.length === 1 ? "item" : "items"} · {Math.round(kcal)} kcal
                  </span>
                </span>
                <IconButton label={`Delete template ${t.name}`} onClick={() => onDeleteTemplate(t.id)}>
                  ✕
                </IconButton>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
