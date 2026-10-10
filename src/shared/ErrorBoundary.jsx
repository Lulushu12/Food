import { Component, useState } from "react";
import { useConfirm } from "./ui.jsx";

function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API can reject without a user gesture or on insecure origins; fall through.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function ErrorScreen({ error, appName, storageKey }) {
  const [confirm, confirmSheet] = useConfirm();
  const [status, setStatus] = useState(null);

  const onCopy = async () => {
    const raw = storageKey ? readRaw(storageKey) : null;
    if (raw == null) {
      setStatus({ ok: false, text: "No saved data found." });
      return;
    }
    const ok = await copyText(raw);
    setStatus(
      ok
        ? { ok: true, text: `Copied ${raw.length.toLocaleString()} characters.` }
        : { ok: false, text: "Copy failed. Your browser blocked clipboard access." }
    );
  };

  const onReset = async () => {
    const yes = await confirm({
      title: "Reset all data?",
      message: `This permanently deletes everything ${appName || "this app"} has saved on this device. Copy the raw data first if you might want it back.`,
      confirmLabel: "Reset",
      danger: true,
    });
    if (!yes) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      setStatus({ ok: false, text: "Could not clear storage." });
      return;
    }
    window.location.reload();
  };

  const message = (error && (error.message || String(error))) || "Unknown error";

  return (
    <div className="errorboundary" role="alert">
      <h3>{appName ? `${appName} hit an error` : "Something went wrong"}</h3>
      <p className="hint">
        Your data is still saved on this device. Try reloading first. If the error keeps coming back,
        copy the raw data somewhere safe before resetting.
      </p>
      <pre>{message}</pre>
      <button type="button" className="bigbtn" onClick={() => window.location.reload()}>
        Reload
      </button>
      {storageKey && (
        <>
          <button type="button" className="bigbtn secondary" onClick={onCopy}>
            Copy raw data
          </button>
          <button type="button" className="bigbtn ghost" onClick={onReset}>
            Reset data
          </button>
        </>
      )}
      {status && <p className={status.ok ? "okmsg" : "warn"}>{status.text}</p>}
      {confirmSheet}
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[${this.props.appName || "app"}] render error`, error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          error={this.state.error}
          appName={this.props.appName}
          storageKey={this.props.storageKey}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
