import type { NutrientKey } from "../catalog";
import type { CompositionFoodRecord, CompositionSourceFile, CompositionValue, FoodState } from "../composition-types";

// Converts the Indian Food Composition Tables 2017 (IFCT 2017, ICMR-NIN)
// into Tistra's composition source format.
//
// NO IFCT DATA IS IN THIS REPOSITORY. The licence for commercial use hasn't
// been confirmed. This converter runs only on a file the user supplies
// (scripts/nutrients/import-ifct.ts), and its tests use a synthetic fixture
// with obviously fake values.
//
// IFCT columns are named by INFOODS tagname. The defaults below are those
// tagnames with the units IFCT 2017 reports them in. A file whose headers
// or units differ can override them with a column map.
//
// Conversions, all documented NASEM or INFOODS conventions:
//   - energy: ENERC in kJ / 4.184 = kcal.
//   - carbs: IFCT's CHOAVLDF is AVAILABLE carbohydrate (fibre excluded).
//     USDA's "carbohydrate by difference" includes fibre, so carbs here =
//     CHOAVLDF + FIBTG, and only when both are present.
//   - vitamin A (µg RAE) = retinol + beta-carotene/12 + (alpha-carotene +
//     beta-cryptoxanthin)/24, only when all four are present. Otherwise
//     unknown: it's never approximated from part of its components.
//   - folate (µg DFE) = total folates. IFCT analyses unfortified foods,
//     whose folate is all food folate, so DFE = food folate and folic acid
//     is 0.
//   - vitamin D (µg) = ergocalciferol (D2) + cholecalciferol (D3), only
//     when both are present.
// A blank, "ND", "NA" or "-" is unknown, never 0. "Tr" is trace.

export interface IfctColumnMap {
  code: string;
  name: string;
  /** Food group letter column, optional. */
  group?: string;
  /** INFOODS tagname -> { column, unit }. */
  nutrients: Record<string, { column: string; unit: string }>;
}

export const DEFAULT_IFCT_COLUMNS: IfctColumnMap = {
  code: "code",
  name: "name",
  group: "grup",
  nutrients: {
    ENERC: { column: "enerc", unit: "kJ" },
    PROTCNT: { column: "protcnt", unit: "g" },
    FATCE: { column: "fatce", unit: "g" },
    FIBTG: { column: "fibtg", unit: "g" },
    CHOAVLDF: { column: "choavldf", unit: "g" },
    CA: { column: "ca", unit: "mg" },
    FE: { column: "fe", unit: "mg" },
    MG: { column: "mg", unit: "mg" },
    K: { column: "k", unit: "mg" },
    ZN: { column: "zn", unit: "mg" },
    FOLSUM: { column: "folsum", unit: "µg" },
    VITC: { column: "vitc", unit: "mg" },
    VITB12: { column: "vitb12", unit: "µg" },
    RETOL: { column: "retol", unit: "µg" },
    CARTB: { column: "cartb", unit: "µg" },
    CARTA: { column: "carta", unit: "µg" },
    CRYPXB: { column: "crypxb", unit: "µg" },
    ERGCAL: { column: "ergcal", unit: "µg" },
    CHOCAL: { column: "chocal", unit: "µg" },
    ID: { column: "id", unit: "µg" },
  },
};

/** IFCT 2017 food groups, by letter. */
const GROUPS: Record<string, string> = {
  A: "grain",
  B: "legume",
  C: "vegetable",
  D: "vegetable",
  E: "fruit",
  F: "vegetable",
  G: "spice",
  H: "nut",
  I: "sweet",
  J: "vegetable",
  K: "other",
  L: "dairy",
  M: "protein",
  N: "protein",
  O: "protein",
  P: "protein",
  Q: "protein",
  R: "protein",
  S: "protein",
  T: "fat",
};

/** Curated per-food details the table itself doesn't carry: the names a
 * meal analysis would use, and the state. Written by a person, by IFCT
 * code, once the licence allows. */
export type IfctAliases = Record<string, { key?: string; aliases: string[]; state?: FoodState; portions?: Array<{ label: string; grams: number }> }>;

type Parsed = { kind: "value"; v: number } | { kind: "trace" } | { kind: "unknown" };

export function parseIfctValue(raw: string | undefined): Parsed {
  const t = (raw ?? "").trim();
  if (!t || /^(nd|na|n\/a|-|—)$/i.test(t)) return { kind: "unknown" };
  if (/^(tr|trace)$/i.test(t)) return { kind: "trace" };
  // "12.3±1.2" or "12.3 ± 1.2": the mean.
  const m = t.match(/^(\d+(?:\.\d+)?)/);
  if (!m) return { kind: "unknown" };
  return { kind: "value", v: Number(m[1]) };
}

function scale(value: number, from: string, to: "g" | "mg" | "µg"): number | null {
  const exp: Record<string, number> = { g: 0, mg: 1, µg: 2, ug: 2, mcg: 2 };
  if (!(from in exp)) return null;
  return value * Math.pow(1000, exp[to] - exp[from]);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function convertIfctRow(row: Record<string, string>, columns: IfctColumnMap = DEFAULT_IFCT_COLUMNS): {
  per100g: Partial<Record<NutrientKey, CompositionValue>>;
  derived: string[];
} {
  const get = (tag: string): Parsed => {
    const c = columns.nutrients[tag];
    return c ? parseIfctValue(row[c.column]) : { kind: "unknown" };
  };
  const unitOf = (tag: string) => columns.nutrients[tag]?.unit ?? "";
  const per100g: Partial<Record<NutrientKey, CompositionValue>> = {};
  const derived: string[] = [];

  const put = (key: NutrientKey, tag: string, to: "g" | "mg" | "µg") => {
    const p = get(tag);
    if (p.kind === "trace") per100g[key] = "trace";
    else if (p.kind === "value") {
      const v = scale(p.v, unitOf(tag), to);
      if (v != null) per100g[key] = round(v);
    }
  };

  // Energy.
  const energy = get("ENERC");
  if (energy.kind === "value") {
    if (unitOf("ENERC") === "kJ") {
      per100g.energy = Math.round(energy.v / 4.184);
      derived.push("energy_kcal_from_kj");
    } else if (unitOf("ENERC") === "kcal") per100g.energy = Math.round(energy.v);
  }
  put("protein", "PROTCNT", "g");
  put("fat", "FATCE", "g");
  put("fiber", "FIBTG", "g");
  const cho = get("CHOAVLDF");
  const fib = get("FIBTG");
  if (cho.kind === "value" && fib.kind === "value") {
    const a = scale(cho.v, unitOf("CHOAVLDF"), "g");
    const b = scale(fib.v, unitOf("FIBTG"), "g");
    if (a != null && b != null) {
      per100g.carbs = round(a + b);
      derived.push("carbs_total_from_available_plus_fibre");
    }
  }
  put("calcium", "CA", "mg");
  put("iron", "FE", "mg");
  put("magnesium", "MG", "mg");
  put("potassium", "K", "mg");
  put("zinc", "ZN", "mg");
  put("vitamin_c", "VITC", "mg");
  put("vitamin_b12", "VITB12", "µg");
  put("iodine", "ID", "µg");
  put("retinol", "RETOL", "µg");

  const fol = get("FOLSUM");
  if (fol.kind === "value") {
    const v = scale(fol.v, unitOf("FOLSUM"), "µg");
    if (v != null) {
      per100g.folate = round(v);
      per100g.folic_acid = 0;
      derived.push("folate_dfe_equals_food_folate_unfortified");
    }
  } else if (fol.kind === "trace") per100g.folate = "trace";

  const parts = ["RETOL", "CARTB", "CARTA", "CRYPXB"].map((t) => {
    const p = get(t);
    return p.kind === "value" ? scale(p.v, unitOf(t), "µg") : p.kind === "trace" ? 0 : null;
  });
  if (parts.every((p) => p != null)) {
    const [ret, cb, ca, cx] = parts as number[];
    per100g.vitamin_a = round(ret + cb / 12 + (ca + cx) / 24);
    derived.push("vitamin_a_rae_from_retinol_and_carotenoids");
  }

  const d2 = get("ERGCAL");
  const d3 = get("CHOCAL");
  if (d2.kind !== "unknown" && d3.kind !== "unknown") {
    const a = d2.kind === "value" ? scale(d2.v, unitOf("ERGCAL"), "µg") : 0;
    const b = d3.kind === "value" ? scale(d3.v, unitOf("CHOCAL"), "µg") : 0;
    if (a != null && b != null) {
      per100g.vitamin_d = round(a + b);
      derived.push("vitamin_d_from_d2_plus_d3");
    }
  }
  return { per100g, derived };
}

export function convertIfct(
  rows: Array<Record<string, string>>,
  opts: { aliases?: IfctAliases; columns?: IfctColumnMap; release: string; version: string }
): CompositionSourceFile {
  const columns = opts.columns ?? DEFAULT_IFCT_COLUMNS;
  const foods: CompositionFoodRecord[] = [];
  for (const row of rows) {
    const code = (row[columns.code] ?? "").trim();
    const name = (row[columns.name] ?? "").trim();
    if (!code || !name) continue;
    const curated = opts.aliases?.[code];
    const { per100g, derived } = convertIfctRow(row, columns);
    const groupLetter = (columns.group ? row[columns.group] : code.charAt(0))?.trim().charAt(0).toUpperCase() ?? "";
    foods.push({
      key: curated?.key ?? `ifct_${code.toLowerCase()}`,
      id: `ifct:${code}`,
      sourceCode: code,
      dataset: "ifct2017",
      description: name,
      state: curated?.state ?? "raw",
      group: GROUPS[groupLetter] ?? "other",
      aliases: curated?.aliases ?? [],
      per100g,
      ...(derived.length ? { derived } : {}),
      ...(curated?.portions?.length ? { portions: curated.portions } : {}),
    });
  }
  return {
    source: {
      id: "ifct",
      name: "Indian Food Composition Tables 2017 (ICMR-NIN)",
      licence: "Licence for commercial use to be confirmed before this file is committed",
      url: "https://www.nin.res.in/",
      datasets: [{ id: "ifct2017", release: opts.release, label: "IFCT 2017" }],
    },
    version: opts.version,
    builtBy: "scripts/nutrients/import-ifct.ts",
    foods,
  };
}

/** A small RFC 4180 CSV reader: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}
