/**
 * Converts a licensed IFCT 2017 CSV into data/food-composition/ifct-2017.json.
 *
 * DON'T RUN THIS, AND DON'T COMMIT ITS OUTPUT, until the IFCT 2017 licence
 * for commercial use has been confirmed. See data/food-composition/README.md.
 *
 *   npx tsx scripts/nutrients/import-ifct.ts \
 *     --in <path to IFCT 2017 CSV> \
 *     --aliases <path to code -> aliases JSON> \
 *     [--columns <path to column map JSON>] \
 *     --out data/food-composition/ifct-2017.json
 *
 * The CSV needs one row per food with INFOODS-tagname columns (code, name,
 * enerc, protcnt, ca, fe, ...); --columns maps other header names. The
 * aliases file is curated by a person: IFCT code -> the names a meal
 * analysis would use. Foods without aliases are kept but only reachable by
 * id. Then register the file first in src/lib/nutrients/sources/index.ts.
 */
import { readFileSync, writeFileSync } from "fs";

import { convertIfct, parseCsv, type IfctAliases, type IfctColumnMap } from "../../src/lib/nutrients/importers/ifct";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const input = arg("in");
const out = arg("out");
if (!input || !out) {
  console.error("usage: --in <csv> --out <json> [--aliases <json>] [--columns <json>]");
  process.exit(1);
}
const aliases = arg("aliases") ? (JSON.parse(readFileSync(arg("aliases")!, "utf8")) as IfctAliases) : undefined;
const columns = arg("columns") ? (JSON.parse(readFileSync(arg("columns")!, "utf8")) as IfctColumnMap) : undefined;
const today = new Date().toISOString().slice(0, 10);
const file = convertIfct(parseCsv(readFileSync(input, "utf8")), { aliases, columns, release: "2017", version: `ifct-2017-${today}` });
writeFileSync(out, `${JSON.stringify(file)}\n`);
console.log(`${file.foods.length} foods written to ${out}`);
