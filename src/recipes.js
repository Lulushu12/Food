import { useEffect, useState } from "react";

export const COLLECTIONS = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "despina", label: "Despina" },
  { id: "saved", label: "Saved" },
];

export const CATEGORIES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "preworkout", label: "Pre-workout" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snack" },
  { id: "dessert", label: "Dessert" },
  { id: "bread", label: "Bread" },
  { id: "sauce", label: "Sauce" },
  { id: "side", label: "Side" },
];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const UNITS = ["g", "ml", "pc", "tbsp", "tsp", "slice", "clove", "pinch", "to taste"];

// Which log meal a recipe category lands in by default.
export const CATEGORY_MEAL = {
  breakfast: "breakfast",
  preworkout: "lunch",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snacks",
  dessert: "snacks",
};

let catalogPromise = null;

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = import("./recipes/catalog.json").then((m) => m.default || m);
    catalogPromise.catch(() => {
      catalogPromise = null;
    });
  }
  return catalogPromise;
}

// The built-in catalog ships as a lazy chunk so the logging screens stay light.
export function useCatalog() {
  const [state, setState] = useState({ list: null, error: false });
  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (list) => live && setState({ list, error: false }),
      () => live && setState({ list: null, error: true })
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

// Built-in recipes overlaid with the user's edits (same id), minus the ones the
// user deleted, plus recipes the user created.
export function mergeRecipes(catalog, userRecipes) {
  const user = userRecipes || {};
  const out = [];
  const seen = new Set();
  for (const r of catalog || []) {
    seen.add(r.id);
    const u = user[r.id];
    if (u?.deleted) continue;
    out.push(u ? { ...u, builtIn: true, edited: true } : { ...r, builtIn: true });
  }
  for (const u of Object.values(user)) {
    if (seen.has(u.id) || u.deleted) continue;
    out.push(u);
  }
  return out;
}

export function isCooked(recipe, meta) {
  return recipe.status === "cooked" || !!meta?.[recipe.id]?.cooked;
}

export function isDraft(recipe, meta) {
  return recipe.stepsBy === "claude-draft" && !isCooked(recipe, meta);
}

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function matchesRecipe(recipe, query) {
  if (!query) return true;
  const hay = fold([recipe.name, ...(recipe.tags || []), ...(recipe.ingredients || []).map((i) => i.item)].join(" "));
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function roundQty(qty, unit) {
  if (unit === "g" || unit === "ml") {
    if (qty >= 100) return Math.round(qty / 5) * 5;
    if (qty >= 10) return Math.round(qty);
    return Math.round(qty * 10) / 10;
  }
  if (unit === "tbsp" || unit === "tsp") return Math.round(qty * 4) / 4;
  return Math.round(qty * 2) / 2;
}

const FRACTIONS = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

export function fmtQty(qty, unit) {
  if (qty == null || unit === "to taste") return "";
  const r = roundQty(qty, unit);
  const whole = Math.floor(r);
  const frac = Math.round((r - whole) * 100) / 100;
  let text;
  if (unit !== "g" && unit !== "ml" && FRACTIONS[frac]) text = (whole ? whole : "") + FRACTIONS[frac];
  else text = String(r);
  return unit === "pc" ? text : `${text} ${unit}`;
}

export function scaleIngredients(ingredients, factor) {
  return (ingredients || []).map((i) => (i.qty == null || i.unit === "pinch" ? i : { ...i, qty: i.qty * factor }));
}

// "200 g chicken breast, skinless" -> { qty: 200, unit: "g", item: "chicken breast", note: "skinless" }
export function parseIngredient(line) {
  const text = line.trim();
  if (!text) return null;
  const [main, ...rest] = text.split(/,\s*/);
  const note = rest.join(", ").trim();
  const m = main.match(/^(\d+(?:[.,]\d+)?)\s*(g|ml|pc|tbsp|tsp|slices?|cloves?|pinch)?\b\s*(.*)$/i);
  let out;
  if (m && m[3]) {
    const unit = (m[2] || "pc").toLowerCase().replace(/s$/, "");
    out = { qty: parseFloat(m[1].replace(",", ".")), unit, item: m[3].trim() };
  } else {
    out = { qty: null, unit: "to taste", item: main.trim() };
  }
  if (note) out.note = note;
  return out;
}

export function ingredientLine(i) {
  const q = i.qty == null || i.unit === "to taste" ? "" : `${Math.round(i.qty * 100) / 100}${i.unit === "pc" ? "" : " " + i.unit} `;
  return `${q}${i.item}${i.note ? ", " + i.note : ""}`;
}
