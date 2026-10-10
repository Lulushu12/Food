import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

function readSaved(key) {
  if (!key) return undefined;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function useHistoryNav(initialView, { persistKey } = {}) {
  const [view, setView] = useState(() => readSaved(persistKey) ?? initialView);
  const initialRef = useRef(initialView);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    window.history.replaceState({ view: viewRef.current }, "");
    // Keep the old object when nothing changed so effects keyed on `view` do not rerun.
    const onPop = (e) => {
      const next = e.state?.view ?? initialRef.current;
      setView((prev) => (same(prev, next) ? prev : next));
    };
    window.addEventListener("popstate", onPop);

    // Android hardware back never reaches the WebView unless something listens
    // for Capacitor's backButton; without it the activity just closes.
    let cancelled = false;
    let handle = null;
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/app")
        .then(({ App }) =>
          App.addListener("backButton", ({ canGoBack }) => {
            if (canGoBack) window.history.back();
            else App.exitApp();
          })
        )
        .then((h) => {
          if (cancelled) h.remove();
          else handle = h;
        })
        .catch((err) => console.warn("backButton listener unavailable:", err));
    }

    return () => {
      cancelled = true;
      window.removeEventListener("popstate", onPop);
      if (handle) handle.remove();
    };
  }, []);

  useEffect(() => {
    if (!persistKey) return;
    try {
      localStorage.setItem(persistKey, JSON.stringify(view));
    } catch {
      /* quota or private mode: navigation still works */
    }
  }, [persistKey, view]);

  const nav = useCallback((v) => {
    setView(v);
    window.history.pushState({ view: v }, "");
  }, []);

  const replace = useCallback((v) => {
    setView(v);
    window.history.replaceState({ view: v }, "");
  }, []);

  const back = useCallback(() => window.history.back(), []);

  return { view, nav, back, replace };
}

let guardSeq = 0;

// Limitation: if the app pushes a new entry while guarded, the sentinel stays buried in history and costs one extra back press later.
export function useBackGuard(when, onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!when) return;
    const token = ++guardSeq;
    const pushSentinel = () =>
      window.history.pushState({ ...(window.history.state || {}), __backGuard: token }, "");
    pushSentinel();

    const onPop = (e) => {
      const landed = e.state?.__backGuard;
      if (landed === token) return;
      // A stale sentinel (e.g. the StrictMode remount's delayed back()) becomes ours.
      if (landed != null) {
        window.history.replaceState({ ...e.state, __backGuard: token }, "");
        return;
      }
      pushSentinel();
      onBackRef.current?.();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.__backGuard === token) window.history.back();
    };
  }, [when]);
}
