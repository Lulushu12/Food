import { useMemo } from "react";
import { NumInput, SettingRow, useToast } from "@shared/ui.jsx";
import { BackupPanel } from "@shared/BackupPanel.jsx";
import { validateBackup, STORAGE_KEY } from "./storage.js";
import { COUNTRIES } from "./offc.js";
import EnergyCard from "./EnergyCard.jsx";
import { CSV_TABLES, exportCsv } from "./csv.js";

export default function SettingsView({ store, today, onRestore, setSettings, onApplyTargets }) {
  const { targets, country, microTargets, water } = store.settings;
  const setTarget = (k, v) => setSettings({ targets: { ...targets, [k]: v } });
  const storageKb = useMemo(() => {
    try {
      const { _recovered, ...rest } = store;
      return Math.max(1, Math.round(JSON.stringify(rest).length / 1024));
    } catch {
      return null;
    }
  }, [store]);
  const toast = useToast();
  const runExport = async (t) => {
    const filename = `food-${t.id}-${today}.csv`;
    const res = await exportCsv(t.build(store), filename);
    if (res === "downloaded") toast(`Saved ${filename}`);
    else if (res === "shared") toast(`Shared ${filename}`);
    else if (res === "copied") toast(`${t.label} CSV copied to the clipboard`);
    else if (res === "failed") toast("Export failed: could not download, share or copy.");
  };
  const archivedDays = Object.keys(store.logs?.archive || {}).length;
  const macroKcal = Math.round(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9);

  return (
    <div className="page page-tabs">
      <h1 className="apptitle">
        Settings<span>.</span>
      </h1>

      <h2>Daily targets</h2>
      <p className="hint small">Set a target to 0 to hide its progress bar on Today.</p>
      <div className="card">
        <SettingRow label="Calories (kcal)">
          <NumInput value={targets.kcal} onChange={(v) => setTarget("kcal", v)} min={0} max={9000} step={50} label="Calorie target" />
        </SettingRow>
        <SettingRow label="Protein (g)">
          <NumInput value={targets.protein} onChange={(v) => setTarget("protein", v)} min={0} max={500} step={5} label="Protein target" />
        </SettingRow>
        <SettingRow label="Carbs (g)">
          <NumInput value={targets.carbs} onChange={(v) => setTarget("carbs", v)} min={0} max={900} step={5} label="Carbs target" />
        </SettingRow>
        <SettingRow label="Fat (g)">
          <NumInput value={targets.fat} onChange={(v) => setTarget("fat", v)} min={0} max={400} step={5} label="Fat target" />
        </SettingRow>
        {macroKcal > 0 && (
          <p className="hint small">
            Your macro targets add up to {macroKcal} kcal
            {targets.kcal > 0 && Math.abs(macroKcal - targets.kcal) > 50 ? `, ${macroKcal > targets.kcal ? "above" : "below"} the calorie target.` : "."}
          </p>
        )}
      </div>

      <h2>Fibre and salt</h2>
      <p className="hint small">Shown under the macro bars on Today. Set to 0 to show totals without a target.</p>
      <div className="card">
        <SettingRow label="Fibre (g, at least)">
          <NumInput
            value={microTargets.fiber}
            onChange={(v) => setSettings({ microTargets: { ...microTargets, fiber: v } })}
            min={0}
            max={150}
            step={1}
            label="Fibre target"
          />
        </SettingRow>
        <SettingRow label="Salt (g, at most)">
          <NumInput
            value={microTargets.salt}
            onChange={(v) => setSettings({ microTargets: { ...microTargets, salt: v } })}
            min={0}
            max={30}
            step={0.5}
            label="Salt limit"
          />
        </SettingRow>
      </div>

      <h2>Water</h2>
      <div className="card">
        <SettingRow label="Count in">
          <div className="chips" role="radiogroup" aria-label="Water unit">
            {[
              ["glass", "Glasses"],
              ["ml", "ml"],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={water.unit === id}
                className={"chip small" + (water.unit === id ? " sel" : "")}
                onClick={() => setSettings({ water: { ...water, unit: id } })}
              >
                {label}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={water.unit === "glass" ? "Glass size (ml)" : "Step per tap (ml)"}>
          <NumInput
            value={water.step}
            onChange={(v) => setSettings({ water: { ...water, step: v } })}
            min={10}
            max={2000}
            step={50}
            label="Water step in ml"
          />
        </SettingRow>
        <SettingRow label="Daily target (ml)" hint="0 hides the ring">
          <NumInput
            value={water.target}
            onChange={(v) => setSettings({ water: { ...water, target: v } })}
            min={0}
            max={10000}
            step={250}
            label="Water target in ml"
          />
        </SettingRow>
      </div>

      <h2>Energy target</h2>
      <EnergyCard
        est={store.tdee}
        goal={store.settings.goal}
        targets={targets}
        today={today}
        stale
        onGoal={(goal) => setSettings({ goal })}
        onApply={onApplyTargets}
      />

      <h2>Food search</h2>
      <p className="hint small">Open Food Facts results favour products sold in this country.</p>
      <div className="chips">
        {COUNTRIES.map((c) => (
          <button
            type="button"
            key={c.id || "world"}
            className={"chip" + (country === c.id ? " sel" : "")}
            aria-pressed={country === c.id}
            onClick={() => setSettings({ country: c.id })}
          >
            {c.label}
          </button>
        ))}
      </div>

      <h2>Units</h2>
      <p className="hint small">Metric: grams for food, kilograms for weight.</p>

      <h2>Data</h2>
      <div className="card">
        <p className="storageline">Storage used: {storageKb == null ? "unknown" : `${storageKb} KB`}</p>
        <p className="hint small">
          Food log entries older than 12 months are compacted into daily totals
          {archivedDays > 0 ? ` (${archivedDays} archived days)` : ""}. Unused foods older than a year are removed.
        </p>
      </div>

      <h2>Export CSV</h2>
      <p className="hint small">One file per table, for spreadsheets. In the Android app it opens the share sheet or copies to the clipboard.</p>
      <div className="chips">
        {CSV_TABLES.map((t) => (
          <button type="button" key={t.id} className="chip" onClick={() => runExport(t)}>
            {t.label}
          </button>
        ))}
      </div>

      <h2>Backup</h2>
      <BackupPanel
        data={store}
        onRestore={onRestore}
        validate={validateBackup}
        prefix="calories"
        storageKey={STORAGE_KEY}
      />
    </div>
  );
}
