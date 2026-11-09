# Food-composition data

Generated files only. Don't edit them by hand: change the manifest or the importer and regenerate.

| File | Source | Licence | Built by |
|---|---|---|---|
| `usda-fdc-subset.json` | USDA FoodData Central: SR Legacy (April 2018) and FNDDS 2021–2023 survey foods (October 2024 release), from https://fdc.nal.usda.gov/download-datasets | CC0 1.0 (public domain) | `scripts/nutrients/build_fdc_subset.py` from `scripts/nutrients/fdc-manifest.json` |

**Not here:** IFCT 2017 (Indian Food Composition Tables, ICMR-NIN). It's the preferred source for Indian meals, but its licence for commercial use hasn't been confirmed. Once it is, generate `ifct-2017.json` with `scripts/nutrients/import_ifct.py` and register it first in `src/lib/nutrients/sources/index.ts`.

Rules every file here follows (checked in `src/__tests__/nutrients-composition.test.ts`):
- A nutrient the source has no value for is absent, meaning unknown. It's never written as 0.
- A measured 0 stays 0.
- Values that reflect US enrichment or fortification are dropped, with the reason recorded under `excluded`, because Indian food usually lacks them.
