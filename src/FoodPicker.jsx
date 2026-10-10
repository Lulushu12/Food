import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NumInput, IconButton } from "@shared/ui.jsx";
import { newId } from "@shared/store.js";
import { searchFoods, lookupBarcode } from "./offc.js";
import { macrosForGrams, piecesForGrams, foodScore, matchesQuery, MICROS } from "./food.js";
import { MacroRow, TopBar, fmtNum } from "./ui.jsx";
import { MEAL_LABELS } from "./storage.js";
import { fmtDateHeader } from "./dateUtils.js";
import { quickItem } from "./templates.js";
import FoodEditor from "./FoodEditor.jsx";
import BarcodeScanner from "./BarcodeScanner.jsx";

const DEBOUNCE_MS = 400;

function microFields(food) {
  const out = {};
  for (const m of MICROS) if (Number.isFinite(food[m.field])) out[m.field] = food[m.field];
  return out;
}

function macroLine(f) {
  return `${Math.round(f.kcal100)} kcal · P ${fmtNum(f.protein100)} · C ${fmtNum(f.carbs100)} · F ${fmtNum(f.fat100)} /100g`;
}

function Badges({ food, saved }) {
  return (
    <>
      {saved && <span className="tag tag-ok">Saved</span>}
      {food.macrosIncomplete && <span className="tag tag-warn">Macros incomplete</span>}
      {food.nutriscore && <span className={`tag ns ns-${food.nutriscore}`}>Nutri {food.nutriscore.toUpperCase()}</span>}
      {food.nova && <span className="tag">NOVA {food.nova}</span>}
    </>
  );
}

function FoodRow({ food, onPick, onStar, saved }) {
  return (
    <div className="card foodrow">
      <button type="button" className="foodrow-main" onClick={onPick}>
        <span className="foodrow-name">{food.name}</span>
        <span className="foodrow-sub">
          {food.brand ? `${food.brand} · ` : ""}
          {macroLine(food)}
        </span>
        {(saved || food.macrosIncomplete || food.nutriscore || food.nova) && (
          <span className="foodrow-tags">
            <Badges food={food} saved={saved} />
          </span>
        )}
      </button>
      {onStar && (
        <IconButton
          label={food.favorite ? `Remove ${food.name} from favourites` : `Add ${food.name} to favourites`}
          className={"star" + (food.favorite ? " on" : "")}
          aria-pressed={!!food.favorite}
          onClick={onStar}
        >
          {food.favorite ? "★" : "☆"}
        </IconButton>
      )}
    </div>
  );
}

export default function FoodPicker({
  view,
  food,
  foods,
  templates,
  country,
  date,
  today,
  nav,
  replace,
  back,
  close,
  onCacheFood,
  onSaveFood,
  onToggleFavorite,
  onAdd,
  onApplyTemplate,
}) {
  const meal = view.meal;
  const step = view.step === "log" && !food ? "list" : view.step || "list";
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState({ status: "idle", items: [], q: "" });
  const [barcodeError, setBarcodeError] = useState("");
  const [looking, setLooking] = useState(false);
  const reqRef = useRef(null);
  const timerRef = useRef(0);
  const cacheRef = useRef(new Map());

  const subtitle = `${MEAL_LABELS[meal]}${date !== today ? ` · ${fmtDateHeader(date, today)}` : ""}`;

  const openLog = (id) => nav({ ...view, step: "log", foodId: id, d: 2 });

  const runRemote = useCallback(
    async (q) => {
      clearTimeout(timerRef.current);
      reqRef.current?.abort();
      const key = `${country}|${q.toLowerCase()}`;
      const hit = cacheRef.current.get(key);
      if (hit) {
        setRemote({ status: "done", items: hit.items, widened: hit.widened, q });
        return;
      }
      const ctrl = new AbortController();
      reqRef.current = ctrl;
      setRemote({ status: "loading", items: [], q });
      const r = await searchFoods(q, { country, signal: ctrl.signal });
      if (ctrl.signal.aborted || r.aborted) return;
      if (!r.ok) {
        setRemote({ status: "error", error: r.error, items: [], q });
        return;
      }
      cacheRef.current.set(key, { items: r.items, widened: r.widened });
      setRemote({ status: "done", items: r.items, widened: r.widened, q });
    },
    [country]
  );

  useEffect(() => {
    const q = query.trim();
    clearTimeout(timerRef.current);
    if (q.length < 2) {
      reqRef.current?.abort();
      setRemote((r) => (r.status === "idle" ? r : { status: "idle", items: [], q: "" }));
      return undefined;
    }
    timerRef.current = setTimeout(() => runRemote(q), DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query, runRemote]);

  useEffect(() => () => reqRef.current?.abort(), []);

  const byCode = useMemo(() => {
    const m = new Map();
    for (const f of Object.values(foods)) if (f.code) m.set(f.code, f);
    return m;
  }, [foods]);

  const q = query.trim();
  const now = Date.now();
  const all = Object.values(foods);
  const local = all
    .filter((f) => matchesQuery(f, q))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || foodScore(b, now) - foodScore(a, now))
    .slice(0, q ? 30 : 60);
  const frequent = q
    ? []
    : all
        .filter((f) => (f.useCount || 0) >= 2)
        .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
        .slice(0, 8);
  const tpls = q
    ? []
    : Object.values(templates || {}).sort(
        (a, b) => (b.meal === meal ? 1 : 0) - (a.meal === meal ? 1 : 0) || a.name.localeCompare(b.name)
      );

  const pickRemote = (item) => {
    const existing = item.code && byCode.get(item.code);
    openLog(existing ? existing.id : onCacheFood(item));
  };

  const runBarcode = async (code) => {
    setLooking(true);
    setBarcodeError("");
    const existing = byCode.get(code.trim());
    if (existing) {
      setLooking(false);
      replace({ ...view, step: "log", foodId: existing.id, d: 2 });
      return;
    }
    const r = await lookupBarcode(code, { country });
    setLooking(false);
    if (!r.ok) {
      setBarcodeError(r.error);
      return;
    }
    replace({ ...view, step: "log", foodId: onCacheFood(r.item), d: 2 });
  };

  if (step === "newfood") {
    return (
      <FoodEditor
        onCancel={back}
        onSave={(draft) => {
          const id = newId();
          onSaveFood({ ...draft, id, source: "custom" });
          replace({ ...view, step: "log", foodId: id, d: 2 });
        }}
      />
    );
  }

  if (step === "quick") return <QuickAdd subtitle={subtitle} onBack={back} onAdd={onAdd} />;

  if (step === "log" && food) {
    return (
      <LogStep
        key={food.id}
        food={food}
        meal={meal}
        subtitle={subtitle}
        onBack={back}
        onAdd={onAdd}
        onStar={() => onToggleFavorite(food.id)}
      />
    );
  }

  if (step === "barcode") {
    return (
      <div className="page">
        <TopBar title="Scan barcode" sub={subtitle} onBack={back} />
        <BarcodeScanner onCode={runBarcode} busy={looking} />
        {looking && <p className="hint small">Looking up product…</p>}
        {barcodeError && <p className="warn">{barcodeError}</p>}
      </div>
    );
  }

  return (
    <div className="page">
      <TopBar title="Add food" sub={subtitle} onBack={view.step === "list" ? close : back} />
      <form
        className="searchbox"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.length >= 1) runRemote(q);
        }}
      >
        <input
          className="input"
          type="search"
          enterKeyHint="search"
          aria-label="Search foods"
          placeholder="Search your foods and Open Food Facts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <IconButton label="Clear search" className="searchclear" onClick={() => setQuery("")}>
            ✕
          </IconButton>
        )}
      </form>
      <div className="actionrow">
        <button type="button" className="chip" onClick={() => nav({ ...view, step: "barcode", d: 2 })}>
          Barcode
        </button>
        <button type="button" className="chip" onClick={() => nav({ ...view, step: "quick", d: 2 })}>
          Quick add
        </button>
        <button type="button" className="chip" onClick={() => nav({ ...view, step: "newfood", d: 2 })}>
          New food
        </button>
      </div>

      {frequent.length > 0 && (
        <>
          <div className="flabel">Frequent</div>
          <div className="chips scrollchips">
            {frequent.map((f) => (
              <button type="button" key={f.id} className="chip" onClick={() => openLog(f.id)}>
                {f.name}
              </button>
            ))}
          </div>
        </>
      )}

      {tpls.length > 0 && (
        <>
          <div className="flabel">Templates (one tap adds all)</div>
          <div className="chips scrollchips">
            {tpls.map((t) => {
              const kcal = t.items.reduce((a, e) => a + macrosForGrams(e, e.grams).kcal, 0);
              return (
                <button
                  type="button"
                  key={t.id}
                  className={"chip tplchip" + (t.meal === meal ? " mine" : "")}
                  onClick={() => onApplyTemplate(t)}
                >
                  <span className="tplname">{t.name}</span>
                  <span className="tplkcal">{Math.round(kcal)} kcal</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="flabel">{q ? "Your foods" : "Favourites and recent"}</div>
      {local.length === 0 && (
        <p className="hint small">
          {q ? "No saved foods match." : "No foods yet. Search, scan a barcode, or add a custom food."}
        </p>
      )}
      {local.map((f) => (
        <FoodRow key={f.id} food={f} onPick={() => openLog(f.id)} onStar={() => onToggleFavorite(f.id)} />
      ))}

      {q.length >= 2 && (
        <>
          <div className="divider" role="separator">
            <span>Open Food Facts</span>
          </div>
          {remote.status === "loading" && <p className="hint small">Searching…</p>}
          {remote.status === "error" && <p className="warn">{remote.error}</p>}
          {remote.status === "done" && remote.items.length === 0 && <p className="hint small">No online results.</p>}
          {remote.status === "done" && remote.widened && (
            <p className="hint small">No results for your country, showing worldwide.</p>
          )}
          {remote.items.map((item, i) => (
            <FoodRow
              key={item.code || `${item.name}-${item.brand}-${i}`}
              food={item}
              saved={!!(item.code && byCode.get(item.code))}
              onPick={() => pickRemote(item)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function LogStep({ food, meal, subtitle, onBack, onAdd, onStar }) {
  const pw = food.isPiece ? food.pieceWeight || 0 : 0;
  const initial = pw > 0 ? (food.lastPieces ?? 1) * pw : food.lastGrams ?? 100;
  const [grams, setGrams] = useState(Math.round(initial * 10) / 10);
  const pieces = pw > 0 ? piecesForGrams(food, grams) : null;
  const macros = macrosForGrams(food, grams);
  const factor = grams / 100;

  const chips = [];
  if (pw > 0) {
    for (const n of [1, 2, 3]) chips.push({ label: `${n} pc`, grams: n * pw });
  } else {
    chips.push({ label: "100 g", grams: 100 });
  }
  if (food.servingGrams) chips.push({ label: `1 serving (${fmtNum(food.servingGrams)} g)`, grams: food.servingGrams });
  if (food.packageGrams) chips.push({ label: `1 package (${fmtNum(food.packageGrams)} g)`, grams: food.packageGrams });
  if (food.lastGrams && !chips.some((c) => c.grams === food.lastGrams)) {
    chips.push({ label: `Last (${fmtNum(food.lastGrams)} g)`, grams: food.lastGrams });
  }

  const extras = MICROS.map((m) => [m.label, food[m.field]]).filter(([, v]) => Number.isFinite(v));

  return (
    <div className="page">
      <TopBar title={food.name} sub={`Add to ${subtitle}`} onBack={onBack}>
        <IconButton
          label={food.favorite ? "Remove from favourites" : "Add to favourites"}
          className={"star" + (food.favorite ? " on" : "")}
          aria-pressed={!!food.favorite}
          onClick={onStar}
        >
          {food.favorite ? "★" : "☆"}
        </IconButton>
      </TopBar>
      {(food.brand || food.nutriscore || food.nova || food.macrosIncomplete) && (
        <p className="hint small">
          {food.brand}
          {food.brand && " "}
          <Badges food={food} />
        </p>
      )}
      {food.macrosIncomplete && (
        <p className="warn">Open Food Facts is missing protein, carbs or fat for this product. Missing values count as 0.</p>
      )}

      <div className="chips">
        {chips.map((c) => (
          <button
            type="button"
            key={c.label}
            className={"chip" + (Math.abs(c.grams - grams) < 0.05 ? " sel" : "")}
            onClick={() => setGrams(Math.round(c.grams * 10) / 10)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {pw > 0 && (
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

      <div className="card">
        <MacroRow {...macros} />
        {extras.length > 0 && (
          <div className="macrorow extras">
            {extras.map(([label, v]) => (
              <span key={label} className="macro">
                {label} {fmtNum(v * factor)}g
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="bigbtn start"
        disabled={!(grams > 0)}
        onClick={() =>
          onAdd({
            foodId: food.id,
            name: food.name,
            grams,
            ...(pw > 0 ? { pieces, pieceWeight: pw } : {}),
            kcal100: food.kcal100,
            protein100: food.protein100,
            carbs100: food.carbs100,
            fat100: food.fat100,
            ...microFields(food),
          })
        }
      >
        Add to {MEAL_LABELS[meal]}
      </button>
    </div>
  );
}

function QuickAdd({ subtitle, onBack, onAdd }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const fromMacros = Math.round(protein * 4 + carbs * 4 + fat * 9);
  const effKcal = kcal > 0 ? kcal : fromMacros;

  return (
    <div className="page">
      <TopBar title="Quick add" sub={subtitle} onBack={onBack} />
      <div className="field">
        <label className="flabel" htmlFor="qa-name">
          Name (optional)
        </label>
        <input
          id="qa-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Restaurant lunch"
          maxLength={80}
        />
      </div>
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
      {kcal === 0 && fromMacros > 0 && <p className="hint small">Calories estimated from macros: {fromMacros} kcal.</p>}
      <button
        type="button"
        className="bigbtn start"
        disabled={!(effKcal > 0)}
        onClick={() => onAdd(quickItem({ name: name.trim(), kcal: effKcal, protein, carbs, fat }))}
      >
        Add {effKcal > 0 ? `${effKcal} kcal` : ""}
      </button>
    </div>
  );
}
