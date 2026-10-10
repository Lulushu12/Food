import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function fmtNum(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

export function ProgressBar({ label, value, target, unit }) {
  if (!target || target <= 0) return null;
  const pct = Math.max(0, Math.min(100, (value / target) * 100));
  const over = value > target;
  return (
    <div className="pbar">
      <div className="pbar-head">
        <span className="pbar-label">{label}</span>
        <span className="pbar-val">
          {fmtNum(value)} / {fmtNum(target)}
          {unit}
        </span>
      </div>
      <div
        className="pbar-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        aria-valuenow={Math.round(value)}
      >
        <div className={"pbar-fill" + (over ? " over" : "")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ onClose, children, title, sheet = false }) {
  const id = useId();
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const box = boxRef.current;
    const first = box?.querySelector(FOCUSABLE);
    (first || box)?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current?.();
      } else if (e.key === "Tab" && box) {
        const items = box.querySelectorAll(FOCUSABLE);
        if (!items.length) return;
        const a = items[0];
        const z = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        } else if (!box.contains(document.activeElement)) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && previous.isConnected && typeof previous.focus === "function") previous.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className={sheet ? "sheet-backdrop" : "overlay"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={boxRef}
        className={sheet ? "sheet" : "modal card"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? id : undefined}
        tabIndex={-1}
      >
        {title && <h3 id={id}>{title}</h3>}
        {children}
      </div>
    </div>,
    document.body
  );
}

const TABS = [
  { id: "today", label: "Today", icon: "📅" },
  { id: "recipes", label: "Recipes", icon: "📖" },
  { id: "foods", label: "Foods", icon: "🍽️" },
  { id: "weight", label: "Weight", icon: "⚖️" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export function TabBar({ tab, onTab }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={"tabbtn" + (tab === t.id ? " active" : "")}
          aria-current={tab === t.id ? "page" : undefined}
          onClick={() => onTab(t.id)}
        >
          <span className="tabicon" aria-hidden="true">
            {t.icon}
          </span>
          <span className="tablabel">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function MacroRow({ kcal, protein, carbs, fat }) {
  return (
    <div className="macrorow">
      <span className="macro kcal">{Math.round(kcal)} kcal</span>
      <span className="macro">P {fmtNum(protein)}g</span>
      <span className="macro">C {fmtNum(carbs)}g</span>
      <span className="macro">F {fmtNum(fat)}g</span>
    </div>
  );
}

export function DayNav({ date, today, onDate, label }) {
  return (
    <div className="daynav">
      <button type="button" className="iconbtn" aria-label="Previous day" onClick={() => onDate(-1)}>
        ‹
      </button>
      <button
        type="button"
        className="daynav-label"
        onClick={() => onDate(0)}
        disabled={date === today}
        aria-label={date === today ? label : `${label}. Jump to today`}
      >
        {label}
      </button>
      <button type="button" className="iconbtn" aria-label="Next day" onClick={() => onDate(1)}>
        ›
      </button>
    </div>
  );
}

export function TopBar({ title, sub, onBack, children }) {
  return (
    <div className="topbar">
      <button type="button" className="iconbtn" aria-label="Back" onClick={onBack}>
        ‹
      </button>
      <div>
        <div className="tb-title">{title}</div>
        {sub && <div className="tb-sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
