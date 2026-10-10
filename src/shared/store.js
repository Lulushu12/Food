import { useEffect, useRef, useState } from "react";

const pad = (n) => String(n).padStart(2, "0");

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
  return dayKey(new Date());
}

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  // Noon keeps the result on the right day even where DST shifts midnight.
  return dayKey(new Date(y, m - 1, d + n, 12));
}

export function newId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* insecure context */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function fillDefaults(store, defs) {
  const out = { ...store };
  for (const [k, dv] of Object.entries(defs)) {
    if (out[k] === undefined) out[k] = dv;
    else if (isPlainObject(dv) && isPlainObject(out[k])) out[k] = { ...dv, ...out[k] };
  }
  return out;
}

function isQuotaError(e) {
  return !!e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);
}

export function createStore({ key, version, defaults, migrate, normalize }) {
  const fresh = () => ({ ...defaults(), version });

  const recover = (raw) => {
    try {
      localStorage.setItem(`${key}.corrupt`, raw);
    } catch {
      /* nowhere left to keep it */
    }
    return { ...fresh(), _recovered: true };
  };

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return fresh();
    }
    if (raw == null) return fresh();
    let store;
    try {
      store = JSON.parse(raw);
    } catch {
      return recover(raw);
    }
    if (!isPlainObject(store)) return recover(raw);
    try {
      const from = typeof store.version === "number" ? store.version : 0;
      if (from < version && migrate) store = migrate(store, from);
      store = fillDefaults(store, defaults());
      if (normalize) store = normalize(store) || store;
      return { ...store, version };
    } catch {
      return recover(raw);
    }
  }

  function save(store) {
    try {
      // _recovered is a one-launch flag for the UI, never persisted.
      const { _recovered, ...rest } = store;
      localStorage.setItem(key, JSON.stringify(rest));
      return { ok: true };
    } catch (e) {
      const quota = isQuotaError(e);
      return { ok: false, quota, error: quota ? "Storage is full; recent changes are not saved." : String(e?.message || e) };
    }
  }

  return { key, load, save };
}

export function usePersistentStore(def) {
  const [store, setStore] = useState(() => def.load());
  const [status, setStatus] = useState({ ok: true, error: null, savedAt: null });
  const lastWritten = useRef(null);

  useEffect(() => {
    const serialized = JSON.stringify(store);
    if (serialized === lastWritten.current) return;
    const res = def.save(store);
    if (res.ok) {
      lastWritten.current = serialized;
      setStatus({ ok: true, error: null, savedAt: Date.now() });
    } else {
      setStatus((s) => ({ ok: false, error: res.error, savedAt: s.savedAt }));
    }
  }, [store, def]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== def.key && e.key !== null) return;
      if (e.newValue != null && e.newValue === lastWritten.current) return;
      const next = def.load();
      // Mark the reloaded state as written so it is not echoed back to the other tab.
      lastWritten.current = JSON.stringify(next);
      setStore(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [def]);

  return [store, setStore, status];
}

export function useVisibleDate() {
  const [date, setDate] = useState(todayKey);

  useEffect(() => {
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => {
        setDate(todayKey());
        arm();
      }, midnight - now + 250);
    };
    const refresh = () => {
      setDate(todayKey());
      arm();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return date;
}
