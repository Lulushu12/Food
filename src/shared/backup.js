// Backup that survives the APK.
//
// A Blob plus <a download> works on the web, but Capacitor registers no
// DownloadListener, so inside the APK the click silently does nothing. Since
// uninstalling an app deletes its localStorage, a backup route that quietly
// fails is worse than none. So: clipboard first (works everywhere, no
// permission, no native plugin), the raw text always on screen to select by
// hand, and the file download kept as a bonus where the browser supports it.

function stripPath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur?.[parts[i]];
    if (cur === null || typeof cur !== "object") return;
  }
  delete cur[parts[parts.length - 1]];
}

export function backupText(store, { strip = [] } = {}) {
  if (!strip.length) return JSON.stringify(store, null, 2);
  const copy = JSON.parse(JSON.stringify(store));
  for (const path of strip) stripPath(copy, path);
  return JSON.stringify(copy, null, 2);
}

export function backupFilename(prefix) {
  return `${prefix}-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/** True when a real file download is likely to work (i.e. not in the APK). */
export function canDownload() {
  return import.meta.env.MODE !== "android";
}

/** Copy to clipboard. Resolves false when blocked, so callers can fall back. */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied, or no secure context */
  }
  // execCommand is deprecated but still the only fallback in some WebViews.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function downloadJson(text, filename) {
  downloadText(text, filename, "application/json");
}

export function downloadText(text, filename, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parse pasted or loaded backup text. `validate(obj)` returns a boolean or
 * `{ ok, dropped?, data? }` (data replaces obj when validate cleaned it), and
 * may throw for anything that isn't a backup of this app.
 * Returns `{ data, dropped }`.
 */
export function readBackup(text, validate) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That isn't valid JSON.");
  }
  const res = validate ? validate(data) : true;
  const ok = typeof res === "object" && res !== null ? res.ok : !!res;
  if (!ok) throw new Error("That doesn't look like a backup of this app.");
  const dropped = typeof res === "object" && res !== null ? Number(res.dropped) || 0 : 0;
  const cleaned = typeof res === "object" && res !== null && res.data !== undefined ? res.data : data;
  return { data: cleaned, dropped };
}

export function parseBackup(text, validate) {
  return readBackup(text, validate).data;
}

// Imported records win only when newer than the local copy of the same id.
export function mergeById(local, imported) {
  const out = { ...(local || {}) };
  for (const [id, rec] of Object.entries(imported || {})) {
    if (!out[id] || (rec?.updatedAt || 0) > (out[id].updatedAt || 0)) out[id] = rec;
  }
  return out;
}
