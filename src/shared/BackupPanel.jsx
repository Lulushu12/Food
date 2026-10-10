import { useRef, useState } from "react";
import { backupText, backupFilename, canDownload, copyToClipboard, downloadJson, readBackup } from "./backup.js";

function readLastBackup(prefix) {
  try {
    return localStorage.getItem(`${prefix}:lastBackup`);
  } catch {
    return null;
  }
}

function lastBackupLabel(iso) {
  const then = iso ? new Date(iso) : null;
  if (!then || isNaN(then)) return "never";
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const days = Math.round((a - b) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function readRaw(storageKey) {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/**
 * Export/restore UI that works inside the APK as well as on the web.
 *
 * Props:
 *   data       - object to export (falls back to localStorage[storageKey])
 *   onRestore  - called with the parsed object and { dropped }
 *   validate   - (obj) => boolean | { ok, dropped?, data? }
 *   prefix     - filename prefix and the `${prefix}:lastBackup` key
 *   strip      - dotted paths removed from the export, e.g. "settings.ai.apiKey"
 *   storageKey - app's localStorage key; its raw value is kept in
 *                `${storageKey}.prerestore` before a restore replaces it
 */
export function BackupPanel({ data, onRestore, validate, prefix, strip = [], storageKey }) {
  const fileRef = useRef();
  const [text, setText] = useState(null);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [lastBackup, setLastBackup] = useState(() => readLastBackup(prefix));

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const exportSource = () => {
    if (data !== undefined || !storageKey) return data;
    try {
      return JSON.parse(readRaw(storageKey));
    } catch {
      return null;
    }
  };

  const markBackedUp = () => {
    const iso = new Date().toISOString();
    try {
      localStorage.setItem(`${prefix}:lastBackup`, iso);
    } catch {
      /* the label just stays stale */
    }
    setLastBackup(iso);
  };

  const onCopy = async () => {
    const ok = await copyToClipboard(text);
    setCopied(ok);
    if (ok) markBackedUp();
  };

  const onDownload = () => {
    downloadJson(text, backupFilename(prefix));
    markBackedUp();
  };

  const onShare = async () => {
    const filename = backupFilename(prefix);
    try {
      let file = null;
      try {
        file = new File([text], filename, { type: "application/json" });
        if (!navigator.canShare?.({ files: [file] })) file = null;
      } catch {
        file = null;
      }
      if (file) await navigator.share({ files: [file], title: filename });
      else await navigator.share({ title: filename, text });
      markBackedUp();
    } catch (e) {
      if (e?.name !== "AbortError") setError("Sharing failed. Copy the text instead.");
    }
  };

  const restore = (raw) => {
    try {
      const { data: restored, dropped } = readBackup(raw, validate);
      if (storageKey) {
        const current = readRaw(storageKey);
        try {
          if (current != null) localStorage.setItem(`${storageKey}.prerestore`, current);
        } catch {
          /* no room for the safety copy; restore anyway */
        }
      }
      onRestore(restored, { dropped });
      setPaste("");
      setError("");
      setDone(dropped > 0 ? `Restored; ${dropped} invalid records were skipped.` : "Backup restored.");
    } catch (e) {
      setDone("");
      setError(e.message);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) f.text().then(restore, () => setError("Couldn't read that file."));
    e.target.value = "";
  };

  return (
    <div className="backuppanel">
      <p className="hint small">Last backup: {lastBackupLabel(lastBackup)}</p>
      <div className="backuprow">
        <button
          className="linkbtn"
          onClick={() => {
            setText(backupText(exportSource(), { strip }));
            setCopied(false);
          }}
        >
          Export backup
        </button>
        <button className="linkbtn" onClick={() => fileRef.current.click()}>
          Import from file
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      </div>

      {text && (
        <div className="card">
          <div className="backuprow">
            <button className="bigbtn" onClick={onCopy}>
              {copied ? "✓ Copied" : "Copy to clipboard"}
            </button>
            {canShare && (
              <button className="linkbtn" onClick={onShare}>
                Share
              </button>
            )}
            {canDownload() && (
              <button className="linkbtn" onClick={onDownload}>
                Download file
              </button>
            )}
            <button className="linkbtn" onClick={() => setText(null)}>
              Close
            </button>
          </div>
          <textarea className="input backuptext" readOnly value={text} onFocus={(e) => e.target.select()} />
          <p className="hint small">
            Paste this somewhere safe. Uninstalling the app deletes everything it holds, so take a
            copy before you replace or reinstall it.
          </p>
        </div>
      )}

      <div className="field">
        <textarea
          className="input backuptext"
          placeholder="…or paste a backup here to restore it"
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setError("");
            setDone("");
          }}
        />
        {error && <p className="warn">{error}</p>}
        {done && <p className="okmsg">{done}</p>}
        <button className="linkbtn" disabled={!paste.trim()} onClick={() => restore(paste)}>
          Restore from pasted text
        </button>
      </div>
    </div>
  );
}

export default BackupPanel;
