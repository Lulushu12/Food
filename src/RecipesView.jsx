import { useMemo, useState } from "react";
import { IconButton, NumInput, useConfirm } from "@shared/ui.jsx";
import { newId } from "@shared/store.js";
import { MEALS, MEAL_LABELS } from "./storage.js";
import { Modal, TopBar, fmtNum } from "./ui.jsx";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_MEAL,
  COLLECTIONS,
  fmtQty,
  ingredientLine,
  isCooked,
  isDraft,
  matchesRecipe,
  mergeRecipes,
  parseIngredient,
  scaleIngredients,
  useCatalog,
} from "./recipes.js";

const LIST_PREFS = "food:recipes:list";

function readPrefs() {
  try {
    const p = JSON.parse(sessionStorage.getItem(LIST_PREFS) || "{}");
    return { collection: p.collection || "all", category: p.category || "", query: p.query || "", favs: !!p.favs };
  } catch {
    return { collection: "all", category: "", query: "", favs: false };
  }
}

function writePrefs(p) {
  try {
    sessionStorage.setItem(LIST_PREFS, JSON.stringify(p));
  } catch {
    /* not essential */
  }
}

export default function RecipesView({
  view,
  nav,
  back,
  userRecipes,
  meta,
  defaultMeal,
  onLog,
  onSaveRecipe,
  onDeleteRecipe,
  onResetRecipe,
  onSetMeta,
}) {
  const { list: catalog, error } = useCatalog();
  const recipes = useMemo(() => mergeRecipes(catalog, userRecipes), [catalog, userRecipes]);
  const keep = view.f ? { f: 1 } : {};

  if (view.screen === "edit") {
    const recipe = view.recipeId ? recipes.find((r) => r.id === view.recipeId) : null;
    if (view.recipeId && !recipe && !catalog) return <Loading onBack={back} />;
    return (
      <RecipeEditor
        key={view.recipeId || "new"}
        recipe={recipe}
        onCancel={back}
        onSave={(r) => {
          onSaveRecipe(r);
          back();
        }}
      />
    );
  }

  if (view.screen === "recipe") {
    const recipe = recipes.find((r) => r.id === view.recipeId);
    if (!recipe) return catalog || error ? <Missing onBack={back} /> : <Loading onBack={back} />;
    return (
      <RecipeDetail
        key={recipe.id}
        recipe={recipe}
        meta={meta}
        defaultMeal={CATEGORY_MEAL[recipe.category] || defaultMeal}
        onBack={back}
        onLog={onLog}
        onEdit={() => nav({ tab: "recipes", screen: "edit", recipeId: recipe.id, d: (view.d || 1) + 1, ...keep })}
        onDelete={() => {
          onDeleteRecipe(recipe.id, recipe.name);
          back();
        }}
        onReset={() => onResetRecipe(recipe.id)}
        onSetMeta={(patch) => onSetMeta(recipe.id, patch)}
      />
    );
  }

  return (
    <RecipeList
      recipes={recipes}
      loading={!catalog && !error}
      error={error}
      meta={meta}
      onOpen={(id) => nav({ tab: "recipes", screen: "recipe", recipeId: id, d: 1, ...keep })}
      onNew={() => nav({ tab: "recipes", screen: "edit", recipeId: null, d: 1, ...keep })}
      onToggleFav={(id) => onSetMeta(id, { favorite: !meta?.[id]?.favorite })}
    />
  );
}

function Loading({ onBack }) {
  return (
    <div className="page">
      <TopBar title="Recipe" onBack={onBack} />
      <p className="hint">Loading recipes…</p>
    </div>
  );
}

function Missing({ onBack }) {
  return (
    <div className="page">
      <TopBar title="Recipe" onBack={onBack} />
      <p className="hint">This recipe is no longer here.</p>
    </div>
  );
}

function RecipeList({ recipes, loading, error, meta, onOpen, onNew, onToggleFav }) {
  const [prefs, setPrefsState] = useState(readPrefs);
  const setPrefs = (patch) =>
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      writePrefs(next);
      return next;
    });

  const byCollection = recipes.filter((r) => prefs.collection === "all" || r.collection === prefs.collection);
  const counts = {};
  for (const r of byCollection) counts[r.category] = (counts[r.category] || 0) + 1;
  const q = prefs.query.trim();
  const shown = byCollection
    .filter((r) => (!prefs.category || r.category === prefs.category) && (!prefs.favs || meta?.[r.id]?.favorite) && matchesRecipe(r, q))
    .sort((a, b) => {
      const fa = meta?.[a.id]?.favorite ? 0 : 1;
      const fb = meta?.[b.id]?.favorite ? 0 : 1;
      const ca = isCooked(a, meta) ? 0 : 1;
      const cb = isCooked(b, meta) ? 0 : 1;
      return fa - fb || ca - cb || a.name.localeCompare(b.name);
    });

  return (
    <div className="page page-tabs">
      <h1 className="apptitle">
        Recipes<span>.</span>
      </h1>
      <div className="searchbox">
        <input
          className="input"
          type="search"
          aria-label="Search recipes or ingredients"
          placeholder="Search recipes or ingredients"
          value={prefs.query}
          onChange={(e) => setPrefs({ query: e.target.value })}
        />
        {prefs.query && (
          <IconButton label="Clear search" className="searchclear" onClick={() => setPrefs({ query: "" })}>
            ✕
          </IconButton>
        )}
      </div>
      <div className="chips seg" role="group" aria-label="Collection">
        {COLLECTIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={"chip" + (prefs.collection === c.id ? " sel" : "")}
            aria-pressed={prefs.collection === c.id}
            onClick={() => setPrefs({ collection: c.id })}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          className={"chip favchip" + (prefs.favs ? " sel" : "")}
          aria-pressed={prefs.favs}
          aria-label="Favourites only"
          onClick={() => setPrefs({ favs: !prefs.favs })}
        >
          ★
        </button>
      </div>
      <div className="chips scrollchips" role="group" aria-label="Meal type">
        <button
          type="button"
          className={"chip small" + (!prefs.category ? " sel" : "")}
          aria-pressed={!prefs.category}
          onClick={() => setPrefs({ category: "" })}
        >
          Any ({byCollection.length})
        </button>
        {CATEGORIES.filter((c) => counts[c.id]).map((c) => (
          <button
            key={c.id}
            type="button"
            className={"chip small" + (prefs.category === c.id ? " sel" : "")}
            aria-pressed={prefs.category === c.id}
            onClick={() => setPrefs({ category: prefs.category === c.id ? "" : c.id })}
          >
            {c.label} ({counts[c.id]})
          </button>
        ))}
      </div>
      <button type="button" className="bigbtn secondary" onClick={onNew}>
        + New recipe
      </button>
      {loading && <p className="hint">Loading recipes…</p>}
      {error && <p className="warn">Recipes could not be loaded. Check your connection and reopen the app.</p>}
      {!loading && !error && shown.length === 0 && <p className="hint">No recipes match.</p>}
      {shown.map((r) => {
        const fav = !!meta?.[r.id]?.favorite;
        const m = r.macros;
        return (
          <div key={r.id} className="card foodrow">
            <button type="button" className="foodrow-main" onClick={() => onOpen(r.id)}>
              <span className="foodrow-name">{r.name}</span>
              <span className="foodrow-sub">
                {CATEGORY_LABELS[r.category] || "Recipe"}
                {m?.kcal ? ` · ${Math.round(m.kcal)} kcal · P ${fmtNum(m.protein)}g` : ""}
                {r.timeMin ? ` · ${r.timeMin} min` : ""}
              </span>
              <span className="foodrow-tags">
                {isCooked(r, meta) && <span className="tag tag-ok">Cooked</span>}
                {r.collection === "saved" && <span className="tag">Saved</span>}
                {r.collection === "despina" && <span className="tag">Despina</span>}
                {isDraft(r, meta) && <span className="tag tag-warn">Draft steps</span>}
              </span>
            </button>
            <IconButton
              label={fav ? `Remove ${r.name} from favourites` : `Add ${r.name} to favourites`}
              className={"star" + (fav ? " on" : "")}
              aria-pressed={fav}
              onClick={() => onToggleFav(r.id)}
            >
              {fav ? "★" : "☆"}
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}

function RecipeDetail({ recipe, meta, defaultMeal, onBack, onLog, onEdit, onDelete, onReset, onSetMeta }) {
  const base = recipe.servings || 1;
  const [servings, setServings] = useState(base);
  const [logOpen, setLogOpen] = useState(false);
  const [confirm, confirmEl] = useConfirm();
  const cooked = isCooked(recipe, meta);
  const draft = isDraft(recipe, meta);
  const fav = !!meta?.[recipe.id]?.favorite;
  const ingredients = scaleIngredients(recipe.ingredients, servings / base);
  const m = recipe.macros;
  const sub = [CATEGORY_LABELS[recipe.category], recipe.timeMin ? `${recipe.timeMin} min` : null].filter(Boolean).join(" · ");

  return (
    <div className="page">
      <TopBar title={recipe.name} sub={sub} onBack={onBack}>
        <IconButton
          label={fav ? "Remove from favourites" : "Add to favourites"}
          className={"star" + (fav ? " on" : "")}
          aria-pressed={fav}
          onClick={() => onSetMeta({ favorite: !fav })}
        >
          {fav ? "★" : "☆"}
        </IconButton>
      </TopBar>

      <div className="foodrow-tags recipe-tags">
        {cooked && <span className="tag tag-ok">Cooked</span>}
        {recipe.collection === "saved" && <span className="tag">Saved, not cooked yet</span>}
        {recipe.collection === "despina" && <span className="tag">From Despina's plan</span>}
        {recipe.edited && <span className="tag">Edited</span>}
      </div>

      {m?.kcal > 0 && (
        <div className="card">
          <div className="recipe-macros-head">
            <span className="flabel">Per serving</span>
            {recipe.macrosBy === "claude-estimate" && <span className="hint small">estimated</span>}
          </div>
          <div className="macrorow">
            <span className="macro kcal">{Math.round(m.kcal)} kcal</span>
            <span className="macro">P {fmtNum(m.protein)}g</span>
            <span className="macro">C {fmtNum(m.carbs)}g</span>
            <span className="macro">F {fmtNum(m.fat)}g</span>
            {m.fiber > 0 && <span className="macro">Fibre {fmtNum(m.fiber)}g</span>}
          </div>
        </div>
      )}

      <button type="button" className="bigbtn" onClick={() => setLogOpen(true)} disabled={!(m?.kcal > 0)}>
        Log this
      </button>

      <div className="recipe-servings">
        <span className="flabel">Servings</span>
        <NumInput value={servings} onChange={setServings} min={0.5} max={50} step={0.5} label="Servings" />
      </div>

      <h2>Ingredients</h2>
      <div className="card">
        <ul className="ingredients">
          {ingredients.map((i, n) => (
            <li key={n}>
              <span className="ing-qty">{fmtQty(i.qty, i.unit)}</span>
              <span className="ing-item">
                {i.item}
                {i.unit === "to taste" && <span className="muted">, to taste</span>}
                {i.note && <span className="muted">, {i.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <h2>Steps</h2>
      {draft && (
        <p className="hint small draftnote">Drafted by Claude: these steps were written, not taken from a source. Mark the recipe as cooked once you've made it.</p>
      )}
      <ol className="steps">
        {(recipe.steps || []).map((s, n) => (
          <li key={n}>{s}</li>
        ))}
      </ol>

      {recipe.notes && (
        <>
          <h2>Notes</h2>
          <p className="recipe-notes">{recipe.notes}</p>
        </>
      )}
      {recipe.sources?.length > 0 && (
        <p className="hint small recipe-sources">
          Source:{" "}
          {recipe.sources.map((s, n) => (
            <span key={n}>
              {n > 0 && "; "}
              {/^https?:\/\//.test(s) ? (
                <a href={s} target="_blank" rel="noreferrer">
                  {s.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
                </a>
              ) : (
                s
              )}
            </span>
          ))}
        </p>
      )}

      <div className="recipe-actions">
        <button
          type="button"
          className={"bigbtn " + (cooked ? "ghost" : "secondary")}
          aria-pressed={cooked}
          onClick={() => onSetMeta({ cooked: !meta?.[recipe.id]?.cooked })}
          disabled={recipe.status === "cooked"}
        >
          {cooked ? "Cooked ✓" : "I cooked this"}
        </button>
        <button type="button" className="bigbtn secondary" onClick={onEdit}>
          Edit
        </button>
        {recipe.edited && (
          <button
            type="button"
            className="bigbtn ghost"
            onClick={async () => {
              if (await confirm({ title: "Reset to original?", message: "Your edits to this recipe will be discarded.", confirmLabel: "Reset" }))
                onReset();
            }}
          >
            Reset to original
          </button>
        )}
        <button
          type="button"
          className="bigbtn danger"
          onClick={async () => {
            if (await confirm({ title: `Delete ${recipe.name}?`, confirmLabel: "Delete", danger: true })) onDelete();
          }}
        >
          Delete
        </button>
      </div>

      {confirmEl}
      {logOpen && (
        <LogSheet
          recipe={recipe}
          initialServings={servings / base}
          defaultMeal={defaultMeal}
          onClose={() => setLogOpen(false)}
          onLog={(meal, n) => {
            onLog(recipe, meal, n);
            setLogOpen(false);
          }}
        />
      )}
    </div>
  );
}

function LogSheet({ recipe, initialServings, defaultMeal, onClose, onLog }) {
  const [meal, setMeal] = useState(MEALS.includes(defaultMeal) ? defaultMeal : "snacks");
  const [n, setN] = useState(Math.max(0.25, Math.round(initialServings * 4) / 4));
  const m = recipe.macros || {};
  return (
    <Modal onClose={onClose} title={`Log ${recipe.name}`} sheet>
      <p className="flabel">Meal</p>
      <div className="chips" role="group" aria-label="Meal">
        {MEALS.map((x) => (
          <button key={x} type="button" className={"chip" + (meal === x ? " sel" : "")} aria-pressed={meal === x} onClick={() => setMeal(x)}>
            {MEAL_LABELS[x]}
          </button>
        ))}
      </div>
      <p className="flabel">Servings eaten</p>
      <NumInput value={n} onChange={setN} min={0.25} max={20} step={0.25} label="Servings eaten" />
      <div className="macrorow log-preview">
        <span className="macro kcal">{Math.round((m.kcal || 0) * n)} kcal</span>
        <span className="macro">P {fmtNum((m.protein || 0) * n)}g</span>
        <span className="macro">C {fmtNum((m.carbs || 0) * n)}g</span>
        <span className="macro">F {fmtNum((m.fat || 0) * n)}g</span>
      </div>
      <div className="btnrow">
        <button type="button" className="linkbtn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="bigbtn" onClick={() => onLog(meal, n)} disabled={!(n > 0)}>
          Add to {MEAL_LABELS[meal]}
        </button>
      </div>
    </Modal>
  );
}

const MACRO_FIELDS = [
  { key: "kcal", label: "kcal", max: 5000 },
  { key: "protein", label: "Protein g", max: 500 },
  { key: "carbs", label: "Carbs g", max: 800 },
  { key: "fat", label: "Fat g", max: 400 },
  { key: "fiber", label: "Fibre g", max: 200 },
];

function RecipeEditor({ recipe, onSave, onCancel }) {
  const [name, setName] = useState(recipe?.name || "");
  const [category, setCategory] = useState(recipe?.category || "dinner");
  const [servings, setServings] = useState(recipe?.servings || 1);
  const [timeMin, setTimeMin] = useState(recipe?.timeMin || 0);
  const [macros, setMacros] = useState(() => {
    const m = recipe?.macros || {};
    return Object.fromEntries(MACRO_FIELDS.map((f) => [f.key, Number(m[f.key]) || 0]));
  });
  const [ingredients, setIngredients] = useState(() => (recipe?.ingredients || []).map(ingredientLine).join("\n"));
  const [steps, setSteps] = useState(() => (recipe?.steps || []).join("\n"));
  const [notes, setNotes] = useState(recipe?.notes || "");

  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    const { builtIn: _b, edited: _e, ...prev } = recipe || {};
    const macrosChanged = recipe && MACRO_FIELDS.some((f) => (Number(recipe.macros?.[f.key]) || 0) !== macros[f.key]);
    const stepsText = (recipe?.steps || []).join("\n");
    onSave({
      collection: "mine",
      status: "approved",
      tags: [],
      ...prev,
      id: recipe?.id || newId(),
      name: name.trim(),
      category,
      servings: Math.max(0.5, Number(servings) || 1),
      timeMin: timeMin > 0 ? timeMin : undefined,
      macros,
      macrosBy: !recipe || macrosChanged ? "user" : prev.macrosBy,
      ingredients: ingredients.split("\n").map(parseIngredient).filter(Boolean),
      steps: steps
        .split("\n")
        .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean),
      stepsBy: !recipe || steps.trim() !== stepsText.trim() ? "user" : prev.stepsBy,
      notes: notes.trim(),
    });
  };

  return (
    <div className="page">
      <TopBar title={recipe ? "Edit recipe" : "New recipe"} onBack={onCancel} />
      <div className="field">
        <label className="flabel" htmlFor="re-name">
          Name
        </label>
        <input id="re-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={140} />
      </div>
      <div className="field">
        <label className="flabel" htmlFor="re-cat">
          Meal type
        </label>
        <select id="re-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="editor-grid">
        <div className="field">
          <span className="flabel">Servings</span>
          <NumInput value={servings} onChange={setServings} min={0.5} max={50} step={0.5} label="Servings" />
        </div>
        <div className="field">
          <span className="flabel">Minutes</span>
          <NumInput value={timeMin} onChange={setTimeMin} min={0} max={4320} step={5} label="Minutes" />
        </div>
      </div>
      <p className="flabel">Macros per serving</p>
      <div className="editor-grid">
        {MACRO_FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <span className="flabel">{f.label}</span>
            <NumInput
              value={macros[f.key]}
              onChange={(v) => setMacros((m) => ({ ...m, [f.key]: v }))}
              min={0}
              max={f.max}
              step={f.key === "kcal" ? 10 : 1}
              label={f.label}
            />
          </div>
        ))}
      </div>
      <div className="field">
        <label className="flabel" htmlFor="re-ing">
          Ingredients, one per line
        </label>
        <textarea
          id="re-ing"
          className="input textarea"
          rows={8}
          value={ingredients}
          placeholder={"200 g chicken breast, skinless\n2 tbsp olive oil\n3 eggs\nsalt"}
          onChange={(e) => setIngredients(e.target.value)}
        />
        <p className="hint small">Start with an amount and a unit (g, ml, tbsp, tsp, slice, clove). Add details after a comma.</p>
      </div>
      <div className="field">
        <label className="flabel" htmlFor="re-steps">
          Steps, one per line
        </label>
        <textarea id="re-steps" className="input textarea" rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </div>
      <div className="field">
        <label className="flabel" htmlFor="re-notes">
          Notes
        </label>
        <textarea id="re-notes" className="input textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="btnrow">
        <button type="button" className="linkbtn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="bigbtn" onClick={save} disabled={!canSave}>
          Save
        </button>
      </div>
    </div>
  );
}
