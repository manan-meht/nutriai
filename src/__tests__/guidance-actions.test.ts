import type { SupabaseClient } from "@supabase/supabase-js";

// The Guidance screens' server side: the three server actions, the view
// loader that decides what each viewer sees, and the parser that turns a
// request body into setup answers. activation.ts's own rules are tested in
// guidance-activation.test.ts; what is tested here is that the web layer
// hands them the right actor, from the request's own credential, and never
// widens what reaches the browser.

// Mutable so a test can switch the flag off: release.ts reads the binding
// at call time, so a getter is enough. Defined with defineProperty rather
// than a `get` in the literal, because the ES2017 target compiles object
// spread to Object.assign, which would call the getter once and freeze it.
const mockFlags = { guidance: true };
jest.mock("@/lib/billing/feature-flags", () =>
  Object.defineProperty(
    { ...jest.requireActual("@/lib/billing/feature-flags"), END_USER_DASHBOARD_ENABLED: true },
    "GUIDANCE_ENABLED",
    { get: () => mockFlags.guidance, enumerable: true }
  )
);

let mockUser: { id: string } | null = null;
let mockDb: SupabaseClient;
jest.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
  createServiceClient: () => mockDb,
}));

let mockSession: { contactId: string; contactType: "adults" | "gym" } | null = null;
jest.mock("@/lib/end-user/session", () => ({
  getEndUserSession: async () => mockSession,
}));

let mockConsented = true;
jest.mock("@/lib/end-user/dashboard-service", () => ({
  hasAcceptedConsent: async () => mockConsented,
}));

import {
  confirmGuidanceAction,
  proposeGuidanceAction,
  returnToTrackingAction,
} from "@/app/actions/guidance";
import { parseSetupAnswers } from "@/lib/guidance/setup-answers";
import { evaluateReleaseState } from "@/lib/guidance/release";
import { isGuidanceEntryVisible, loadGuidanceEntry, loadGuidanceView } from "@/lib/guidance/view";
import type { GuidanceState } from "@/lib/guidance/activation";

import { makeGuidanceDb, type GuidanceRows } from "./helpers/guidance-db";

const ASHA = "profile-asha";
const STRANGER = "profile-stranger";
const ASHA_SELF = "contact-asha-self";
const MOTHER = "contact-mother";

type Rows = GuidanceRows;
const makeDb = (rows: Rows) => makeGuidanceDb(rows);

function freshRows(over: Partial<Rows> = {}): Rows {
  return {
    adults_contacts: [
      // Asha tracking herself: account holder and tracked person are the same human.
      { id: ASHA_SELF, caregiver_id: ASHA, relationship_type: "self", timezone: "Asia/Kolkata", age: 38, height_cm: 178, weight_kg: 88, metabolic_equation_sex: "male", activity_level: "moderately_active", primary_nutrition_goal: "reduce_weight", nutrition_goals: null },
      // Her mother, on the same account. Asha pays and sees every meal.
      { id: MOTHER, caregiver_id: ASHA, relationship_type: "family_caregiver", timezone: "Asia/Kolkata", age: 74, height_cm: 152, weight_kg: 63, metabolic_equation_sex: "female", activity_level: "mostly_sitting", primary_nutrition_goal: "healthy_aging", nutrition_goals: null },
    ],
    // The real state at the time of writing: unreviewed.
    nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "unreviewed" }],
    nutrition_guidance: [],
    nutrition_guidance_screening: [],
    nutrition_targets: [],
    meal_logs: [],
    ...over,
  };
}

/** What the setup form sends, as the browser would send it. */
const formAnswers = {
  ageYears: 38,
  heightCm: 178,
  weightKg: 88,
  metabolicEquationSex: "male",
  activityLevel: "moderately_active",
  goals: ["reduce_weight"],
  isPregnantOrBreastfeeding: false,
  hasEatingDisorderHistory: false,
  conditionsOrMedications: null,
  mealsPerDay: 3,
  cookingAccess: "full_kitchen",
  allergies: [],
  avoidedFoods: ["beef"],
  cuisines: [],
};

function nothingWritten(rows: Rows) {
  expect(rows.nutrition_guidance).toHaveLength(0);
  expect(rows.nutrition_targets).toHaveLength(0);
  expect(rows.nutrition_guidance_screening).toHaveLength(0);
}

/** Runs `fn` as if this were the production app. */
async function inProduction<T>(fn: () => Promise<T>): Promise<T> {
  const prevEnv = process.env.NODE_ENV;
  const prevTistra = process.env.NEXT_PUBLIC_TISTRA_ENV;
  try {
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    delete process.env.NEXT_PUBLIC_TISTRA_ENV;
    return await fn();
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", { value: prevEnv, configurable: true });
    if (prevTistra !== undefined) process.env.NEXT_PUBLIC_TISTRA_ENV = prevTistra;
  }
}

let rows: Rows;
beforeEach(() => {
  mockFlags.guidance = true;
  mockUser = null;
  mockSession = null;
  mockConsented = true;
  rows = freshRows();
  mockDb = makeDb(rows);
});

describe("the setup flow, from a self account", () => {
  beforeEach(() => {
    mockUser = { id: ASHA };
  });

  it("proposes targets and labels them as preview, switching nothing on", async () => {
    const result = await proposeGuidanceAction("account", ASHA_SELF, formAnswers);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets.caloriesKcal).toBe(2381);
    // Not production, policy unreviewed: allowed, and it has to say so.
    expect(result.isPreviewOnly).toBe(true);
    expect(rows.nutrition_guidance).toHaveLength(0);
    expect(rows.nutrition_targets).toHaveLength(0);
    expect(rows.nutrition_guidance_screening).toHaveLength(1);
  });

  it("confirms with the consent channel of the account holder tracking herself", async () => {
    const result = await confirmGuidanceAction("account", ASHA_SELF, formAnswers);
    expect(result).toMatchObject({ ok: true, mode: "guidance", activatedVia: "self_account" });
    expect(rows.nutrition_guidance[0]).toMatchObject({
      adults_contact_id: ASHA_SELF,
      mode: "guidance",
      activated_via: "self_account",
      activated_by_profile_id: ASHA,
      avoided_foods: ["beef"],
    });
    expect(rows.nutrition_targets).toHaveLength(1);
    expect(rows.nutrition_targets[0]).toMatchObject({ calories_kcal: 2381, approved_via: "self_account" });
  });

  it("stores the recomputed targets, whatever else the request body carries", async () => {
    // The review step shows targets, and a request can be edited. The
    // action takes answers only, so smuggled numbers go nowhere.
    await confirmGuidanceAction("account", ASHA_SELF, {
      ...formAnswers,
      caloriesKcal: 900,
      targets: { caloriesKcal: 900, proteinG: 10 },
    });
    expect(rows.nutrition_targets[0]).toMatchObject({ calories_kcal: 2381, protein_g: 160 });
  });

  it("returns to tracking and keeps the target history", async () => {
    await confirmGuidanceAction("account", ASHA_SELF, formAnswers);
    const result = await returnToTrackingAction("account", ASHA_SELF);
    expect(result).toEqual({ ok: true, mode: "tracking" });
    expect(rows.nutrition_guidance[0]).toMatchObject({ mode: "tracking" });
    expect(rows.nutrition_targets).toHaveLength(1);
  });

  it("refuses when the feature flag is off, before screening anything", async () => {
    mockFlags.guidance = false;
    const result = await proposeGuidanceAction("account", ASHA_SELF, formAnswers);
    expect(result).toMatchObject({ ok: false, kind: "unavailable" });
    nothingWritten(rows);
  });

  it("refuses in production while the policy is unreviewed", async () => {
    const result = await inProduction(() => confirmGuidanceAction("account", ASHA_SELF, formAnswers));
    expect(result).toMatchObject({ ok: false, kind: "unavailable" });
    nothingWritten(rows);
  });
});

describe("a caregiver cannot switch Guidance on for someone else", () => {
  it("refuses the account holder who owns and pays for her mother's contact", async () => {
    mockUser = { id: ASHA };
    for (const action of [proposeGuidanceAction, confirmGuidanceAction]) {
      const result = await action("account", MOTHER, formAnswers);
      expect(result).toMatchObject({ ok: false, kind: "forbidden", reason: "not_the_tracked_person" });
      if (result.ok || result.kind !== "forbidden") continue;
      expect(result.message).toMatch(/Only the person being tracked/);
    }
    // Refused before screening, so not even the mother's answers — typed
    // in by the daughter — are on record.
    nothingWritten(rows);
  });

  it("tells a stranger only that they have no access", async () => {
    mockUser = { id: STRANGER };
    const result = await proposeGuidanceAction("account", MOTHER, formAnswers);
    expect(result).toMatchObject({ ok: false, kind: "forbidden", reason: "not_your_contact" });
    nothingWritten(rows);
  });

  it("refuses a signed-out request, or one naming a surface that does not exist", async () => {
    expect(await confirmGuidanceAction("account", ASHA_SELF, formAnswers)).toMatchObject({
      ok: false,
      kind: "forbidden",
      reason: "not_signed_in",
    });
    mockUser = { id: ASHA };
    expect(await confirmGuidanceAction("admin" as never, ASHA_SELF, formAnswers)).toMatchObject({
      reason: "not_signed_in",
    });
    nothingWritten(rows);
  });

  it("lets the owning caregiver switch her mother back to tracking", async () => {
    // Deliberately looser than activation — see authorizeGuidanceDeactivation.
    mockSession = { contactId: MOTHER, contactType: "adults" };
    await confirmGuidanceAction("my_progress", MOTHER, formAnswers);
    mockSession = null;
    mockUser = { id: ASHA };
    expect(await returnToTrackingAction("account", MOTHER)).toEqual({ ok: true, mode: "tracking" });
    expect(rows.nutrition_guidance[0]).toMatchObject({ mode: "tracking" });
  });

  it("does not let a stranger switch anyone back", async () => {
    mockUser = { id: STRANGER };
    expect(await returnToTrackingAction("account", MOTHER)).toMatchObject({ ok: false, reason: "not_your_contact" });
  });
});

describe("the setup flow, from the tracked person's own session", () => {
  it("activates for the contact the session belongs to", async () => {
    mockSession = { contactId: MOTHER, contactType: "adults" };
    const result = await confirmGuidanceAction("my_progress", MOTHER, formAnswers);
    expect(result).toMatchObject({ ok: true, activatedVia: "end_user_session" });
    expect(rows.nutrition_guidance[0]).toMatchObject({ adults_contact_id: MOTHER, activated_by_profile_id: null });
  });

  it("refuses a session that names a different contact", async () => {
    mockSession = { contactId: MOTHER, contactType: "adults" };
    const result = await confirmGuidanceAction("my_progress", ASHA_SELF, formAnswers);
    expect(result).toMatchObject({ ok: false, kind: "forbidden", reason: "wrong_contact" });
    nothingWritten(rows);
  });

  it("ignores an account sign-in on the session surface", async () => {
    // The surface picks the credential; it never stands in for one.
    mockUser = { id: ASHA };
    expect(await confirmGuidanceAction("my_progress", ASHA_SELF, formAnswers)).toMatchObject({ reason: "not_signed_in" });
    nothingWritten(rows);
  });

  it("refuses a session that has not accepted the dashboard consent, or is a gym client's", async () => {
    mockSession = { contactId: MOTHER, contactType: "adults" };
    mockConsented = false;
    expect(await proposeGuidanceAction("my_progress", MOTHER, formAnswers)).toMatchObject({ reason: "not_signed_in" });
    mockConsented = true;
    mockSession = { contactId: MOTHER, contactType: "gym" };
    expect(await proposeGuidanceAction("my_progress", MOTHER, formAnswers)).toMatchObject({ reason: "not_signed_in" });
    nothingWritten(rows);
  });
});

describe("reading the request body", () => {
  it("never reads a string as an answer to a screening question", async () => {
    // A "No" has to be a choice the person made, not the text "false".
    const parsed = parseSetupAnswers({ ...formAnswers, isPregnantOrBreastfeeding: "false", hasEatingDisorderHistory: "no" });
    expect(parsed.isPregnantOrBreastfeeding).toBeNull();
    expect(parsed.hasEatingDisorderHistory).toBeNull();

    mockUser = { id: ASHA };
    const result = await proposeGuidanceAction("account", ASHA_SELF, {
      ...formAnswers,
      isPregnantOrBreastfeeding: "false",
    });
    // Fail closed: unanswered, so no target — and a question, not a referral.
    expect(result).toMatchObject({ ok: false, kind: "declined", policy: { outcome: "needs_more_detail" } });
  });

  it("drops what it cannot use rather than defaulting it", () => {
    const parsed = parseSetupAnswers({
      ageYears: "38",
      heightCm: Number.NaN,
      metabolicEquationSex: "other",
      activityLevel: "couch",
      goals: ["reduce_weight", "get_shredded", 7, "reduce_weight"],
      mealsPerDay: 12,
      cookingAccess: "microwave",
      allergies: "peanuts",
      avoidedFoods: ["  beef  ", "", 3],
      timezone: "Pacific/Kiritimati",
    });
    expect(parsed).toMatchObject({
      ageYears: null,
      heightCm: null,
      metabolicEquationSex: null,
      activityLevel: null,
      goals: ["reduce_weight"],
      mealsPerDay: null,
      cookingAccess: null,
      allergies: [],
      avoidedFoods: ["beef"],
    });
    // A target's first day must be the day the totals screen looks it up
    // under, so the timezone is always the contact's, never the request's.
    expect(parsed.timezone).toBe("");
  });

  it("treats a garbage body as nothing answered", () => {
    for (const body of [null, "answers", 42, []]) {
      const parsed = parseSetupAnswers(body);
      expect(parsed.ageYears).toBeNull();
      expect(parsed.isPregnantOrBreastfeeding).toBeNull();
      expect(parsed.goals).toEqual([]);
    }
  });
});

describe("what each viewer's Guidance screen shows", () => {
  const ashaAccount = { kind: "caregiver" as const, profileId: ASHA };

  it("offers the tracked person the setup flow, with the preview label", async () => {
    const view = await loadGuidanceView(mockDb, { contactId: ASHA_SELF, actor: ashaAccount });
    expect(view).toMatchObject({
      kind: "setup",
      isPreviewOnly: true,
      policyVersion: "v1-mifflin-2026-10",
      hasEverActivated: false,
      prefill: { ageYears: 38, heightCm: 178, weightKg: 88, metabolicEquationSex: "male", goals: ["reduce_weight"] },
    });
  });

  it("never prefills a screening answer, even after one was recorded", async () => {
    mockUser = { id: ASHA };
    await proposeGuidanceAction("account", ASHA_SELF, { ...formAnswers, conditionsOrMedications: "metformin" });
    expect(rows.nutrition_guidance_screening).toHaveLength(1);

    const view = await loadGuidanceView(mockDb, { contactId: ASHA_SELF, actor: ashaAccount });
    expect(view.kind).toBe("setup");
    if (view.kind !== "setup") return;
    expect(view.prefill).not.toHaveProperty("isPregnantOrBreastfeeding");
    expect(view.prefill).not.toHaveProperty("hasEatingDisorderHistory");
    expect(view.prefill).not.toHaveProperty("conditionsOrMedications");
    expect(JSON.stringify(view)).not.toContain("metformin");
  });

  it("brings saved preferences back after a return to tracking, so re-activating does not erase them", async () => {
    mockUser = { id: ASHA };
    await confirmGuidanceAction("account", ASHA_SELF, { ...formAnswers, allergies: ["peanuts"], mealsPerDay: 4 });
    await returnToTrackingAction("account", ASHA_SELF);

    const view = await loadGuidanceView(mockDb, { contactId: ASHA_SELF, actor: ashaAccount });
    expect(view).toMatchObject({
      kind: "setup",
      hasEverActivated: true,
      prefill: { allergies: ["peanuts"], avoidedFoods: ["beef"], mealsPerDay: 4, cookingAccess: "full_kitchen" },
    });
  });

  it("gives the caregiver the refusal, and nothing about her mother's body", async () => {
    const view = await loadGuidanceView(mockDb, { contactId: MOTHER, actor: ashaAccount });
    expect(view).toEqual({
      kind: "caregiver",
      message: expect.stringMatching(/Only the person being tracked/),
      mode: "tracking",
      canReturnToTracking: false,
    });
  });

  it("lets the caregiver stop Guidance her mother turned on, still without targets", async () => {
    mockSession = { contactId: MOTHER, contactType: "adults" };
    await confirmGuidanceAction("my_progress", MOTHER, { ...formAnswers, conditionsOrMedications: "thyroid" });

    const view = await loadGuidanceView(mockDb, { contactId: MOTHER, actor: ashaAccount });
    expect(view).toMatchObject({ kind: "caregiver", mode: "guidance", canReturnToTracking: true });
    expect(view).not.toHaveProperty("today");
    expect(view).not.toHaveProperty("prefill");
    expect(JSON.stringify(view)).not.toMatch(/thyroid|kcal|2381/);
  });

  it("shows a stranger, or a session for someone else, nothing at all", async () => {
    expect(await loadGuidanceView(mockDb, { contactId: MOTHER, actor: { kind: "caregiver", profileId: STRANGER } })).toEqual({
      kind: "not_found",
    });
    expect(
      await loadGuidanceView(mockDb, { contactId: ASHA_SELF, actor: { kind: "end_user_session", contactId: MOTHER } })
    ).toEqual({ kind: "not_found" });
    expect(await loadGuidanceView(mockDb, { contactId: "contact-missing", actor: ashaAccount })).toEqual({ kind: "not_found" });
  });

  it("has no screen at all when the flag is off", async () => {
    mockFlags.guidance = false;
    expect(await loadGuidanceView(mockDb, { contactId: ASHA_SELF, actor: ashaAccount })).toEqual({ kind: "feature_off" });
  });

  it("does not offer setup in production while the policy is unreviewed", async () => {
    const view = await inProduction(() => loadGuidanceView(mockDb, { contactId: ASHA_SELF, actor: ashaAccount }));
    expect(view.kind).toBe("unavailable");
  });

  describe("once Guidance is on", () => {
    // 06:00 UTC on the 26th is 11:30 on the 26th in Kolkata.
    const now = new Date("2026-10-26T06:00:00Z");
    const meal = (id: string, loggedAt: string, over: Record<string, unknown> = {}) => ({
      id,
      adults_contact_id: ASHA_SELF,
      logged_at: loggedAt,
      total_calories_min: 400,
      total_calories_max: 600,
      total_protein_min: 20,
      total_protein_max: 30,
      total_carbs_min: 50,
      total_carbs_max: 70,
      total_fat_min: 10,
      total_fat_max: 20,
      total_fiber_min: 4,
      total_fiber_max: 6,
      ...over,
    });

    beforeEach(() => {
      rows.nutrition_guidance.push({
        adults_contact_id: ASHA_SELF,
        mode: "guidance",
        activated_at: "2026-10-20T04:00:00Z",
        activated_via: "self_account",
        activated_policy_version: "v1-mifflin-2026-10",
      });
      rows.nutrition_targets.push(
        // Superseded: must not be what today is judged against.
        { adults_contact_id: ASHA_SELF, effective_from: "2026-10-01", effective_to: "2026-10-20", policy_version: "v1-mifflin-2026-10", calories_kcal: 2600, protein_g: 170, carbs_g: 320, fat_g: 70, fiber_g: 38, explanation: "Older target." },
        { adults_contact_id: ASHA_SELF, effective_from: "2026-10-20", effective_to: null, policy_version: "v1-mifflin-2026-10", calories_kcal: 2381, protein_g: 160, carbs_g: 290, fat_g: 65, fiber_g: 38, explanation: "Mifflin-St Jeor estimate." }
      );
      rows.meal_logs.push(
        // 08:30 IST today.
        meal("breakfast", "2026-10-26T03:00:00Z"),
        // 05:45 IST today, no fiber estimate.
        meal("early", "2026-10-26T00:15:00Z", { total_fiber_min: null, total_fiber_max: null }),
        // 23:00 IST yesterday. Inside the query's 48-hour window, so it is
        // the local-day filter that has to leave it out.
        meal("late-dinner", "2026-10-25T17:30:00Z"),
        // Another person's meal.
        { ...meal("not-hers", "2026-10-26T03:00:00Z"), adults_contact_id: MOTHER }
      );
    });

    it("shows today's totals against the target in effect today", async () => {
      const view = await loadGuidanceView(mockDb, { contactId: ASHA_SELF, actor: ashaAccount, now });
      expect(view.kind).toBe("active");
      if (view.kind !== "active" || !view.today) throw new Error("expected today's progress");

      expect(view.isPreviewOnly).toBe(true);
      expect(view.today.date).toBe("2026-10-26");
      expect(view.today.target).toMatchObject({ effectiveFrom: "2026-10-20", explanation: "Mifflin-St Jeor estimate." });

      const { totals } = view.today;
      expect(totals.mealCount).toBe(2);
      expect(totals.calories).toMatchObject({ target: 2381, consumed: 1000, remaining: 1381, over: 0, isIncomplete: false });
      // The missing fiber estimate is a floor, not a zero averaged in.
      expect(totals.fiber).toMatchObject({ consumed: 5, isIncomplete: true, mealsMissingData: 1 });
    });

    it("hides the targets but keeps Return to Tracking when the gate closes", async () => {
      // A row written from a preview environment, read by production.
      const view = await inProduction(() => loadGuidanceView(mockDb, { contactId: ASHA_SELF, actor: ashaAccount, now }));
      expect(view.kind).toBe("paused");
      expect(JSON.stringify(view)).not.toMatch(/2381|kcal/);
    });
  });
});

describe("when the way in is shown", () => {
  const state = (mode: "tracking" | "guidance"): GuidanceState => ({
    mode,
    activatedAt: null,
    activatedVia: null,
    activatedPolicyVersion: null,
    deactivatedAt: null,
    hasEverActivated: mode === "guidance",
  });
  const release = (over: Partial<Parameters<typeof evaluateReleaseState>[0]>) =>
    evaluateReleaseState({ featureEnabled: true, policyStatus: "unreviewed", isProduction: false, ...over });

  it("hides it when the flag is off, whatever the mode", () => {
    expect(isGuidanceEntryVisible(release({ featureEnabled: false }), state("tracking"))).toBe(false);
    expect(isGuidanceEntryVisible(release({ featureEnabled: false }), state("guidance"))).toBe(false);
  });

  it("shows it when activation is offered", () => {
    expect(isGuidanceEntryVisible(release({}), state("tracking"))).toBe(true);
  });

  it("costs production nothing while the flag is off", async () => {
    // Every contact page and /my-progress load asks this.
    mockFlags.guidance = false;
    const from = jest.fn();
    expect(await loadGuidanceEntry({ from } as unknown as SupabaseClient, ASHA_SELF)).toEqual({
      visible: false,
      mode: "tracking",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("carries the mode for a dashboard to label the way in", async () => {
    rows.nutrition_guidance.push({ adults_contact_id: MOTHER, mode: "guidance", activated_at: "2026-10-20T04:00:00Z" });
    expect(await loadGuidanceEntry(mockDb, MOTHER)).toEqual({ visible: true, mode: "guidance" });
    expect(await loadGuidanceEntry(mockDb, ASHA_SELF)).toEqual({ visible: true, mode: "tracking" });
  });

  it("keeps it for someone already on Guidance even when activation is not offered, so they can stop", () => {
    expect(isGuidanceEntryVisible(release({ isProduction: true }), state("guidance"))).toBe(true);
    expect(isGuidanceEntryVisible(release({ isProduction: true }), state("tracking"))).toBe(false);
  });
});
