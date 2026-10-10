export function quickItem({ name, kcal, protein, carbs, fat, fiber }) {
  const item = {
    name: name || "Quick add",
    quick: true,
    grams: 100,
    kcal100: Number(kcal) || 0,
    protein100: Number(protein) || 0,
    carbs100: Number(carbs) || 0,
    fat100: Number(fat) || 0,
  };
  if (Number(fiber) > 0) item.fiber100 = Number(fiber);
  return item;
}
