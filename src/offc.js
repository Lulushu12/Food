const HOST = "https://world.openfoodfacts.org";

const FIELDS = [
  "code",
  "product_name",
  "generic_name",
  "brands",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "product_quantity",
  "quantity",
  "nutriscore_grade",
  "nova_group",
].join(",");

export const COUNTRIES = [
  { id: "ro", label: "Romania", lc: "ro" },
  { id: "", label: "Worldwide", lc: "en" },
  { id: "de", label: "Germany", lc: "de" },
  { id: "fr", label: "France", lc: "fr" },
  { id: "it", label: "Italy", lc: "it" },
  { id: "es", label: "Spain", lc: "es" },
  { id: "uk", label: "United Kingdom", lc: "en" },
  { id: "us", label: "United States", lc: "en" },
];

function localeParams(country) {
  const c = COUNTRIES.find((x) => x.id === country);
  if (!country) return "";
  return `&cc=${encodeURIComponent(country)}&lc=${encodeURIComponent(c?.lc || country)}`;
}

function pickNum(n, ...keys) {
  for (const k of keys) {
    const v = n[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

const KJ_PER_KCAL = 4.184;

export function per100(nutriments) {
  const n = nutriments || {};
  let kcal = pickNum(n, "energy-kcal_100g");
  if (kcal == null) {
    const kj = pickNum(n, "energy-kj_100g", "energy_100g");
    if (kj != null) kcal = kj / KJ_PER_KCAL;
  }
  return {
    kcal100: kcal == null ? null : Math.round(kcal * 10) / 10,
    protein100: pickNum(n, "proteins_100g"),
    carbs100: pickNum(n, "carbohydrates_100g"),
    fat100: pickNum(n, "fat_100g"),
    fiber100: pickNum(n, "fiber_100g"),
    sugars100: pickNum(n, "sugars_100g"),
    satFat100: pickNum(n, "saturated-fat_100g"),
    salt100: pickNum(n, "salt_100g"),
  };
}

function gramsOf(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 10) / 10 : undefined;
}

export function productToFood(p) {
  if (!p) return null;
  const m = per100(p.nutriments);
  if (m.kcal100 == null) return null;
  const incomplete = m.protein100 == null || m.carbs100 == null || m.fat100 == null;
  const food = {
    name: (p.product_name || p.generic_name || "Unknown product").trim(),
    brand: (p.brands || "").split(",")[0].trim(),
    kcal100: m.kcal100,
    protein100: m.protein100 ?? 0,
    carbs100: m.carbs100 ?? 0,
    fat100: m.fat100 ?? 0,
    source: "off",
    code: p.code || p._code || undefined,
  };
  if (incomplete) food.macrosIncomplete = true;
  for (const k of ["fiber100", "sugars100", "satFat100", "salt100"]) if (m[k] != null) food[k] = m[k];
  const serving = gramsOf(p.serving_quantity);
  if (serving) {
    food.servingGrams = serving;
    if (p.serving_size) food.servingLabel = String(p.serving_size).slice(0, 40);
  }
  const pkg = gramsOf(p.product_quantity);
  if (pkg) food.packageGrams = pkg;
  if (p.nutriscore_grade && /^[a-e]$/i.test(p.nutriscore_grade)) food.nutriscore = p.nutriscore_grade.toLowerCase();
  if (p.nova_group) food.nova = Number(p.nova_group) || undefined;
  return food;
}

function offline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function dedupeByCode(items) {
  const seen = new Set();
  return items.filter((f) => {
    if (!f.code) return true;
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });
}

async function searchOnce(q, country, signal) {
  const url = `${HOST}/cgi/search.pl?search_terms=${encodeURIComponent(
    q
  )}&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}${localeParams(country)}`;
  const res = await fetchWithTimeout(url, signal);
  if (!res.ok) throw new Error(`Search failed (${res.status}).`);
  const data = await res.json();
  const products = Array.isArray(data.products) ? data.products : [];
  return dedupeByCode(products.map(productToFood).filter(Boolean));
}

export async function searchFoods(query, { country = "ro", signal } = {}) {
  if (offline()) return { ok: false, error: "You're offline. Online search needs a network connection." };
  const q = query.trim();
  if (!q) return { ok: true, items: [] };
  try {
    let items = await searchOnce(q, country, signal);
    let widened = false;
    if (items.length === 0 && country) {
      items = await searchOnce(q, "", signal);
      widened = items.length > 0;
    }
    return { ok: true, items, widened };
  } catch (e) {
    if (e?.name === "AbortError" && signal?.aborted) return { ok: false, aborted: true };
    return { ok: false, error: e?.message?.startsWith("Search failed") ? e.message : "Could not reach Open Food Facts. Check your connection." };
  }
}

export async function lookupBarcode(code, { country = "ro" } = {}) {
  if (offline()) return { ok: false, error: "You're offline. Barcode lookup needs a network connection." };
  const c = code.trim();
  if (!c) return { ok: false, error: "Enter a barcode number." };
  const url = `${HOST}/api/v2/product/${encodeURIComponent(c)}.json?fields=${FIELDS}${localeParams(country)}`;
  try {
    const res = await fetchWithTimeout(url);
    if (res.status === 404) return { ok: false, error: "No product found for that barcode." };
    if (!res.ok) return { ok: false, error: `Lookup failed (${res.status}).` };
    const data = await res.json();
    if (!data.product || data.status === 0) return { ok: false, error: "No product found for that barcode." };
    const food = productToFood({ ...data.product, code: data.product.code || c });
    if (!food) return { ok: false, error: "Product found, but it has no calorie data." };
    return { ok: true, item: food };
  } catch {
    return { ok: false, error: "Could not reach Open Food Facts. Check your connection." };
  }
}

function fetchWithTimeout(url, outer, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener?.("abort", onOuter);
  return fetch(url, { signal: ctrl.signal }).finally(() => {
    clearTimeout(t);
    outer?.removeEventListener?.("abort", onOuter);
  });
}
