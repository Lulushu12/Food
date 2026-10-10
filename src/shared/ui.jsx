import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const REPEAT_DELAY = 350;
const REPEAT_EVERY = 80;

function decimalsOf(n) {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function roundTo(v, dec) {
  return Number(v.toFixed(dec));
}

function clampTo(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function usePressRepeat(action, disabled) {
  const actionRef = useRef(action);
  actionRef.current = action;
  const timers = useRef({ timeout: 0, interval: 0 });

  const stop = useCallback(() => {
    clearTimeout(timers.current.timeout);
    clearInterval(timers.current.interval);
  }, []);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  const start = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stop();
    actionRef.current();
    timers.current.timeout = setTimeout(() => {
      timers.current.interval = setInterval(() => actionRef.current(), REPEAT_EVERY);
    }, REPEAT_DELAY);
  };

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onBlur: stop,
    onContextMenu: (e) => e.preventDefault(),
    // Pointer presses are handled on pointerdown; detail 0 means keyboard activation.
    onClick: (e) => {
      if (e.detail === 0) actionRef.current();
    },
  };
}

function StepButton({ dir, onStep, disabled }) {
  const handlers = usePressRepeat(onStep, disabled);
  return (
    <button
      type="button"
      aria-label={dir < 0 ? "Decrease" : "Increase"}
      disabled={disabled}
      {...handlers}
    >
      {dir < 0 ? "−" : "+"}
    </button>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      className={"toggle" + (checked ? " on" : "")}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

export function SettingRow({ label, hint, children }) {
  return (
    <div className="setrow">
      <span className="setlabel">
        {label}
        {hint && <span className="sethint">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  min = -999,
  max = 999,
  step = 1,
  decimals,
  inputMode,
  label,
}) {
  const dec = decimals ?? decimalsOf(step);
  const mode = inputMode ?? (step < 1 || decimals ? "decimal" : "numeric");
  const [draft, setDraftState] = useState(null);
  const draftRef = useRef(null);
  const cancelRef = useRef(false);
  const num = Number(value) || 0;

  const setDraft = (text) => {
    draftRef.current = text;
    setDraftState(text);
  };

  const parse = (text) => parseFloat(String(text).replace(",", "."));

  const commit = (text) => {
    const parsed = parse(text);
    if (Number.isNaN(parsed)) return;
    const next = roundTo(clampTo(parsed, min, max), dec);
    if (next !== value) onChange(next);
  };

  const bump = (dir) => {
    const typed = draftRef.current === null ? NaN : parse(draftRef.current);
    const from = Number.isNaN(typed) ? num : typed;
    const next = roundTo(clampTo(from + dir * step, min, max), dec);
    if (draftRef.current !== null) setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="stepper">
      <StepButton dir={-1} onStep={() => bump(-1)} disabled={num <= min} />
      <input
        type="text"
        inputMode={mode}
        aria-label={label}
        autoComplete="off"
        value={draft ?? String(value ?? "")}
        onFocus={(e) => {
          setDraft(String(value ?? ""));
          e.target.select();
        }}
        onChange={(e) => {
          const t = e.target.value;
          if (/^-?\d*[.,]?\d*$/.test(t)) setDraft(t);
        }}
        onBlur={() => {
          if (!cancelRef.current && draftRef.current !== null) commit(draftRef.current);
          cancelRef.current = false;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelRef.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      <StepButton dir={1} onStep={() => bump(1)} disabled={num >= max} />
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1, format = (v) => v }) {
  const dec = decimalsOf(step);
  const bump = (dir) => {
    const next = roundTo(clampTo(Math.round((value + dir * step) / step) * step, min, max), dec);
    if (next !== value) onChange(next);
  };
  return (
    <div className="stepper">
      <StepButton dir={-1} onStep={() => bump(-1)} disabled={value <= min} />
      <span className="stepper-val">{format(value)}</span>
      <StepButton dir={1} onStep={() => bump(1)} disabled={value >= max} />
    </div>
  );
}

export function IconButton({ label, onClick, children, className, ...rest }) {
  return (
    <button
      type="button"
      className={"iconbtn" + (className ? " " + className : "")}
      aria-label={label}
      title={label}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  const id = useId();
  const sheetRef = useRef(null);
  const confirmRef = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelRef.current?.();
      } else if (e.key === "Tab" && sheetRef.current) {
        const items = sheetRef.current.querySelectorAll("button:not([disabled])");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!sheetRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && previous.isConnected && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? id + "-t" : undefined}
        aria-describedby={message ? id + "-m" : undefined}
      >
        {title && <h3 id={id + "-t"}>{title}</h3>}
        {message && <p id={id + "-m"}>{message}</p>}
        <div className="sheet-actions">
          <button type="button" className="bigbtn secondary" onClick={() => onCancel?.()}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={"bigbtn" + (danger ? " danger" : "")}
            onClick={() => onConfirm?.()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function useConfirm() {
  const [opts, setOpts] = useState(null);
  const pending = useRef(null);

  const settle = useCallback((result) => {
    const resolve = pending.current;
    pending.current = null;
    setOpts(null);
    resolve?.(result);
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        pending.current?.(false);
        pending.current = resolve;
        setOpts(typeof options === "string" ? { message: options } : options || {});
      }),
    []
  );

  useEffect(() => () => pending.current?.(false), []);

  const element = (
    <ConfirmSheet
      open={!!opts}
      title={opts?.title}
      message={opts?.message}
      confirmLabel={opts?.confirmLabel}
      cancelLabel={opts?.cancelLabel}
      danger={!!opts?.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return [confirm, element];
}

const ToastContext = createContext(null);
const MAX_TOASTS = 3;

function ToastItem({ item, onDismiss }) {
  useEffect(() => {
    if (!(item.duration > 0) || !Number.isFinite(item.duration)) return undefined;
    const t = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(t);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div className="toast">
      <span className="toast-msg">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            onDismiss(item.id);
            item.action.onClick?.();
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useMemo(() => {
    const show = (message, { action, duration = 4000 } = {}) => {
      const id = nextId.current++;
      setItems((list) => [...list, { id, message, action, duration }].slice(-MAX_TOASTS));
      return id;
    };
    show.undo = (message, onUndo) =>
      show(message, { action: { label: "Undo", onClick: onUndo }, duration: 5000 });
    show.dismiss = dismiss;
    return show;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast() must be used inside <ToastProvider>.");
  return toast;
}
