import { useCallback, useEffect, useRef, useState } from "react";
import { usePersistentStore, useVisibleDate, newId } from "@shared/store.js";
import { useHistoryNav } from "@shared/useHistoryNav.js";
import { registerSw } from "@shared/swRegister.js";
import { useToast } from "@shared/ui.jsx";
import { emitEvent } from "@shared/bridge.js";
import { quickItem } from "./templates.js";
import { storeDef, STORAGE_KEY, MEALS, MEAL_LABELS, emptyDayLogs, mergeImport, isDateKey, ARCHIVE_KEY } from "./storage.js";
import { addDays } from "./dateUtils.js";
import { dayTotals, roundTotals } from "./food.js";
import { TabBar } from "./ui.jsx";
import TodayView from "./TodayView.jsx";
import WeekView from "./WeekView.jsx";
import FoodsView from "./FoodsView.jsx";
import RecipesView from "./RecipesView.jsx";
import WeightView from "./WeightView.jsx";
import SettingsView from "./SettingsView.jsx";
import FoodPicker from "./FoodPicker.jsx";

// The app id, store key and event names stay "calories" so Life Architecture
// keeps reading this app's macros (same origin on the web).
const APP = "calories";
const TABS = ["today", "recipes", "foods", "weight", "settings"];
const ROOT = { tab: "today" };
const OVERLAY_SCREENS = new Set(["entry", "mealmenu"]);

export function mealForNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snacks";
}

export function timeOfDay(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function firstLevel(v, store) {
  if (!v.screen) return null;
  if (v.tab === "today") {
    if (v.screen === "picker" && MEALS.includes(v.meal)) return { tab: "today", screen: "picker", meal: v.meal, step: "list", d: 1 };
    if (v.screen === "week") return { tab: "today", screen: "week", d: 1 };
    return null;
  }
  if (v.tab === "foods" && v.screen === "edit") {
    if (v.foodId == null || store.foods[v.foodId]) return { tab: "foods", screen: "edit", foodId: v.foodId ?? null, d: 1 };
    return null;
  }
  if (v.tab === "recipes" && (v.screen === "recipe" || v.screen === "edit") && v.recipeId) {
    return { tab: "recipes", screen: "recipe", recipeId: v.recipeId, d: 1 };
  }
  return null;
}

function useSelectedDate(today) {
  const [sel, setSel] = useState(null);
  const date = sel ?? today;
  const step = useCallback(
    (n) => {
      if (n === 0) return setSel(null);
      setSel((cur) => {
        const next = addDays(cur ?? today, n);
        return next === today ? null : next;
      });
    },
    [today]
  );
  const set = useCallback((d) => setSel(d === today ? null : d), [today]);
  return [date, step, set];
}

export default function App() {
  const [store, setStore, status] = usePersistentStore(storeDef);
  const { view, nav, back, replace } = useHistoryNav(ROOT, { persistKey: "calories:view" });
  const toast = useToast();
  const today = useVisibleDate();
  const [todayDate, stepToday] = useSelectedDate(today);
  const [weightDate, stepWeight, setWeightDate] = useSelectedDate(today);
  const [highlight, setHighlight] = useState(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const v = view && TABS.includes(view.tab) ? view : ROOT;

  useEffect(() => {
    registerSw({
      onUpdate: (reload) => toast("Update available", { action: { label: "Reload", onClick: reload }, duration: 0 }),
    });
  }, [toast]);

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let action = null;
    try {
      const params = new URLSearchParams(window.location.search);
      action = params.get("action");
      if (action) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
    } catch {
      action = null;
    }
    if (action === "log") {
      replace(ROOT);
      nav({ tab: "today", screen: "picker", meal: mealForNow(), step: "list", d: 1 });
      return;
    }
    if (action === "weight") {
      replace({ tab: "weight" });
      return;
    }
    if (v.screen || v.f) {
      const lvl = firstLevel(v, storeRef.current);
      replace({ tab: v.tab });
      if (lvl) nav(lvl);
    }
  }, []);

  const goTab = (t) => {
    if (t === v.tab && !v.screen) return;
    if (v.tab === "today") nav({ tab: t, f: 1 });
    else if (t === "today" && v.f) back();
    else if (t === "today") replace(ROOT);
    else replace({ tab: t, ...(v.f ? { f: 1 } : {}) });
  };

  const close = useCallback((d) => window.history.go(-(d || 1)), []);

  const dirtyDays = useRef(new Set());
  useEffect(() => {
    if (dirtyDays.current.size) {
      const dates = [...dirtyDays.current];
      dirtyDays.current.clear();
      for (const d of dates) {
        emitEvent({ app: APP, type: "calories.day", dayKey: d, value: roundTotals(dayTotals(store.logs[d])) });
      }
    }
  }, [store]);

  const updateDay = (date, fn, extra) => {
    dirtyDays.current.add(date);
    setStore((s) => {
      const day = { ...emptyDayLogs(), ...(s.logs[date] || {}) };
      const now = Date.now();
      const next = { ...fn(day), updatedAt: now, ...(extra ? extra(now) : {}) };
      return { ...s, logs: { ...s.logs, [date]: next } };
    });
  };

  const removeEntries = (date, ids) => {
    const set = new Set(ids);
    updateDay(
      date,
      (day) => {
        const out = { ...day };
        for (const m of MEALS) out[m] = (day[m] || []).filter((e) => !set.has(e.id));
        return out;
      },
      (now) => ({ deletedAt: now })
    );
  };

  const addEntries = (date, meal, payloads) => {
    const now = Date.now();
    const entries = payloads.map((p) => {
      const { id: _drop, updatedAt: _u, ...rest } = p;
      return { grams: 0, ...rest, eatenAt: rest.eatenAt || timeOfDay(), id: newId(), updatedAt: now };
    });
    updateDay(date, (day) => ({ ...day, [meal]: [...(day[meal] || []), ...entries] }));
    setStore((s) => {
      let foods = s.foods;
      for (const e of entries) {
        const f = e.foodId && foods[e.foodId];
        if (!f) continue;
        const patch = { lastUsedAt: now, useCount: (f.useCount || 0) + 1 };
        if (payloads.length === 1 && !e.quick) {
          patch.lastGrams = e.grams;
          if (e.pieces) patch.lastPieces = e.pieces;
        }
        foods = { ...foods, [f.id]: { ...f, ...patch } };
      }
      return foods === s.foods ? s : { ...s, foods };
    });
    return entries;
  };

  const flash = (id) => {
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2600);
  };

  const addFromPicker = (meal, payload, depth) => {
    const [entry] = addEntries(todayDate, meal, [payload]);
    const amount = entry.quick ? `${Math.round(entry.kcal100)} kcal` : entry.pieces ? `${entry.pieces} pc` : `${Math.round(entry.grams)} g`;
    close(depth);
    flash(entry.id);
    const date = todayDate;
    toast(`Added ${amount} ${entry.name} to ${MEAL_LABELS[meal]}`, {
      action: { label: "Undo", onClick: () => removeEntries(date, [entry.id]) },
      duration: 5000,
    });
  };

  const applyTemplate = (meal, tpl, depth) => {
    const entries = addEntries(todayDate, meal, tpl.items);
    const date = todayDate;
    if (depth) close(depth);
    if (entries[0]) flash(entries[0].id);
    toast(`Added "${tpl.name}" to ${MEAL_LABELS[meal]}`, {
      action: { label: "Undo", onClick: () => removeEntries(date, entries.map((e) => e.id)) },
      duration: 5000,
    });
  };

  const logRecipe = (recipe, meal, servings, depth) => {
    const m = recipe.macros || {};
    const item = quickItem({ name: recipe.name, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber });
    const [entry] = addEntries(todayDate, meal, [{ ...item, grams: Math.round(100 * servings * 100) / 100, recipeId: recipe.id }]);
    const date = todayDate;
    if (depth) close(depth);
    flash(entry.id);
    const label = servings === 1 ? "" : `${servings}× `;
    toast(`Added ${label}${recipe.name} to ${MEAL_LABELS[meal]}`, {
      action: { label: "Undo", onClick: () => removeEntries(date, [entry.id]) },
      duration: 5000,
    });
  };

  const saveRecipe = (recipe) =>
    setStore((s) => ({ ...s, recipes: { ...s.recipes, [recipe.id]: { ...recipe, updatedAt: Date.now() } } }));

  const deleteRecipe = (id, name) => {
    const prev = store.recipes[id];
    setStore((s) => ({ ...s, recipes: { ...s.recipes, [id]: { id, deleted: true, updatedAt: Date.now() } } }));
    toast.undo(`Deleted ${name}`, () =>
      setStore((s) => {
        const recipes = { ...s.recipes };
        if (prev) recipes[id] = { ...prev, updatedAt: Date.now() };
        else delete recipes[id];
        return { ...s, recipes };
      })
    );
  };

  const resetRecipe = (id) =>
    setStore((s) => {
      const recipes = { ...s.recipes };
      delete recipes[id];
      return { ...s, recipes };
    });

  const setRecipeMeta = (id, patch) =>
    setStore((s) => ({ ...s, recipeMeta: { ...s.recipeMeta, [id]: { ...s.recipeMeta[id], ...patch, updatedAt: Date.now() } } }));

  const copyMeal = (fromDate, fromMeal, toDate, toMeal) => {
    const src = store.logs[fromDate]?.[fromMeal] || [];
    if (!src.length) {
      toast(`Nothing logged for ${MEAL_LABELS[fromMeal]} on that day.`);
      return;
    }
    const entries = addEntries(toDate, toMeal, src);
    toast(`Copied ${entries.length} ${entries.length === 1 ? "item" : "items"} to ${MEAL_LABELS[toMeal]}`, {
      action: { label: "Undo", onClick: () => removeEntries(toDate, entries.map((e) => e.id)) },
      duration: 5000,
    });
  };

  const updateLogEntry = (date, meal, entryId, patch) =>
    updateDay(date, (day) => ({
      ...day,
      [meal]: (day[meal] || []).map((e) => (e.id === entryId ? { ...e, ...patch, updatedAt: Date.now() } : e)),
    }));

  const deleteLogEntry = (date, meal, entryId) => {
    const list = store.logs[date]?.[meal] || [];
    const index = list.findIndex((e) => e.id === entryId);
    if (index < 0) return;
    const entry = list[index];
    removeEntries(date, [entryId]);
    toast.undo(`Deleted ${entry.name}`, () =>
      updateDay(date, (day) => {
        const arr = [...(day[meal] || [])];
        arr.splice(Math.min(index, arr.length), 0, { ...entry, updatedAt: Date.now() });
        return { ...day, [meal]: arr };
      })
    );
  };

  const saveTemplate = (name, meal, entries) => {
    const id = newId();
    const items = entries.map(({ id: _i, updatedAt: _u, eatenAt: _t, ...rest }) => rest);
    setStore((s) => ({ ...s, templates: { ...s.templates, [id]: { id, name, meal, items, updatedAt: Date.now() } } }));
    toast(`Saved template "${name}"`);
  };

  const deleteTemplate = (id) => {
    const tpl = store.templates[id];
    if (!tpl) return;
    setStore((s) => {
      const templates = { ...s.templates };
      delete templates[id];
      return { ...s, templates };
    });
    toast.undo(`Deleted template "${tpl.name}"`, () =>
      setStore((s) => ({ ...s, templates: { ...s.templates, [id]: { ...tpl, updatedAt: Date.now() } } }))
    );
  };

  const saveFood = (food) =>
    setStore((s) => ({ ...s, foods: { ...s.foods, [food.id]: { ...s.foods[food.id], ...food, updatedAt: Date.now() } } }));

  const cacheFood = (draft) => {
    if (draft.code) {
      const existing = Object.values(store.foods).find((f) => f.code === draft.code);
      if (existing) return existing.id;
    }
    if (draft.id && store.foods[draft.id]) return draft.id;
    const id = draft.id || newId();
    saveFood({ ...draft, id });
    return id;
  };

  const toggleFavorite = (id) =>
    setStore((s) => (s.foods[id] ? { ...s, foods: { ...s.foods, [id]: { ...s.foods[id], favorite: !s.foods[id].favorite } } } : s));

  const deleteFood = (id) => {
    const food = store.foods[id];
    if (!food) return;
    setStore((s) => {
      const foods = { ...s.foods };
      delete foods[id];
      return { ...s, foods };
    });
    toast.undo(`Deleted ${food.name}`, () => setStore((s) => ({ ...s, foods: { ...s.foods, [id]: food } })));
  };

  const saveWeight = (date, kg) => {
    const value = Math.round(Number(kg) * 10) / 10;
    if (!(value > 0)) return;
    setStore((s) => ({ ...s, weights: { ...s.weights, [date]: { kg: value, updatedAt: Date.now() } } }));
    emitEvent({ app: APP, type: "calories.weight", dayKey: date, value: { kg: value } });
    toast(`Saved ${value.toFixed(1)} kg`);
  };

  const deleteWeight = (date) => {
    const rec = store.weights[date];
    if (!rec) return;
    setStore((s) => {
      const weights = { ...s.weights };
      delete weights[date];
      return { ...s, weights };
    });
    toast.undo(`Deleted weight for ${date}`, () =>
      setStore((s) => ({ ...s, weights: { ...s.weights, [date]: { ...rec, updatedAt: Date.now() } } }))
    );
  };

  const changeWater = (date, delta) =>
    setStore((s) => {
      const ml = Math.max(0, (s.water?.[date]?.ml || 0) + delta);
      return { ...s, water: { ...s.water, [date]: { ml, updatedAt: Date.now() } } };
    });

  const restoreBackup = (data) => {
    const cutoff = addDays(today, -60);
    for (const d of Object.keys(data?.logs || {})) if (isDateKey(d) && d >= cutoff) dirtyDays.current.add(d);
    setStore((s) => mergeImport(s, data));
  };

  const setSettings = (patch) =>
    setStore((s) => ({ ...s, settings: { ...s.settings, ...patch, updatedAt: Date.now() } }));

  const applyTargets = (proposal) => {
    const prev = store.settings.targets;
    const next = { ...prev, kcal: proposal.kcal, ...(proposal.protein != null ? { protein: proposal.protein } : {}) };
    setSettings({ targets: next });
    toast(`Targets set to ${next.kcal} kcal, ${next.protein} g protein`, {
      action: { label: "Undo", onClick: () => setSettings({ targets: prev }) },
      duration: 5000,
    });
  };

  const saveEstimate = useCallback((est) => setStore((s) => ({ ...s, tdee: est })), [setStore]);

  const banner = (!status.ok || store._recovered) && (
    <div className="page banner-wrap">
      {!status.ok && <p className="warn banner">Storage full: changes are not being saved. Export a backup from Settings.</p>}
      {store._recovered && (
        <div className="warn banner">
          Saved data was unreadable and has been reset; the raw copy is under {STORAGE_KEY}.corrupt.
          <button
            type="button"
            className="linkbtn"
            onClick={() =>
              setStore((s) => {
                const { _recovered, ...rest } = s;
                return rest;
              })
            }
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );

  let page;
  const pickerFood = v.screen === "picker" && v.foodId ? store.foods[v.foodId] : null;

  if (v.tab === "today" && v.screen === "picker" && MEALS.includes(v.meal)) {
    page = (
      <FoodPicker
        view={v}
        food={pickerFood}
        foods={store.foods}
        templates={store.templates}
        country={store.settings.country}
        date={todayDate}
        today={today}
        nav={nav}
        replace={replace}
        back={back}
        close={() => close(v.d)}
        onCacheFood={cacheFood}
        onSaveFood={saveFood}
        onToggleFavorite={toggleFavorite}
        onAdd={(payload) => addFromPicker(v.meal, payload, v.d)}
        onApplyTemplate={(tpl) => applyTemplate(v.meal, tpl, v.d)}
      />
    );
  } else if (v.tab === "today" && v.screen === "week") {
    page = (
      <WeekView
        logs={store.logs}
        weights={store.weights}
        targets={store.settings.targets}
        endDate={todayDate}
        today={today}
        onBack={back}
        goal={store.settings.goal}
        onGoal={(goal) => setSettings({ goal })}
        onApply={applyTargets}
        onEstimate={saveEstimate}
      />
    );
  } else if (v.tab === "today") {
    const dayLogs = store.logs[todayDate] || emptyDayLogs();
    const archived = store.logs[todayDate] ? null : store.logs[ARCHIVE_KEY]?.[todayDate] || null;
    page = (
      <TodayView
        date={todayDate}
        today={today}
        onStepDate={stepToday}
        dayLogs={dayLogs}
        targets={store.settings.targets}
        microTargets={store.settings.microTargets}
        archived={archived}
        waterMl={archived ? archived.water || 0 : store.water?.[todayDate]?.ml || 0}
        waterSettings={store.settings.water}
        onWater={(delta) => changeWater(todayDate, delta)}
        templates={store.templates}
        view={v}
        highlight={highlight}
        onAddFood={(meal) => nav({ tab: "today", screen: "picker", meal, step: "list", d: 1 })}
        defaultMeal={mealForNow()}
        onOpenEntry={(meal, id) => nav({ tab: "today", screen: "entry", date: todayDate, meal, entryId: id, d: 1 })}
        onOpenMenu={(meal) => nav({ tab: "today", screen: "mealmenu", meal, d: 1 })}
        onOpenWeek={() => nav({ tab: "today", screen: "week", d: 1 })}
        onCloseOverlay={back}
        logsFor={(date) => store.logs[date] || emptyDayLogs()}
        onUpdateEntry={(date, meal, id, patch) => updateLogEntry(date, meal, id, patch)}
        onDeleteEntry={(date, meal, id) => deleteLogEntry(date, meal, id)}
        onCopyMeal={copyMeal}
        onSaveTemplate={saveTemplate}
        onApplyTemplate={(meal, tpl) => applyTemplate(meal, tpl, 0)}
      />
    );
  } else if (v.tab === "foods") {
    page = (
      <FoodsView
        foods={store.foods}
        templates={store.templates}
        editingId={v.screen === "edit" ? v.foodId ?? null : undefined}
        onOpen={(id) => nav({ tab: "foods", screen: "edit", foodId: id, d: 1, ...(v.f ? { f: 1 } : {}) })}
        onBack={back}
        onSaveFood={saveFood}
        onDeleteFood={deleteFood}
        onToggleFavorite={toggleFavorite}
        onDeleteTemplate={deleteTemplate}
      />
    );
  } else if (v.tab === "recipes") {
    page = (
      <RecipesView
        view={v}
        nav={nav}
        back={back}
        replace={replace}
        userRecipes={store.recipes}
        meta={store.recipeMeta}
        defaultMeal={mealForNow()}
        date={todayDate}
        today={today}
        fromToday={!!v.f}
        onLog={(recipe, meal, servings) => logRecipe(recipe, meal, servings, 0)}
        onSaveRecipe={saveRecipe}
        onDeleteRecipe={deleteRecipe}
        onResetRecipe={resetRecipe}
        onSetMeta={setRecipeMeta}
      />
    );
  } else if (v.tab === "weight") {
    page = (
      <WeightView
        date={weightDate}
        today={today}
        onStepDate={stepWeight}
        onSetDate={setWeightDate}
        weights={store.weights}
        onSaveWeight={saveWeight}
        onDeleteWeight={deleteWeight}
      />
    );
  } else {
    page = (
      <SettingsView store={store} today={today} onRestore={restoreBackup} setSettings={setSettings} onApplyTargets={applyTargets} />
    );
  }

  const showTabs = !v.screen || OVERLAY_SCREENS.has(v.screen);

  return (
    <>
      {banner}
      {page}
      {showTabs && <TabBar tab={v.tab} onTab={goTab} />}
    </>
  );
}
