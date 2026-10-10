import { canDownload, copyToClipboard, downloadJson } from "@shared/backup.js";
import { ARCHIVE_KEY, MEALS, isDateKey } from "./storage.js";
import { entryMacros } from "./food.js";
import { weightSummary } from "./weight.js";

function cell(v) {
  if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "";
  const s = typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const byDate = (obj) => Object.keys(obj || {}).filter(isDateKey).sort();

export function foodLogCsv(store) {
  const header = ["date", "time", "meal", "name", "grams", "pieces", "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugars_g", "sat_fat_g", "salt_g", "kind"];
  const rows = [];
  const archive = store.logs?.[ARCHIVE_KEY] || {};
  for (const d of byDate(archive)) {
    const a = archive[d];
    rows.push([d, "", "", "Day total", "", "", a.kcal, a.protein, a.carbs, a.fat, a.fiber, a.sugars, a.satFat, a.salt, "archived"]);
  }
  for (const d of byDate(store.logs)) {
    const day = store.logs[d];
    for (const meal of MEALS) {
      for (const e of day[meal] || []) {
        const m = entryMacros(e);
        const f = (Number(e.grams) || 0) / 100;
        const micro = (k) => (Number.isFinite(e[k]) ? e[k] * f : null);
        rows.push([
          d,
          e.eatenAt || "",
          meal,
          e.name,
          e.quick ? null : e.grams,
          e.pieces || null,
          m.kcal,
          m.protein,
          m.carbs,
          m.fat,
          micro("fiber100"),
          micro("sugars100"),
          micro("satFat100"),
          micro("salt100"),
          e.quick ? "quick" : "entry",
        ]);
      }
    }
  }
  return toCsv(header, rows);
}

export function weightCsv(store) {
  const { series } = weightSummary(store.weights);
  return toCsv(["date", "kg", "trend_kg"], series.map((p) => [p.date, p.kg, p.trend]));
}

export function waterCsv(store) {
  const archive = store.logs?.[ARCHIVE_KEY] || {};
  const map = {};
  for (const d of byDate(archive)) if (archive[d].water > 0) map[d] = archive[d].water;
  for (const d of byDate(store.water)) map[d] = store.water[d].ml;
  return toCsv(["date", "ml"], Object.keys(map).sort().map((d) => [d, map[d]]));
}

export const CSV_TABLES = [
  { id: "food", label: "Food log", build: foodLogCsv },
  { id: "weight", label: "Weight", build: weightCsv },
  { id: "water", label: "Water", build: waterCsv },
];

export async function exportCsv(text, filename) {
  if (canDownload()) {
    downloadJson(text, filename);
    return "downloaded";
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      let file = null;
      try {
        file = new File([text], filename, { type: "text/csv" });
        if (!navigator.canShare?.({ files: [file] })) file = null;
      } catch {
        file = null;
      }
      if (file) await navigator.share({ files: [file], title: filename });
      else await navigator.share({ title: filename, text });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  return (await copyToClipboard(text)) ? "copied" : "failed";
}
