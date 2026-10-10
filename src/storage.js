import { createStore, todayKey } from "@shared/store.js";
import { dayTotals } from "./food.js";
import { RESTAURANT_FOODS } from "./recipes/restaurant.js";
import { GOALS } from "./tdee.js";

export const STORAGE_KEY = "calories-v1";

export const ARCHIVE_KEY = "archive";
export const STORE_VERSION = 3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateKey = (k) => typeof k === "string" && DATE_RE.test(k);

export const MEALS = ["breakfast", "lunch", "dinner", "snacks"];
export const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };

export function defaults() {
  return {
    foods: {},
    logs: {},
    weights: {},
    water: {},
    templates: {},
    recipes: {},
    recipeMeta: {},
    restaurantSeeded: false,
    tdee: null,
    settings: {
      targets: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      microTargets: { fiber: 30, salt: 6 },
      water: { step: 250, target: 2000, unit: "glass" },
      country: "ro",
      goal: "maintain",
      updatedAt: 0,
    },
  };
}

export function emptyDayLogs() {
  return { breakfast: [], lunch: [], dinner: [], snacks: [] };
}

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function lastTouched(f) {
  return Math.max(num(f.lastUsedAt), num(f.updatedAt));
}

export function dedupeFoods(foods) {
  const byCode = new Map();
  const remap = {};
  for (const f of Object.values(foods)) {
    if (!f.code) continue;
    const keep = byCode.get(f.code);
    if (!keep) {
      byCode.set(f.code, f);
      continue;
    }
    const [winner, loser] = lastTouched(f) > lastTouched(keep) ? [f, keep] : [keep, f];
    byCode.set(f.code, {
      ...winner,
      useCount: num(winner.useCount) + num(loser.useCount),
      favorite: !!(winner.favorite || loser.favorite),
    });
    remap[loser.id] = winner.id;
  }
  if (!Object.keys(remap).length) return { foods, remap };
  const out = {};
  for (const f of Object.values(foods)) {
    if (remap[f.id]) continue;
    out[f.id] = f.code ? byCode.get(f.code) : f;
  }
  for (const [from, to] of Object.entries(remap)) {
    let target = to;
    while (remap[target]) target = remap[target];
    remap[from] = target;
  }
  return { foods: out, remap };
}

const MICRO_FIELDS = ["fiber100", "sugars100", "satFat100", "salt100"];

function cleanMicros(o) {
  const out = { ...o };
  for (const k of MICRO_FIELDS) {
    if (out[k] == null) continue;
    const n = Number(out[k]);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
    else delete out[k];
  }
  return out;
}

function normalizeEntry(e) {
  if (!isObj(e)) return null;
  return {
    ...cleanMicros(e),
    id: e.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof e.name === "string" && e.name ? e.name : "Unnamed food",
    grams: num(e.grams),
    kcal100: num(e.kcal100),
    protein100: num(e.protein100),
    carbs100: num(e.carbs100),
    fat100: num(e.fat100),
    eatenAt: typeof e.eatenAt === "string" && /^\d{2}:\d{2}$/.test(e.eatenAt) ? e.eatenAt : undefined,
  };
}

export function normalize(store) {
  const foods = {};
  for (const [id, f] of Object.entries(isObj(store.foods) ? store.foods : {})) {
    if (!isObj(f)) continue;
    foods[id] = {
      ...cleanMicros(f),
      id,
      name: typeof f.name === "string" && f.name ? f.name : "Unnamed food",
      kcal100: num(f.kcal100),
      protein100: num(f.protein100),
      carbs100: num(f.carbs100),
      fat100: num(f.fat100),
    };
  }
  const { foods: deduped, remap } = dedupeFoods(foods);
  const fixId = (e) => (e.foodId && remap[e.foodId] ? { ...e, foodId: remap[e.foodId] } : e);

  const logs = {};
  const srcLogs = isObj(store.logs) ? store.logs : {};
  if (isObj(srcLogs[ARCHIVE_KEY])) {
    const archive = {};
    for (const [date, a] of Object.entries(srcLogs[ARCHIVE_KEY])) {
      if (!isDateKey(date) || !isObj(a)) continue;
      const rec = {};
      for (const k of ARCHIVE_FIELDS) rec[k] = num(a[k]);
      archive[date] = rec;
    }
    logs[ARCHIVE_KEY] = archive;
  }
  for (const [date, day] of Object.entries(srcLogs)) {
    if (!isDateKey(date) || !isObj(day)) continue;
    const next = { ...day };
    for (const m of MEALS) {
      next[m] = (Array.isArray(day[m]) ? day[m] : []).map(normalizeEntry).filter(Boolean).map(fixId);
    }
    logs[date] = next;
  }

  const templates = {};
  for (const [id, t] of Object.entries(isObj(store.templates) ? store.templates : {})) {
    if (!isObj(t) || !Array.isArray(t.items)) continue;
    templates[id] = {
      ...t,
      id,
      name: t.name || "Template",
      meal: MEALS.includes(t.meal) ? t.meal : "snacks",
      items: t.items.map(normalizeEntry).filter(Boolean).map(fixId),
    };
  }

  const recipes = {};
  for (const [id, r] of Object.entries(isObj(store.recipes) ? store.recipes : {})) {
    if (!isObj(r)) continue;
    if (r.deleted) {
      recipes[id] = { id, deleted: true, updatedAt: num(r.updatedAt) };
      continue;
    }
    recipes[id] = {
      ...r,
      id,
      name: typeof r.name === "string" && r.name ? r.name : "Recipe",
      servings: Math.max(1, num(r.servings, 1)),
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).filter(isObj),
      steps: (Array.isArray(r.steps) ? r.steps : []).filter((x) => typeof x === "string"),
      tags: (Array.isArray(r.tags) ? r.tags : []).filter((x) => typeof x === "string"),
      macros: isObj(r.macros) ? r.macros : null,
    };
  }

  const recipeMeta = {};
  for (const [id, m] of Object.entries(isObj(store.recipeMeta) ? store.recipeMeta : {})) {
    if (isObj(m)) recipeMeta[id] = m;
  }

  const weights = {};
  for (const [date, w] of Object.entries(isObj(store.weights) ? store.weights : {})) {
    if (isObj(w) && Number.isFinite(Number(w.kg)) && Number(w.kg) > 0) weights[date] = { ...w, kg: Number(w.kg) };
  }

  const water = {};
  for (const [date, w] of Object.entries(isObj(store.water) ? store.water : {})) {
    if (isObj(w) && Number.isFinite(Number(w.ml)) && Number(w.ml) >= 0) water[date] = { ...w, ml: Number(w.ml) };
  }

  const base = defaults().settings;
  const s = isObj(store.settings) ? store.settings : {};
  const t = isObj(s.targets) ? s.targets : {};
  const settings = {
    ...base,
    ...s,
    targets: { kcal: num(t.kcal), protein: num(t.protein), carbs: num(t.carbs), fat: num(t.fat) },
    microTargets: {
      fiber: num(s.microTargets?.fiber, base.microTargets.fiber),
      salt: num(s.microTargets?.salt, base.microTargets.salt),
    },
    country: typeof s.country === "string" ? s.country : "ro",
    water: {
      step: Math.max(10, num(s.water?.step, base.water.step)),
      target: Math.max(0, num(s.water?.target, base.water.target)),
      unit: s.water?.unit === "ml" ? "ml" : "glass",
    },
    goal: GOALS.some((g) => g.id === s.goal) ? s.goal : "maintain",
  };

  return { ...store, foods: deduped, logs, templates, recipes, recipeMeta, weights, water, settings };
}

const ARCHIVE_FIELDS = ["kcal", "protein", "carbs", "fat", "fiber", "sugars", "satFat", "salt", "water", "entries"];
const YEAR_MS = 365 * 86400000;

export function cutoffDate(today = todayKey()) {
  const [y, m, d] = today.split("-");
  return `${Number(y) - 1}-${m}-${d}`;
}

const r1 = (v) => Math.round(v * 10) / 10;

export function compactStore(store, today = todayKey(), now = Date.now()) {
  const cutoff = cutoffDate(today);
  const srcLogs = isObj(store.logs) ? store.logs : {};
  const srcWater = isObj(store.water) ? store.water : {};
  const oldDays = Object.keys(srcLogs).filter((d) => isDateKey(d) && d < cutoff);
  const oldWater = Object.keys(srcWater).filter((d) => isDateKey(d) && d < cutoff);
  const usedIds = new Set();
  for (const t of Object.values(isObj(store.templates) ? store.templates : {})) {
    for (const it of Array.isArray(t?.items) ? t.items : []) if (it?.foodId) usedIds.add(it.foodId);
  }
  const staleFoods = Object.values(isObj(store.foods) ? store.foods : {}).filter(
    (f) =>
      isObj(f) &&
      !f.lastUsedAt &&
      !f.useCount &&
      !f.favorite &&
      !usedIds.has(f.id) &&
      num(f.updatedAt) > 0 &&
      now - num(f.updatedAt) > YEAR_MS
  );
  if (!oldDays.length && !oldWater.length && !staleFoods.length) return store;

  const logs = { ...srcLogs };
  const water = { ...srcWater };
  const archive = { ...(isObj(srcLogs[ARCHIVE_KEY]) ? srcLogs[ARCHIVE_KEY] : {}) };
  const empty = () => Object.fromEntries(ARCHIVE_FIELDS.map((k) => [k, 0]));
  for (const d of oldDays) {
    const t = dayTotals(logs[d]);
    const prev = archive[d] || empty();
    archive[d] = {
      kcal: Math.round(t.kcal),
      protein: r1(t.protein),
      carbs: r1(t.carbs),
      fat: r1(t.fat),
      fiber: r1(t.fiber),
      sugars: r1(t.sugars),
      satFat: r1(t.satFat),
      salt: Math.round(t.salt * 100) / 100,
      water: prev.water,
      entries: t.entries,
    };
    delete logs[d];
  }
  for (const d of oldWater) {
    archive[d] = { ...(archive[d] || empty()), water: num(water[d]?.ml) };
    delete water[d];
  }
  logs[ARCHIVE_KEY] = archive;
  let foods = store.foods;
  if (staleFoods.length) {
    foods = { ...store.foods };
    for (const f of staleFoods) delete foods[f.id];
  }
  return { ...store, logs, water, foods };
}

function migrate(store, from) {
  let next = store;
  if (from < 2) next = compactStore(next);
  if (from < 3) next = dropTrainingAndSeeds(next);
  return next;
}

// v3 (Food): training moved to Life Architecture, and the meal options that
// used to be seeded as templates now live in the recipe catalog. Templates the
// user created or edited are kept.
function dropTrainingAndSeeds(store) {
  const { exercises: _e, training: _t, routines: _r, templatesSeeded: _s, ...rest } = store;
  const templates = {};
  for (const [id, t] of Object.entries(isObj(store.templates) ? store.templates : {})) {
    if (isObj(t) && t.seeded && !num(t.updatedAt)) continue;
    templates[id] = t;
  }
  return { ...rest, templates };
}

function withSeed(store) {
  if (store.restaurantSeeded) return store;
  const foods = { ...(store.foods || {}) };
  for (const f of RESTAURANT_FOODS) if (!foods[f.id]) foods[f.id] = { ...f };
  return { ...store, foods, restaurantSeeded: true };
}

const base = createStore({ key: STORAGE_KEY, version: STORE_VERSION, defaults, migrate, normalize });

export const storeDef = { key: base.key, save: base.save, load: () => compactStore(withSeed(base.load())) };

function mergeById(local, imported) {
  const out = { ...(local || {}) };
  for (const [id, rec] of Object.entries(isObj(imported) ? imported : {})) {
    if (!isObj(rec)) continue;
    if (!out[id] || num(rec.updatedAt) > num(out[id].updatedAt)) out[id] = rec;
  }
  return out;
}

export function dayStamp(day) {
  if (!isObj(day)) return 0;
  let max = Math.max(num(day.updatedAt), num(day.deletedAt));
  for (const m of MEALS) for (const e of Array.isArray(day[m]) ? day[m] : []) max = Math.max(max, num(e?.updatedAt));
  return max;
}

export function mergeImport(store, imported) {
  if (!isObj(imported)) return store;
  const next = { ...store };
  next.foods = mergeById(store.foods, imported.foods);
  next.weights = mergeById(store.weights, imported.weights);
  next.water = mergeById(store.water, imported.water);
  next.templates = mergeById(store.templates, imported.templates);
  next.recipes = mergeById(store.recipes, imported.recipes);
  next.recipeMeta = mergeById(store.recipeMeta, imported.recipeMeta);
  const logs = { ...store.logs };
  const impArchive = isObj(imported.logs?.[ARCHIVE_KEY]) ? imported.logs[ARCHIVE_KEY] : null;
  if (impArchive) {
    const archive = { ...(isObj(logs[ARCHIVE_KEY]) ? logs[ARCHIVE_KEY] : {}) };
    for (const [date, a] of Object.entries(impArchive)) if (!archive[date] && !logs[date]) archive[date] = a;
    logs[ARCHIVE_KEY] = archive;
  }
  for (const [date, dayLogs] of Object.entries(isObj(imported.logs) ? imported.logs : {})) {
    if (!isDateKey(date) || !isObj(dayLogs)) continue;
    if (logs[ARCHIVE_KEY]?.[date]) continue;
    if (!logs[date] || dayStamp(dayLogs) > dayStamp(logs[date])) logs[date] = { ...emptyDayLogs(), ...dayLogs };
  }
  next.logs = logs;
  if (isObj(imported.settings) && num(imported.settings.updatedAt) > num(store.settings.updatedAt)) {
    next.settings = { ...store.settings, ...imported.settings };
  }
  return compactStore(normalize(next));
}

export function validateBackup(d) {
  return Boolean(isObj(d) && (d.logs || d.foods || d.weights || d.recipes));
}
