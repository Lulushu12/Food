# Food

Recipes and a macro log in one offline-first PWA, also built as an Android APK.
Formerly the Calories app in [Lulushu12/life-architecture](https://github.com/Lulushu12/life-architecture).

- **Today**: log food per meal (Open Food Facts search and barcode, custom foods,
  quick add, templates), water, macro and fibre targets, weekly view with an
  adaptive energy estimate.
- **Recipes**: the recipe catalog (`src/recipes/catalog.json`) plus recipes you add
  or edit in the app. Search by name or ingredient, filter by collection (Mine,
  Despina, Saved) and meal type, scale servings, and **Log this** to add a recipe's
  macros to a meal. Steps marked "Drafted by Claude" were written, not taken from a
  source, until you mark the recipe as cooked.
- **Foods**, **Weight**, **Settings** (targets, CSV export, JSON backup).

Served at `https://lulushu12.github.io/food/`. Data stays on the device
(localStorage key `calories-v1`, kept from the old app so existing logs carry over
and Life Architecture can keep reading the day's macros on the same origin).

## Development

```sh
npm ci
npm run dev            # local dev server
npm run build          # Pages build into dist/
npm run build:android  # Capacitor build, then: cd android && ./gradlew assembleDebug
```

`src/shared/` is a vendored copy of the shared package from life-architecture.

## Deploys

- `deploy.yml` builds and pushes `dist/` to the `gh-pages` branch. Turn Pages on
  once: Settings > Pages > Deploy from a branch > `gh-pages`.
- `android-apk.yml` builds the APK and attaches it to the `food-latest` release:
  `https://github.com/Lulushu12/food/releases/download/food-latest/food.apk`.
  Without the four `ANDROID_KEYSTORE_*` repo secrets (same as life-architecture)
  it builds a debug APK.
