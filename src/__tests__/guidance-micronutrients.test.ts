// Phase 4 of the Guidance redesign: the vitamins and minerals screens'
// writes and loader. What's under test: who may answer for a person, that
// an answer recomputes the estimates it changes, that a supplement on the
// list is never intake and a dose counts once, that label units convert
// only by documented rules, that nothing loads while the flag is off, and
// that the next-meal suggestion leans towards a real gap only.

const mockFlags = { guidance: true };
jest.mock("@/lib/billing/feature-flags", () =>
  Object.defineProperty({ ...jest.requireActual("@/lib/billing/feature-flags") }, "GUIDANCE_ENABLED", {
    get: () => mockFlags.guidance,
    enumerable: true,
  })
);

const mockRecompute = jest.fn(async () => ({ recomputed: 0, failed: 0 }));
jest.mock("@/lib/nutrients/pipeline", () => ({
  ...jest.requireActual("@/lib/nutrients/pipeline"),
  recomputeAfterFactChange: (...args: unknown[]) => mockRecompute(...(args as [])),
}));

import type { GuidanceActor } from "@/lib/guidance/authorization";
import {
  addSupplement,
  answerHouseholdFact,
  confirmProductBrand,
  setSupplementTaken,
  stopSupplement,
} from "@/lib/guidance/micronutrient-actions";
import { loadMicronutrientPanel, suggestionPriority, type MicronutrientPanel } from "@/lib/guidance/micronutrient-panel";
import { loadGuidanceDashboard } from "@/lib/guidance/view";
import type { MicronutrientAssessment } from "@/lib/nutrients/assessment";

import { makeGuidanceDb, type GuidanceRows } from "./helpers/guidance-db";

const TZ = "Asia/Kolkata";
const KAMLESH = "contact-kamlesh";
const OTHER = "contact-other";
const CAREGIVER: GuidanceActor = { kind: "caregiver", profileId: "profile-manan" };
const STRANGER: GuidanceActor = { kind: "caregiver", profileId: "profile-stranger" };
const now = new Date("2026-11-09T06:00:00Z"); // Monday 9 November, 11:30 IST

function rows(extra: Partial<GuidanceRows> = {}): GuidanceRows {
  const guidance = (id: string, contact: string) => ({ id, adults_contact_id: contact, mode: "guidance", activated_at: "2026-10-26T04:00:00Z", activated_via: "caregiver" });
  const target = (id: string, contact: string) => ({
    id,
    adults_contact_id: contact,
    effective_from: "2026-10-26",
    effective_to: null,
    policy_version: "v1-mifflin-2026-10",
    calories_kcal: 1436,
    protein_g: 95,
    carbs_g: 170,
    fat_g: 48,
    fiber_g: 25,
    explanation: "x",
  });
  return {
    adults_contacts: [
      { id: KAMLESH, caregiver_id: "profile-manan", relationship_type: "family_caregiver", timezone: TZ, full_name: "Kamlesh Mehta", whatsapp_number: "+919800000000" },
      { id: OTHER, caregiver_id: "profile-stranger", relationship_type: "family_caregiver", timezone: TZ, full_name: "Someone Else" },
    ],
    gym_clients: [],
    nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "unreviewed" }],
    nutrition_guidance: [guidance("g1", KAMLESH), guidance("g2", OTHER)],
    nutrition_guidance_screening: [],
    nutrition_targets: [target("t1", KAMLESH), target("t2", OTHER)],
    meal_logs: [],
    ...extra,
  };
}

const prevFlag = process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
beforeEach(() => {
  mockFlags.guidance = true;
  mockRecompute.mockClear();
  process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = "true";
});
afterAll(() => {
  if (prevFlag === undefined) delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
  else process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = prevFlag;
});

describe("household answers", () => {
  it("are saved once per question, recompute recent estimates, and are refused for a stranger", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    expect(await answerHouseholdFact(db, { contactId: KAMLESH, actor: CAREGIVER, key: "milk_fortified", answer: "yes", now })).toEqual({ ok: true });
    expect(await answerHouseholdFact(db, { contactId: KAMLESH, actor: CAREGIVER, key: "milk_fortified", answer: "no", now })).toEqual({ ok: true });
    expect(data.nutrition_household_facts).toHaveLength(1);
    expect(data.nutrition_household_facts![0]).toMatchObject({ adults_contact_id: KAMLESH, fact_key: "milk_fortified", answer: "no", answered_via: "caregiver" });
    expect(mockRecompute).toHaveBeenCalledTimes(2);
    expect(mockRecompute).toHaveBeenLastCalledWith(db, { contactType: "adults", contactId: KAMLESH }, { sinceIso: "2026-10-05T06:00:00.000Z" });

    expect(await answerHouseholdFact(db, { contactId: KAMLESH, actor: STRANGER, key: "iodised_salt", answer: "yes", now })).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    expect(await answerHouseholdFact(db, { contactId: KAMLESH, actor: CAREGIVER, key: "milk_fortified", answer: "maybe" as never, now })).toMatchObject({
      ok: false,
      kind: "invalid",
    });
    expect(data.nutrition_household_facts).toHaveLength(1);
  });

  it("records a product's brand so later meals can match it, with no values guessed", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    expect(await confirmProductBrand(db, { contactId: KAMLESH, actor: CAREGIVER, itemName: "Marie biscuits", brand: "Britannia", now })).toEqual({ ok: true });
    expect(data.nutrition_confirmed_products![0]).toMatchObject({
      adults_contact_id: KAMLESH,
      name: "Marie biscuits",
      brand: "Britannia",
      nutrients: {},
      match_names: ["marie biscuits"],
      source: "user",
    });
    expect(mockRecompute).toHaveBeenCalledTimes(1);
  });
});

describe("supplements", () => {
  it("convert label units only by documented rules", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    const ok = await addSupplement(db, {
      contactId: KAMLESH,
      actor: CAREGIVER,
      supplement: { name: "Vitamin D3", brand: "HealthKart", nutrients: [{ key: "vitamin_d", amount: 1000, unit: "IU" }] },
      now,
    });
    expect(ok.ok).toBe(true);
    expect(data.supplement_schedules![0]).toMatchObject({ name: "Vitamin D3", nutrients_per_dose: { vitamin_d: 25 }, effective_from: "2026-11-09", slots: ["daily"] });

    const vitaminA = await addSupplement(db, {
      contactId: KAMLESH,
      actor: CAREGIVER,
      supplement: { name: "Vitamin A", nutrients: [{ key: "vitamin_a", amount: 5000, unit: "IU" }] },
      now,
    });
    expect(vitaminA).toMatchObject({ ok: false, kind: "invalid" });
    expect(await addSupplement(db, { contactId: KAMLESH, actor: CAREGIVER, supplement: { name: "Empty", nutrients: [] }, now })).toMatchObject({
      ok: false,
      kind: "invalid",
    });
    expect(data.supplement_schedules).toHaveLength(1);
  });

  it("count a dose once a day however often it's tapped, and only for this person's own supplement", async () => {
    const data = rows({
      supplement_schedules: [
        { id: "s1", adults_contact_id: KAMLESH, name: "Calcium", nutrients_per_dose: { calcium: 500 }, slots: ["daily"], effective_from: "2026-11-01", effective_to: null, source: "label" },
        { id: "s2", adults_contact_id: OTHER, name: "Iron", nutrients_per_dose: { iron: 60 }, slots: ["daily"], effective_from: "2026-11-01", effective_to: null, source: "label" },
      ],
    });
    const db = makeGuidanceDb(data);
    const taken = (scheduleId: string, t = true) => setSupplementTaken(db, { contactId: KAMLESH, actor: CAREGIVER, scheduleId, taken: t, now });
    expect(await taken("s1")).toEqual({ ok: true });
    expect(await taken("s1")).toEqual({ ok: true });
    expect(data.supplement_doses).toHaveLength(1);
    expect(data.supplement_doses![0]).toMatchObject({ schedule_id: "s1", taken_on: "2026-11-09", slot: "daily", confirmed_via: "caregiver" });
    expect(await taken("s1", false)).toEqual({ ok: true });
    expect(data.supplement_doses).toHaveLength(0);
    expect(await taken("s2")).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("stop from tomorrow, after which today's dose can't be confirmed again", async () => {
    const data = rows({
      supplement_schedules: [
        { id: "s1", adults_contact_id: KAMLESH, name: "Calcium", nutrients_per_dose: { calcium: 500 }, slots: ["daily"], effective_from: "2026-11-01", effective_to: null, source: "label" },
      ],
    });
    const db = makeGuidanceDb(data);
    expect(await stopSupplement(db, { contactId: KAMLESH, actor: CAREGIVER, scheduleId: "s1", now })).toEqual({ ok: true });
    expect(data.supplement_schedules![0].effective_to).toBe("2026-11-10");
    const tomorrow = new Date("2026-11-10T06:00:00Z");
    expect(await setSupplementTaken(db, { contactId: KAMLESH, actor: CAREGIVER, scheduleId: "s1", taken: true, now: tomorrow })).toMatchObject({
      ok: false,
      kind: "invalid",
    });
  });
});

describe("the vitamins and minerals panel", () => {
  it("loads nothing while the flag is off, and the dashboard says so with a null panel", async () => {
    process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = "false";
    const db = makeGuidanceDb(rows());
    const panel = await loadMicronutrientPanel(db, {
      contactType: "adults",
      contactId: KAMLESH,
      today: "2026-11-09",
      timezone: TZ,
      person: { sex: "male", ageYears: 64 },
      expectedMealsPerDay: 3,
      summaries: [],
    });
    expect(panel).toBeNull();
    const dashboard = await loadGuidanceDashboard(db, { contactId: KAMLESH, now });
    expect(dashboard?.micronutrients).toBeNull();
  });

  it("with the flag on, assesses both periods against the market's edition, and keeps unknown unknown", async () => {
    const data = rows({
      supplement_schedules: [
        { id: "s1", adults_contact_id: KAMLESH, name: "Calcium", nutrients_per_dose: { calcium: 500 }, slots: ["daily"], effective_from: "2026-11-01", effective_to: null, source: "label" },
      ],
      supplement_doses: [{ id: "d1", schedule_id: "s1", adults_contact_id: KAMLESH, taken_on: "2026-11-09", slot: "daily", quantity: 1, confirmed_via: "caregiver" }],
    });
    const dashboard = await loadGuidanceDashboard(makeGuidanceDb(data), { contactId: KAMLESH, now });
    const panel = dashboard?.micronutrients;
    if (!panel) throw new Error("expected a panel");
    // +91 number: India, so ICMR-NIN 2020.
    expect(panel.edition.id).toBe("icmr-nin-2020");
    expect(panel.periods.week).toMatchObject({ start: "2026-11-09", end: "2026-11-09" });
    expect(panel.periods.month.start).toBe("2026-11-01");
    // No meals logged: no averages, never a zero.
    for (const a of panel.periods.month.assessments) {
      expect(a.food.average).toBeNull();
      expect(a.status).not.toBe("within_range");
    }
    expect(panel.supplements).toEqual([
      { id: "s1", name: "Calcium", brand: null, perDose: [{ key: "calcium", label: "Calcium", amount: 500, unit: "mg" }], takenToday: true },
    ]);
    expect(panel.datasets.join(" ")).toMatch(/FoodData Central/);
  });
});

describe("the suggestion's priority", () => {
  const concern = (overrides: Partial<MicronutrientAssessment>): MicronutrientAssessment =>
    ({
      nutrient: "calcium",
      status: "no_reliable_source",
      food: { average: 300, isFloor: false },
      reference: { kind: "RDA", amount: 1000, unit: "mg", edition: "icmr-nin-2020", editionVersion: "v", lifeStage: "adult" },
      ...overrides,
    }) as MicronutrientAssessment;
  const panelWith = (concerns: MicronutrientAssessment[]) =>
    ({ periods: { week: { start: "", end: "", assessments: concerns, concerns }, month: { start: "", end: "", assessments: [], concerns: [] } } }) as unknown as MicronutrientPanel;

  it("follows an intake gap with a reference", () => {
    expect(suggestionPriority(panelWith([concern({})]))).toEqual({ nutrient: "calcium", reference: 1000 });
  });

  it("ignores clarifications, upper limits, floors and gaps with no reference", () => {
    expect(suggestionPriority(null)).toBeNull();
    expect(suggestionPriority(panelWith([concern({ status: "not_enough_information" })]))).toBeNull();
    expect(suggestionPriority(panelWith([concern({ status: "above_upper_limit" })]))).toBeNull();
    expect(suggestionPriority(panelWith([concern({ status: "below_reference", food: { average: 300, isFloor: true } })]))).toBeNull();
    expect(suggestionPriority(panelWith([concern({ reference: null })]))).toBeNull();
  });
});
