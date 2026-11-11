// Dietary reference values (src/lib/nutrients/references.ts): versioned,
// sourced, kept apart by kind, and chosen per person by market. Spot values
// are checked against the published tables they were transcribed from
// (Health Canada's DRI tables for NASEM; ICMR-NIN 2020 brief note, Tables 3
// and 4).

import { MICRO_KEYS } from "@/lib/nutrients/catalog";
import { ICMR_NIN_2020, marketFor, NASEM_DRI, REFERENCE_EDITIONS, resolveReferences } from "@/lib/nutrients/references";

describe("editions", () => {
  it("are unreviewed, versioned and cite their source", () => {
    for (const e of Object.values(REFERENCE_EDITIONS)) {
      expect(e.reviewStatus).toBe("unreviewed");
      expect(e.version).toBeTruthy();
      expect(e.urls.length).toBeGreaterThan(0);
      expect(e.urls.every((u) => u.startsWith("https://"))).toBe(true);
    }
  });

  it("keep RDA, AI, EAR and UL apart", () => {
    const kinds = (nutrient: string) => new Set(NASEM_DRI.entries.filter((e) => e.nutrient === nutrient).map((e) => e.kind));
    expect(kinds("potassium")).toEqual(new Set(["AI"]));
    expect(kinds("iron")).toEqual(new Set(["EAR", "RDA", "UL"]));
    expect(kinds("vitamin_b12")).toEqual(new Set(["EAR", "RDA"]));
  });

  it("record which form each upper limit applies to", () => {
    expect(NASEM_DRI.upperLimitForms).toMatchObject({ magnesium: "supplemental", vitamin_a: "preformed_retinol", folate: "folic_acid", iron: "total" });
  });

  it("leave ICMR-NIN vitamin A and potassium unset rather than guess their basis", () => {
    expect(ICMR_NIN_2020.entries.some((e) => e.nutrient === "vitamin_a")).toBe(false);
    expect(ICMR_NIN_2020.entries.some((e) => e.nutrient === "potassium")).toBe(false);
    expect(ICMR_NIN_2020.gaps.join(" ")).toMatch(/Vitamin A/);
  });
});

describe("marketFor", () => {
  it("is India for an Indian number or timezone, otherwise NASEM's", () => {
    expect(marketFor({ whatsappNumber: "+91 98765 43210" })).toBe("india");
    expect(marketFor({ whatsappNumber: "919876543210" })).toBe("india");
    expect(marketFor({ timezone: "Asia/Calcutta" })).toBe("india");
    expect(marketFor({ whatsappNumber: "+6591234567", timezone: "Asia/Singapore" })).toBe("other");
    expect(marketFor({})).toBe("other");
  });
});

describe("resolveReferences", () => {
  it("gives NASEM values by age and sex", () => {
    const r = resolveReferences({ sex: "female", ageYears: 35, market: "other", pregnant: false, lactating: false }, MICRO_KEYS);
    expect(r.iron.target).toMatchObject({ kind: "RDA", amount: 18, unit: "mg", edition: "nasem-dri", lifeStage: "women 31–50" });
    expect(r.iron.ear?.amount).toBe(8.1);
    expect(r.potassium.target).toMatchObject({ kind: "AI", amount: 2600 });
    expect(r.vitamin_d.target?.amount).toBe(15);
    expect(r.magnesium.upperLimit).toMatchObject({ amount: 350, appliesTo: "supplemental" });
    expect(r.folate.upperLimit).toMatchObject({ amount: 1000, appliesTo: "folic_acid" });
    expect(r.vitamin_b12.upperLimit).toBeNull();
  });

  it("changes with age: vitamin D for over-70s, iron after 50", () => {
    const old = resolveReferences({ sex: "female", ageYears: 75, market: "other", pregnant: false }, MICRO_KEYS);
    expect(old.vitamin_d.target?.amount).toBe(20);
    expect(old.iron.target?.amount).toBe(8);
    expect(old.calcium.target?.amount).toBe(1200);
  });

  it("uses pregnancy values only when pregnancy is stated", () => {
    const r = resolveReferences({ sex: "female", ageYears: 28, market: "other", pregnant: true }, MICRO_KEYS);
    expect(r.iron.target).toMatchObject({ amount: 27, lifeStage: "pregnant women 19–30" });
    const unknown = resolveReferences({ sex: "female", ageYears: 28, market: "other" }, MICRO_KEYS);
    expect(unknown.iron.target?.amount).toBe(18);
    expect(unknown.iron.notes.join(" ")).toMatch(/weren't stated/);
  });

  it("gives ICMR-NIN 2020 values in India, with vitamin D converted from IU", () => {
    const r = resolveReferences({ sex: "male", ageYears: 60, market: "india" }, MICRO_KEYS);
    expect(r.iron.target).toMatchObject({ kind: "RDA", amount: 19, edition: "icmr-nin-2020" });
    expect(r.zinc.target?.amount).toBe(17);
    expect(r.folate.target?.amount).toBe(300);
    expect(r.vitamin_d.target?.amount).toBe(15);
    const f = resolveReferences({ sex: "female", ageYears: 45, market: "india" }, MICRO_KEYS);
    expect(f.iron.target?.amount).toBe(29);
    expect(f.folate.target?.amount).toBe(220);
  });

  it("has no ICMR vitamin A target, and says why", () => {
    const r = resolveReferences({ sex: "male", ageYears: 60, market: "india" }, MICRO_KEYS);
    expect(r.vitamin_a.target).toBeNull();
    expect(r.vitamin_a.notes.length).toBeGreaterThan(0);
  });

  it("falls back to NASEM's upper limit in India, labelled as such", () => {
    const r = resolveReferences({ sex: "male", ageYears: 60, market: "india" }, MICRO_KEYS);
    expect(r.iron.upperLimit).toMatchObject({ amount: 45, edition: "nasem-dri", fallbackFrom: "icmr-nin-2020" });
  });

  it("uses a value without sex only when both sexes share it", () => {
    const r = resolveReferences({ sex: null, ageYears: 40, market: "other" }, MICRO_KEYS);
    expect(r.calcium.target?.amount).toBe(1000);
    expect(r.calcium.target?.lifeStage).toBe("adults 31–50");
    expect(r.iron.target).toBeNull();
    expect(r.iron.notes.join(" ")).toMatch(/sex isn't recorded/);
  });

  it("has nothing without an age", () => {
    const r = resolveReferences({ sex: "male", ageYears: null, market: "other" }, MICRO_KEYS);
    expect(r.calcium.target).toBeNull();
    expect(r.calcium.notes[0]).toMatch(/Age is needed/);
  });
});
