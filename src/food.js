import { MEALS } from "./storage.js";

export function macrosForGrams(food, grams) {
  const f = (Number(grams) || 0) / 100;
  return {
    kcal: (food.kcal100 || 0) * f,
    protein: (food.protein100 || 0) * f,
    carbs: (food.carbs100 || 0) * f,
    fat: (food.fat100 || 0) * f,
  };
}

export const MICROS = [
  { key: "fiber", field: "fiber100", label: "Fibre" },
  { key: "sugars", field: "sugars100", label: "Sugars" },
  { key: "satFat", field: "satFat100", label: "Sat. fat" },
  { key: "salt", field: "salt100", label: "Salt" },
];

export function hasMicros(e) {
  return MICROS.some((m) => Number.isFinite(e?.[m.field]));
}

export function entryMacros(e) {
  return macrosForGrams(e, e.grams);
}

export function gramsForPieces(food, pieces) {
  return (Number(pieces) || 0) * (food.pieceWeight || 0);
}

export function piecesForGrams(food, grams) {
  const pw = food.pieceWeight || 0;
  return pw > 0 ? Math.round(((Number(grams) || 0) / pw) * 100) / 100 : 0;
}

export function dayTotals(dayLogs) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugars: 0, satFat: 0, salt: 0, entries: 0, withMicros: 0 };
  if (!dayLogs) return t;
  for (const meal of MEALS) {
    for (const e of dayLogs[meal] || []) {
      const m = entryMacros(e);
      t.kcal += m.kcal;
      t.protein += m.protein;
      t.carbs += m.carbs;
      t.fat += m.fat;
      t.entries += 1;
      if (hasMicros(e)) t.withMicros += 1;
      const f = (Number(e.grams) || 0) / 100;
      for (const mi of MICROS) if (Number.isFinite(e[mi.field])) t[mi.key] += e[mi.field] * f;
    }
  }
  return t;
}

export function roundTotals(t) {
  const r = (v) => Math.round(v * 10) / 10;
  return { kcal: Math.round(t.kcal), protein: r(t.protein), carbs: r(t.carbs), fat: r(t.fat) };
}

const HALF_LIFE_DAYS = 14;

export function foodScore(f, now = Date.now()) {
  const last = f.lastUsedAt || f.updatedAt || 0;
  const ageDays = Math.max(0, (now - last) / 86400000);
  return (1 + (f.useCount || 0)) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS) + (last ? 0 : -1);
}

export function matchesQuery(f, q) {
  if (!q) return true;
  const hay = `${f.name} ${f.brand || ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function entryLabel(e) {
  if (e.quick) return e.eatenAt ? `${e.eatenAt} · Quick add` : "Quick add";
  if (e.eatenAt) return `${e.eatenAt} · ${e.pieces ? `${e.pieces} pc · ${Math.round(e.grams)} g` : `${Math.round(e.grams)} g`}`;
  if (e.pieces) return `${e.pieces} pc · ${Math.round(e.grams)} g`;
  return `${Math.round(e.grams)} g`;
}

export function entryCount(dayLogs) {
  if (!dayLogs) return 0;
  let n = 0;
  for (const meal of MEALS) n += (dayLogs[meal] || []).length;
  return n;
}
