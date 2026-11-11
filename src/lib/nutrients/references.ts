import type { MicroKey } from "./catalog";
import { NUTRIENTS } from "./catalog";

// Dietary reference values for vitamins and minerals, versioned and in code.
//
// Two editions, chosen per person by market:
//   - ICMR-NIN 2020 (India): Nutrient Requirements for Indians.
//   - NASEM Dietary Reference Intakes (everywhere else): the joint US/Canada
//     DRIs, as published in Health Canada's reference tables.
//
// The kinds stay distinct and are never mixed up:
//   - EAR: the median requirement. Not used as a target.
//   - RDA: meets the needs of nearly all healthy people. A target.
//   - AI: set where there wasn't evidence for an RDA. A target too, but
//     falling below an AI does NOT establish inadequacy, and nothing in the
//     app may say it does.
//   - UL: the highest intake unlikely to cause harm, for a stated form:
//     magnesium's UL covers supplements and medicines only, vitamin A's
//     covers preformed vitamin A (retinol) only, and folate's covers
//     synthetic folic acid only. Everything else is total intake.
//
// Every value below was transcribed from the source named beside its
// edition, and nothing was filled from memory. Where the source doesn't give
// a value, or gives one on a basis we can't compare against, it is left out
// and the gap is listed in `gaps`. A missing reference means "no
// comparison", never a guessed one.
//
// Both editions are reviewStatus "unreviewed": transcribed by engineering,
// not yet checked by a qualified nutrition professional.

export type ReferenceKind = "RDA" | "AI" | "EAR" | "UL";
export type UpperLimitForm = "total" | "supplemental" | "preformed_retinol" | "folic_acid";
export type EditionId = "icmr-nin-2020" | "nasem-dri";
export type Sex = "male" | "female";
export type PhysiologicalState = "none" | "pregnancy" | "lactation";

export interface ReferenceBand {
  sex: Sex;
  /** Inclusive lower bound, exclusive upper bound, in whole years. */
  minAge: number;
  maxAge: number;
  state: PhysiologicalState;
}

export interface ReferenceEntry {
  nutrient: MicroKey;
  kind: ReferenceKind;
  /** In the nutrient's canonical unit (see catalog.ts). */
  amount: number;
  band: ReferenceBand;
}

export interface ReferenceEdition {
  id: EditionId;
  version: string;
  name: string;
  citation: string;
  urls: string[];
  /** Where a value was converted from the source's unit, how. */
  conversions: string[];
  reviewStatus: "unreviewed" | "reviewed";
  /** The form each nutrient's UL applies to. */
  upperLimitForms: Partial<Record<MicroKey, UpperLimitForm>>;
  entries: ReferenceEntry[];
  /** Values this edition doesn't have here, and why. */
  gaps: string[];
}

// ─── NASEM DRIs ───────────────────────────────────────────────────────────

const NASEM_AGES: Array<[number, number]> = [
  [14, 19],
  [19, 31],
  [31, 51],
  [51, 71],
  [71, 200],
];
const PREG_AGES: Array<[number, number]> = [
  [14, 19],
  [19, 31],
  [31, 51],
];

/** One row per nutrient and kind: values for males by NASEM_AGES, females
 * by NASEM_AGES, pregnancy and lactation by PREG_AGES. null = not
 * determined. */
type NasemRow = {
  nutrient: MicroKey;
  kind: ReferenceKind;
  male: Array<number | null>;
  female: Array<number | null>;
  pregnancy: Array<number | null>;
  lactation: Array<number | null>;
};

// Transcribed from Health Canada, "Dietary reference intakes tables:
// Reference values for elements" and "... for vitamins" (page details
// 2025-11-19), which reproduce the NASEM (IOM) DRI reports: Calcium and
// Vitamin D (2011); Vitamin A, Iron, Iodine, Zinc... (2001); Folate, B12
// (1998); Vitamin C (2000); Magnesium (1997); Sodium and Potassium (2019).
const NASEM_ROWS: NasemRow[] = [
  { nutrient: "calcium", kind: "EAR", male: [1100, 800, 800, 800, 1000], female: [1100, 800, 800, 1000, 1000], pregnancy: [1100, 800, 800], lactation: [1100, 800, 800] },
  { nutrient: "calcium", kind: "RDA", male: [1300, 1000, 1000, 1000, 1200], female: [1300, 1000, 1000, 1200, 1200], pregnancy: [1300, 1000, 1000], lactation: [1300, 1000, 1000] },
  { nutrient: "calcium", kind: "UL", male: [3000, 2500, 2500, 2000, 2000], female: [3000, 2500, 2500, 2000, 2000], pregnancy: [3000, 2500, 2500], lactation: [3000, 2500, 2500] },

  { nutrient: "iodine", kind: "EAR", male: [95, 95, 95, 95, 95], female: [95, 95, 95, 95, 95], pregnancy: [160, 160, 160], lactation: [209, 209, 209] },
  { nutrient: "iodine", kind: "RDA", male: [150, 150, 150, 150, 150], female: [150, 150, 150, 150, 150], pregnancy: [220, 220, 220], lactation: [290, 290, 290] },
  { nutrient: "iodine", kind: "UL", male: [900, 1100, 1100, 1100, 1100], female: [900, 1100, 1100, 1100, 1100], pregnancy: [900, 1100, 1100], lactation: [900, 1100, 1100] },

  { nutrient: "iron", kind: "EAR", male: [7.7, 6, 6, 6, 6], female: [7.9, 8.1, 8.1, 5, 5], pregnancy: [23, 22, 22], lactation: [7, 6.5, 6.5] },
  { nutrient: "iron", kind: "RDA", male: [11, 8, 8, 8, 8], female: [15, 18, 18, 8, 8], pregnancy: [27, 27, 27], lactation: [10, 9, 9] },
  { nutrient: "iron", kind: "UL", male: [45, 45, 45, 45, 45], female: [45, 45, 45, 45, 45], pregnancy: [45, 45, 45], lactation: [45, 45, 45] },

  { nutrient: "magnesium", kind: "EAR", male: [340, 330, 350, 350, 350], female: [300, 255, 265, 265, 265], pregnancy: [335, 290, 300], lactation: [300, 255, 265] },
  { nutrient: "magnesium", kind: "RDA", male: [410, 400, 420, 420, 420], female: [360, 310, 320, 320, 320], pregnancy: [400, 350, 360], lactation: [360, 310, 320] },
  // "The UL for magnesium represents intake from a pharmacological agent
  // only and does not include intake from food and water."
  { nutrient: "magnesium", kind: "UL", male: [350, 350, 350, 350, 350], female: [350, 350, 350, 350, 350], pregnancy: [350, 350, 350], lactation: [350, 350, 350] },

  // Potassium has an AI, no RDA, and no UL ("not determined owing to lack of
  // a toxicological indicator").
  { nutrient: "potassium", kind: "AI", male: [3000, 3400, 3400, 3400, 3400], female: [2300, 2600, 2600, 2600, 2600], pregnancy: [2600, 2900, 2900], lactation: [2500, 2800, 2800] },

  { nutrient: "zinc", kind: "EAR", male: [8.5, 9.4, 9.4, 9.4, 9.4], female: [7.3, 6.8, 6.8, 6.8, 6.8], pregnancy: [10.5, 9.5, 9.5], lactation: [10.9, 10.4, 10.4] },
  { nutrient: "zinc", kind: "RDA", male: [11, 11, 11, 11, 11], female: [9, 8, 8, 8, 8], pregnancy: [12, 11, 11], lactation: [13, 12, 12] },
  { nutrient: "zinc", kind: "UL", male: [34, 40, 40, 40, 40], female: [34, 40, 40, 40, 40], pregnancy: [34, 40, 40], lactation: [34, 40, 40] },

  // Vitamin A in µg RAE; the UL is for preformed vitamin A only.
  { nutrient: "vitamin_a", kind: "EAR", male: [630, 625, 625, 625, 625], female: [485, 500, 500, 500, 500], pregnancy: [530, 550, 550], lactation: [885, 900, 900] },
  { nutrient: "vitamin_a", kind: "RDA", male: [900, 900, 900, 900, 900], female: [700, 700, 700, 700, 700], pregnancy: [750, 770, 770], lactation: [1200, 1300, 1300] },
  { nutrient: "vitamin_a", kind: "UL", male: [2800, 3000, 3000, 3000, 3000], female: [2800, 3000, 3000, 3000, 3000], pregnancy: [2800, 3000, 3000], lactation: [2800, 3000, 3000] },

  { nutrient: "vitamin_c", kind: "EAR", male: [63, 75, 75, 75, 75], female: [56, 60, 60, 60, 60], pregnancy: [66, 70, 70], lactation: [96, 100, 100] },
  { nutrient: "vitamin_c", kind: "RDA", male: [75, 90, 90, 90, 90], female: [65, 75, 75, 75, 75], pregnancy: [80, 85, 85], lactation: [115, 120, 120] },
  { nutrient: "vitamin_c", kind: "UL", male: [1800, 2000, 2000, 2000, 2000], female: [1800, 2000, 2000, 2000, 2000], pregnancy: [1800, 2000, 2000], lactation: [1800, 2000, 2000] },

  // Vitamin D in µg (the tables also give IU; 1 µg = 40 IU).
  { nutrient: "vitamin_d", kind: "EAR", male: [10, 10, 10, 10, 10], female: [10, 10, 10, 10, 10], pregnancy: [10, 10, 10], lactation: [10, 10, 10] },
  { nutrient: "vitamin_d", kind: "RDA", male: [15, 15, 15, 15, 20], female: [15, 15, 15, 15, 20], pregnancy: [15, 15, 15], lactation: [15, 15, 15] },
  { nutrient: "vitamin_d", kind: "UL", male: [100, 100, 100, 100, 100], female: [100, 100, 100, 100, 100], pregnancy: [100, 100, 100], lactation: [100, 100, 100] },

  // Folate in µg DFE; the UL is in µg of synthetic folic acid only.
  { nutrient: "folate", kind: "EAR", male: [330, 320, 320, 320, 320], female: [330, 320, 320, 320, 320], pregnancy: [520, 520, 520], lactation: [450, 450, 450] },
  { nutrient: "folate", kind: "RDA", male: [400, 400, 400, 400, 400], female: [400, 400, 400, 400, 400], pregnancy: [600, 600, 600], lactation: [500, 500, 500] },
  { nutrient: "folate", kind: "UL", male: [800, 1000, 1000, 1000, 1000], female: [800, 1000, 1000, 1000, 1000], pregnancy: [800, 1000, 1000], lactation: [800, 1000, 1000] },

  // Vitamin B12: no UL could be established.
  { nutrient: "vitamin_b12", kind: "EAR", male: [2, 2, 2, 2, 2], female: [2, 2, 2, 2, 2], pregnancy: [2.2, 2.2, 2.2], lactation: [2.4, 2.4, 2.4] },
  { nutrient: "vitamin_b12", kind: "RDA", male: [2.4, 2.4, 2.4, 2.4, 2.4], female: [2.4, 2.4, 2.4, 2.4, 2.4], pregnancy: [2.6, 2.6, 2.6], lactation: [2.8, 2.8, 2.8] },
];

function expandNasem(rows: NasemRow[]): ReferenceEntry[] {
  const out: ReferenceEntry[] = [];
  for (const row of rows) {
    const push = (sex: Sex, state: PhysiologicalState, ages: Array<[number, number]>, values: Array<number | null>) =>
      values.forEach((amount, i) => {
        if (amount != null) out.push({ nutrient: row.nutrient, kind: row.kind, amount, band: { sex, minAge: ages[i][0], maxAge: ages[i][1], state } });
      });
    push("male", "none", NASEM_AGES, row.male);
    push("female", "none", NASEM_AGES, row.female);
    push("female", "pregnancy", PREG_AGES, row.pregnancy);
    push("female", "lactation", PREG_AGES, row.lactation);
  }
  return out;
}

export const NASEM_DRI: ReferenceEdition = {
  id: "nasem-dri",
  version: "nasem-dri-hc-2025-11-19",
  name: "Dietary Reference Intakes (National Academies of Sciences, Engineering, and Medicine)",
  citation:
    "Institute of Medicine / National Academies DRI reports (1997–2019), as tabulated by Health Canada, Dietary reference intakes tables (page details 2025-11-19).",
  urls: [
    "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-elements.html",
    "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-vitamins.html",
  ],
  conversions: [],
  reviewStatus: "unreviewed",
  upperLimitForms: {
    calcium: "total",
    iodine: "total",
    iron: "total",
    magnesium: "supplemental",
    zinc: "total",
    vitamin_a: "preformed_retinol",
    vitamin_c: "total",
    vitamin_d: "total",
    folate: "folic_acid",
  },
  entries: expandNasem(NASEM_ROWS),
  gaps: [
    "Under-14s are not included (Guidance is for adults).",
    "Potassium: AI only; no UL was determined.",
    "Vitamin B12: no UL was determined.",
  ],
};

// ─── ICMR-NIN 2020 ───────────────────────────────────────────────────────

/** Adults, as the source's summary tables give them: men and women,
 * without age bands, pregnancy or lactation. */
const ICMR_ADULT_MALE: ReferenceBand = { sex: "male", minAge: 18, maxAge: 200, state: "none" };
const ICMR_ADULT_FEMALE: ReferenceBand = { sex: "female", minAge: 18, maxAge: 200, state: "none" };

// Transcribed from ICMR-NIN, "A Brief Note on Nutrient Requirements for
// Indians, the Recommended Dietary Allowances (RDA) and the Estimated
// Average Requirements (EAR), ICMR-NIN, 2020", Tables 3 (males) and 4
// (females), columns "RDA 2020" and "EAR 2020". Source PDF sha256
// be8e64161c6b9f66c407b7d12b0bf75fe95e8860bf8f44192c4fb12a155c50f0.
const ICMR_VALUES: Array<{ nutrient: MicroKey; male: [number, number]; female: [number, number] }> = [
  // [RDA, EAR]
  { nutrient: "calcium", male: [1000, 800], female: [1000, 800] },
  { nutrient: "magnesium", male: [440, 370], female: [370, 310] },
  { nutrient: "iron", male: [19, 11], female: [29, 15] },
  { nutrient: "zinc", male: [17, 14], female: [13, 11] },
  { nutrient: "iodine", male: [150, 95], female: [150, 95] },
  { nutrient: "folate", male: [300, 250], female: [220, 180] }, // µg DFE in the source
  { nutrient: "vitamin_b12", male: [2.2, 2], female: [2.2, 2] },
  { nutrient: "vitamin_c", male: [80, 65], female: [65, 55] },
  // Source gives IU: RDA 600 IU, EAR 400 IU -> 15 µg, 10 µg.
  { nutrient: "vitamin_d", male: [15, 10], female: [15, 10] },
];

export const ICMR_NIN_2020: ReferenceEdition = {
  id: "icmr-nin-2020",
  version: "icmr-nin-2020-brief-note",
  name: "Nutrient Requirements for Indians (ICMR-NIN 2020)",
  citation:
    "ICMR-National Institute of Nutrition. A Brief Note on Nutrient Requirements for Indians, the Recommended Dietary Allowances (RDA) and the Estimated Average Requirements (EAR), 2020. Tables 3 and 4.",
  urls: ["https://www.nin.res.in/rdabook/brief_note.pdf"],
  conversions: ["Vitamin D: source gives IU; converted at 40 IU = 1 µg."],
  reviewStatus: "unreviewed",
  upperLimitForms: {},
  entries: ICMR_VALUES.flatMap(({ nutrient, male, female }) => [
    { nutrient, kind: "RDA" as const, amount: male[0], band: ICMR_ADULT_MALE },
    { nutrient, kind: "EAR" as const, amount: male[1], band: ICMR_ADULT_MALE },
    { nutrient, kind: "RDA" as const, amount: female[0], band: ICMR_ADULT_FEMALE },
    { nutrient, kind: "EAR" as const, amount: female[1], band: ICMR_ADULT_FEMALE },
  ]),
  gaps: [
    "Vitamin A: the summary gives µg without saying whether it is RAE or retinol equivalents at a different carotene factor, so it can't be compared with intake in µg RAE. Left unset until checked against the full report.",
    "Potassium: not in the summary tables. Left unset.",
    "Pregnancy, lactation, adolescents and age bands within adulthood: not in the summary tables. Left unset.",
    "Tolerable upper limits (TULs): defined in the full 2020 report but not in the summary. Left unset; upper limits fall back to NASEM, labelled as such (see resolveReferences).",
  ],
};

export const REFERENCE_EDITIONS: Record<EditionId, ReferenceEdition> = {
  "icmr-nin-2020": ICMR_NIN_2020,
  "nasem-dri": NASEM_DRI,
};

// ─── Choosing and resolving ──────────────────────────────────────────────

export type Market = "india" | "other";

/**
 * Which edition a person is compared against.
 *
 * India when their WhatsApp number is an Indian one (+91) or their
 * timezone is India's; everyone else gets NASEM. This is about the person's
 * diet and population reference, not about pricing, so it reads the
 * person's own details rather than the viewer's location.
 */
export function marketFor(person: { whatsappNumber?: string | null; timezone?: string | null }): Market {
  const digits = (person.whatsappNumber ?? "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+91") || (digits.startsWith("91") && digits.length === 12)) return "india";
  if (person.timezone === "Asia/Kolkata" || person.timezone === "Asia/Calcutta") return "india";
  return "other";
}

export function editionFor(market: Market): ReferenceEdition {
  return market === "india" ? ICMR_NIN_2020 : NASEM_DRI;
}

export interface ReferencePerson {
  sex: Sex | null;
  ageYears: number | null;
  /** null = not known. Treated as "none" only when the person said so. */
  pregnant?: boolean | null;
  lactating?: boolean | null;
  market: Market;
}

export interface ResolvedValue {
  kind: ReferenceKind;
  amount: number;
  unit: string;
  edition: EditionId;
  editionVersion: string;
  lifeStage: string;
}

export interface ResolvedReference {
  nutrient: MicroKey;
  /** The intake to compare against: the RDA, or the AI where there's no RDA. */
  target: ResolvedValue | null;
  ear: ResolvedValue | null;
  upperLimit: (ResolvedValue & { appliesTo: UpperLimitForm; fallbackFrom?: EditionId }) | null;
  /** Why something is missing, in plain words, for the explanation. */
  notes: string[];
}

function lifeStageLabel(band: ReferenceBand): string {
  const who = band.sex === "male" ? "men" : "women";
  const ages = band.maxAge >= 200 ? `${band.minAge}+` : `${band.minAge}–${band.maxAge - 1}`;
  const state = band.state === "pregnancy" ? "pregnant " : band.state === "lactation" ? "breastfeeding " : "";
  return `${state}${who} ${ages}`;
}

function findEntry(edition: ReferenceEdition, nutrient: MicroKey, kind: ReferenceKind, person: ReferencePerson): ReferenceEntry | "ambiguous" | null {
  if (person.ageYears == null) return null;
  const age = person.ageYears;
  const state: PhysiologicalState = person.pregnant ? "pregnancy" : person.lactating ? "lactation" : "none";
  const candidates = edition.entries.filter(
    (e) => e.nutrient === nutrient && e.kind === kind && e.band.state === state && age >= e.band.minAge && age < e.band.maxAge
  );
  if (person.sex) return candidates.find((e) => e.band.sex === person.sex) ?? null;
  // Sex not known: only usable when both sexes share the value.
  if (state !== "none") return candidates[0] ?? null;
  const male = candidates.find((e) => e.band.sex === "male");
  const female = candidates.find((e) => e.band.sex === "female");
  if (male && female && male.amount === female.amount) return male;
  return male || female ? "ambiguous" : null;
}

function resolved(edition: ReferenceEdition, entry: ReferenceEntry, sexKnown: boolean): ResolvedValue {
  const label = lifeStageLabel(entry.band);
  return {
    kind: entry.kind,
    amount: entry.amount,
    unit: NUTRIENTS[entry.nutrient].unitLabel,
    edition: edition.id,
    editionVersion: edition.version,
    lifeStage: sexKnown ? label : label.replace(/^(pregnant |breastfeeding )?(men|women)/, "$1adults"),
  };
}

/**
 * The reference values that apply to one person, per nutrient.
 *
 * Pregnancy and lactation must be stated: unknown is treated as neither,
 * and the note says so. Upper limits come from the person's edition; where
 * that edition has none transcribed (ICMR-NIN 2020 here), NASEM's UL is
 * used and labelled as a fallback, because comparing a high supplement
 * intake against no limit at all would be less safe than against NASEM's.
 */
export function resolveReferences(person: ReferencePerson, nutrients: readonly MicroKey[]): Record<MicroKey, ResolvedReference> {
  const edition = editionFor(person.market);
  const out = {} as Record<MicroKey, ResolvedReference>;
  for (const nutrient of nutrients) {
    const notes: string[] = [];
    if (person.ageYears == null) notes.push("Age is needed to choose a reference value.");
    let target: ResolvedValue | null = null;
    for (const kind of ["RDA", "AI"] as const) {
      const entry = findEntry(edition, nutrient, kind, person);
      if (entry === "ambiguous") {
        notes.push("The reference differs for men and women, and sex isn't recorded.");
        break;
      }
      if (entry) {
        target = resolved(edition, entry, person.sex != null);
        break;
      }
    }
    if (!target && person.ageYears != null && !notes.length) {
      notes.push(`${edition.name} has no reference value for ${NUTRIENTS[nutrient].label} at this life stage here.`);
    }
    const earEntry = findEntry(edition, nutrient, "EAR", person);
    const ear = earEntry && earEntry !== "ambiguous" ? resolved(edition, earEntry, person.sex != null) : null;

    let upperLimit: ResolvedReference["upperLimit"] = null;
    const ulEditions: ReferenceEdition[] = edition.id === "nasem-dri" ? [NASEM_DRI] : [edition, NASEM_DRI];
    for (const ulEdition of ulEditions) {
      const entry = findEntry(ulEdition, nutrient, "UL", person);
      if (entry && entry !== "ambiguous") {
        upperLimit = {
          ...resolved(ulEdition, entry, person.sex != null),
          appliesTo: ulEdition.upperLimitForms[nutrient] ?? "total",
          ...(ulEdition.id !== edition.id ? { fallbackFrom: edition.id } : {}),
        };
        break;
      }
    }
    if (person.pregnant == null && person.lactating == null && person.sex === "female") {
      notes.push("Pregnancy and breastfeeding weren't stated, so the non-pregnant reference is used.");
    }
    out[nutrient] = { nutrient, target, ear, upperLimit, notes };
  }
  return out;
}
