import type { CompositionSourceFile } from "../composition-types";

import usdaFdcSubset from "../../../../data/food-composition/usda-fdc-subset.json";

// The food-composition sources Tistra matches meals against, in order of
// preference: when two sources both know a food, the earlier one wins.
//
// The agreed order is IFCT 2017 (Indian Food Composition Tables, ICMR-NIN)
// first and USDA FoodData Central as the fallback. IFCT isn't here yet:
// its licence for commercial use hasn't been confirmed, so none of its data
// is in the repository. Once it is confirmed:
//
//   1. python3 -I scripts/nutrients/import_ifct.py --in <licensed file> \
//        --out data/food-composition/ifct-2017.json
//   2. Add `import ifct2017 from "../../../../data/food-composition/ifct-2017.json";`
//      and put it FIRST in COMPOSITION_SOURCES below.
//
// Nothing else changes: every source file has the same shape
// (CompositionSourceFile), checked by validateSourceFile at load.

export const COMPOSITION_SOURCES: CompositionSourceFile[] = [usdaFdcSubset as unknown as CompositionSourceFile];
