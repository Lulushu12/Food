let started = false;

export function registerSw({ onUpdate } = {}) {
  if (started) return;
  if (import.meta.env.MODE === "android") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;

  const sw = navigator.serviceWorker;
  // A page loaded without a controller is a first install, not an update.
  const initialController = sw.controller;
  let fired = false;
  const fire = () => {
    if (fired || !initialController) return;
    fired = true;
    if (typeof onUpdate === "function") onUpdate(() => window.location.reload());
  };

  sw.addEventListener("message", (e) => {
    if (e.data?.type === "sw-activated" && e.source !== initialController) fire();
  });

  const register = () => {
    sw.register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") fire();
          });
        });
        // Installed PWAs resume from the background without navigating, so
        // the browser's own update check would rarely run.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch((err) => console.error("SW registration failed:", err));
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
