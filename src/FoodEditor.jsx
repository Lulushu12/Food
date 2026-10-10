import { useState } from "react";
import { NumInput, Toggle } from "@shared/ui.jsx";
import { TopBar } from "./ui.jsx";
import { MICROS } from "./food.js";

const MICRO_MAX = { fiber100: 100, sugars100: 100, satFat100: 100, salt100: 100 };

export default function FoodEditor({ food, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(food?.name || "");
  const [brand, setBrand] = useState(food?.brand || "");
  const [kcal100, setKcal100] = useState(food?.kcal100 ?? 0);
  const [protein100, setProtein100] = useState(food?.protein100 ?? 0);
  const [carbs100, setCarbs100] = useState(food?.carbs100 ?? 0);
  const [fat100, setFat100] = useState(food?.fat100 ?? 0);
  const [isPiece, setIsPiece] = useState(!!food?.isPiece);
  const [pieceWeight, setPieceWeight] = useState(food?.pieceWeight ?? 50);
  const [servingGrams, setServingGrams] = useState(food?.servingGrams ?? 0);
  const [micros, setMicros] = useState(() => {
    const out = {};
    for (const m of MICROS) out[m.field] = Number.isFinite(food?.[m.field]) ? food[m.field] : null;
    return out;
  });

  const canSave = name.trim().length > 0;
  const macrosChanged =
    food &&
    (food.protein100 !== protein100 || food.carbs100 !== carbs100 || food.fat100 !== fat100);

  const save = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      brand: brand.trim(),
      kcal100: Number(kcal100) || 0,
      protein100: Number(protein100) || 0,
      carbs100: Number(carbs100) || 0,
      fat100: Number(fat100) || 0,
      isPiece,
      pieceWeight: isPiece ? Number(pieceWeight) || 0 : undefined,
      servingGrams: servingGrams > 0 ? servingGrams : undefined,
      ...Object.fromEntries(MICROS.map((m) => [m.field, micros[m.field] == null ? undefined : micros[m.field]])),
      source: food?.source || "custom",
      ...(macrosChanged ? { macrosIncomplete: false } : {}),
    });
  };

  return (
    <div className="page">
      <TopBar title={food ? "Edit food" : "New food"} sub="Macros are per 100 g" onBack={onCancel} />

      <div className="field">
        <label className="flabel" htmlFor="fe-name">
          Name
        </label>
        <input
          id="fe-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chicken breast"
          maxLength={120}
        />
      </div>
      <div className="field">
        <label className="flabel" htmlFor="fe-brand">
          Brand (optional)
        </label>
        <input
          id="fe-brand"
          className="input"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="e.g. Generic"
          maxLength={120}
        />
      </div>
      {food?.macrosIncomplete && (
        <p className="warn">Open Food Facts was missing some macros for this product. Check them against the label.</p>
      )}

      <div className="flabel">Per 100 g</div>
      <div className="setrow">
        <span className="setlabel">Calories (kcal)</span>
        <NumInput value={kcal100} onChange={setKcal100} min={0} max={900} step={5} label="Calories per 100 g" />
      </div>
      <div className="setrow">
        <span className="setlabel">Protein (g)</span>
        <NumInput value={protein100} onChange={setProtein100} min={0} max={100} step={1} decimals={1} label="Protein per 100 g" />
      </div>
      <div className="setrow">
        <span className="setlabel">Carbs (g)</span>
        <NumInput value={carbs100} onChange={setCarbs100} min={0} max={100} step={1} decimals={1} label="Carbs per 100 g" />
      </div>
      <div className="setrow">
        <span className="setlabel">Fat (g)</span>
        <NumInput value={fat100} onChange={setFat100} min={0} max={100} step={1} decimals={1} label="Fat per 100 g" />
      </div>

      <div className="flabel">Per 100 g, optional</div>
      {MICROS.map((m) => (
        <div className="setrow" key={m.field}>
          <span className="setlabel">{m.label} (g)</span>
          <NumInput
            value={micros[m.field]}
            onChange={(v) => setMicros((cur) => ({ ...cur, [m.field]: v }))}
            min={0}
            max={MICRO_MAX[m.field]}
            step={0.5}
            decimals={2}
            label={`${m.label} per 100 g`}
          />
        </div>
      ))}
      <p className="hint small">Leave blank when unknown; blank values are not counted in daily totals.</p>

      <div className="setrow">
        <span className="setlabel">Serving size (g, optional)</span>
        <NumInput value={servingGrams} onChange={setServingGrams} min={0} max={2000} step={5} label="Serving size" />
      </div>
      <div className="setrow">
        <span className="setlabel">Log by piece</span>
        <Toggle checked={isPiece} onChange={setIsPiece} label="Log by piece" />
      </div>
      {isPiece && (
        <div className="setrow">
          <span className="setlabel">Weight per piece (g)</span>
          <NumInput value={pieceWeight} onChange={setPieceWeight} min={1} max={2000} step={1} label="Weight per piece" />
        </div>
      )}

      <div className="btnrow" style={{ justifyContent: onDelete ? "space-between" : "flex-end" }}>
        {onDelete && (
          <button type="button" className="linkbtn danger-text" onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="bigbtn" disabled={!canSave} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
