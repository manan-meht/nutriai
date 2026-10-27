import { makeGuidanceDb, type FailingWrites, type GuidanceRows } from "./helpers/guidance-db";

// The flag is off by default in every environment, which is the whole
// point of it — so the service tests below would otherwise all stop at
// "unavailable" before reaching the behaviour they are about. The release
// gate's own matrix is tested directly against evaluateReleaseState.
jest.mock("@/lib/billing/feature-flags", () => ({
  ...jest.requireActual("@/lib/billing/feature-flags"),
  GUIDANCE_ENABLED: true,
}));

import {
  authorizeGuidanceActivation,
  authorizeGuidanceDeactivation,
  canReadScreeningAnswers,
  type GuidanceActor,
  type GuidanceContactFacts,
} from "@/lib/guidance/authorization";
import { evaluateReleaseState } from "@/lib/guidance/release";
import {
  buildSetupPrefill,
  confirmActivation,
  getGuidanceState,
  proposeActivation,
  returnToTracking,
  WRITE_FAILED_MESSAGE,
  type GuidanceSetupAnswers,
} from "@/lib/guidance/activation";

// The rule under test: the daughter who added her mother, pays for the
// plan and sees every meal may not set her mother a calorie target.
// Everything else here protects that rule or the release gate in front of
// it.

const MOTHER = "contact-mother";
const DAUGHTER_PROFILE = "profile-daughter";
const STRANGER_PROFILE = "profile-stranger";

const motherFacts: GuidanceContactFacts = {
  contactId: MOTHER,
  caregiverId: DAUGHTER_PROFILE,
  relationshipType: "family_caregiver",
};

const selfFacts: GuidanceContactFacts = {
  contactId: "contact-self",
  caregiverId: DAUGHTER_PROFILE,
  relationshipType: "self",
};

const daughter: GuidanceActor = { kind: "caregiver", profileId: DAUGHTER_PROFILE };
const stranger: GuidanceActor = { kind: "caregiver", profileId: STRANGER_PROFILE };
const motherHerself: GuidanceActor = { kind: "end_user_session", contactId: MOTHER };
const motherOnWhatsapp: GuidanceActor = { kind: "whatsapp", contactId: MOTHER };

describe("who may turn Guidance on", () => {
  it("refuses the caregiver who owns the contact and pays for the plan", () => {
    const result = authorizeGuidanceActivation(daughter, motherFacts);
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe("not_the_tracked_person");
    // The copy has to tell her what to do instead, or she will reasonably
    // conclude the feature is broken.
    expect(result.message).toMatch(/Only the person being tracked/);
    expect(result.message).toMatch(/their own progress page|WhatsApp/);
  });

  it("allows the tracked person from her own session", () => {
    expect(authorizeGuidanceActivation(motherHerself, motherFacts)).toEqual({
      allowed: true,
      activatedVia: "end_user_session",
    });
  });

  it("allows the tracked person from her own WhatsApp thread", () => {
    // For a contact who has only ever had a WhatsApp number, this is the
    // only channel she has — refusing it would make Guidance available
    // only to people who can also use the app.
    expect(authorizeGuidanceActivation(motherOnWhatsapp, motherFacts)).toEqual({
      allowed: true,
      activatedVia: "whatsapp",
    });
  });

  it("allows an account holder tracking themselves", () => {
    expect(authorizeGuidanceActivation(daughter, selfFacts)).toEqual({
      allowed: true,
      activatedVia: "self_account",
    });
  });

  it("tells a stranger they have no access, not whose consent is needed", () => {
    // Leaking "this person needs to consent" to someone with no
    // relationship to the contact would confirm the contact exists.
    const result = authorizeGuidanceActivation(stranger, motherFacts);
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe("not_your_contact");
    expect(result.message).not.toMatch(/person being tracked/);
  });

  it("refuses a session or thread belonging to a different contact", () => {
    for (const actor of [
      { kind: "end_user_session", contactId: "contact-someone-else" },
      { kind: "whatsapp", contactId: "contact-someone-else" },
    ] as GuidanceActor[]) {
      const result = authorizeGuidanceActivation(actor, motherFacts);
      expect(result.allowed).toBe(false);
      if (result.allowed) continue;
      expect(result.reason).toBe("wrong_contact");
    }
  });
});

describe("who may turn it off, and who may read the screening answers", () => {
  it("lets the owning caregiver switch it off although she could not switch it on", () => {
    // Deliberate asymmetry: stopping automated nutrition advice strictly
    // reduces what the system does, and a caregiver who becomes worried
    // should not have to get her mother to log in first. The mother can
    // turn it straight back on, so this is not a way to control her.
    expect(authorizeGuidanceDeactivation(daughter, motherFacts).allowed).toBe(true);
    expect(authorizeGuidanceActivation(daughter, motherFacts).allowed).toBe(false);
  });

  it("still refuses a stranger", () => {
    expect(authorizeGuidanceDeactivation(stranger, motherFacts).allowed).toBe(false);
  });

  it("never shows screening answers to a caregiver", () => {
    // Pregnancy, eating-disorder history, and conditions and medications
    // in the person's own words. Collected only to decide whether to
    // compute a target.
    expect(canReadScreeningAnswers(daughter, motherFacts)).toBe(false);
    expect(canReadScreeningAnswers(motherHerself, motherFacts)).toBe(true);
    // Reading your own is not the same question — an account holder
    // tracking themselves is the tracked person.
    expect(canReadScreeningAnswers(daughter, selfFacts)).toBe(true);
  });
});

describe("the release gate", () => {
  const evaluate = (over: Partial<Parameters<typeof evaluateReleaseState>[0]>) =>
    evaluateReleaseState({ featureEnabled: true, policyStatus: "unreviewed", isProduction: false, ...over });

  it("blocks an unreviewed policy in production", () => {
    // The state at the time of writing. Engineering-complete is not
    // clinically approved, and no deploy can make it so.
    const state = evaluate({ isProduction: true });
    expect(state.canActivate).toBe(false);
    expect(state.blockers).toContain("policy_unreviewed");
  });

  it("runs the full flow outside production, and labels it", () => {
    const state = evaluate({ isProduction: false });
    expect(state.canActivate).toBe(true);
    // Without this, an unreviewed policy's numbers look exactly like
    // approved ones on a staging screen someone is demoing.
    expect(state.isPreviewOnly).toBe(true);
  });

  it("does not treat the flag as a substitute for the review", () => {
    expect(evaluate({ featureEnabled: true, isProduction: true }).canActivate).toBe(false);
  });

  it("does not treat the review as a substitute for the flag", () => {
    const state = evaluate({ featureEnabled: false, policyStatus: "reviewed" });
    expect(state.canActivate).toBe(false);
    expect(state.blockers).toEqual(["feature_disabled"]);
  });

  it("activates for real only when both are satisfied", () => {
    const state = evaluate({ featureEnabled: true, policyStatus: "reviewed", isProduction: true });
    expect(state.canActivate).toBe(true);
    expect(state.isPreviewOnly).toBe(false);
    expect(state.blockers).toEqual([]);
  });

  it("blocks a missing or retired policy everywhere, including staging", () => {
    for (const policyStatus of [null, "retired"] as const) {
      const state = evaluate({ policyStatus, isProduction: false });
      expect(state.canActivate).toBe(false);
    }
  });
});

// ─── The service, against an in-memory stand-in for the tables ───────────

type Rows = GuidanceRows;
const makeDb = (rows: Rows, failing?: FailingWrites) => makeGuidanceDb(rows, failing);

const answers: GuidanceSetupAnswers = {
  ageYears: 38,
  heightCm: 178,
  weightKg: 88,
  metabolicEquationSex: "male",
  activityLevel: "moderately_active",
  goals: ["reduce_weight"],
  isPregnantOrBreastfeeding: false,
  hasEatingDisorderHistory: false,
  conditionsOrMedications: null,
  timezone: "Asia/Kolkata",
  mealsPerDay: 3,
  usualMealTimes: ["08:00", "13:00", "20:00"],
  cookingAccess: "full_kitchen",
  cuisines: ["north_indian"],
  allergies: [],
  avoidedFoods: ["beef"],
};

function freshRows(over: Partial<Rows> = {}): Rows {
  return {
    adults_contacts: [
      { id: MOTHER, caregiver_id: DAUGHTER_PROFILE, relationship_type: "family_caregiver", timezone: "Asia/Kolkata", age: 74, height_cm: 152, weight_kg: 63, metabolic_equation_sex: "female", activity_level: "mostly_sitting", primary_nutrition_goal: "healthy_aging", nutrition_goals: null },
    ],
    nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "reviewed" }],
    nutrition_guidance: [],
    nutrition_guidance_screening: [],
    nutrition_targets: [],
    meal_logs: [],
    ...over,
  };
}

describe("activation end to end", () => {
  it("defaults to tracking with no row at all", async () => {
    const state = await getGuidanceState(makeDb(freshRows()), MOTHER);
    expect(state).toEqual({
      mode: "tracking",
      activatedAt: null,
      activatedVia: null,
      activatedPolicyVersion: null,
      deactivatedAt: null,
      hasEverActivated: false,
    });
  });

  it("writes the mode, the consent channel and one current target", async () => {
    const rows = freshRows();
    const result = await confirmActivation(makeDb(rows), {
      contactId: MOTHER,
      actor: motherHerself,
      answers,
      now: new Date("2026-10-10T19:30:00Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activatedVia).toBe("end_user_session");
    // 19:30 UTC is already the 11th in Kolkata. A target applies to a day,
    // and which day that is belongs to her timezone, not the server's.
    expect(result.effectiveFrom).toBe("2026-10-11");

    expect(rows.nutrition_guidance).toHaveLength(1);
    expect(rows.nutrition_guidance[0]).toMatchObject({
      mode: "guidance",
      activated_via: "end_user_session",
      activated_policy_version: "v1-mifflin-2026-10",
      activated_by_profile_id: null,
      avoided_foods: ["beef"],
    });

    expect(rows.nutrition_targets).toHaveLength(1);
    expect(rows.nutrition_targets[0]).toMatchObject({
      calories_kcal: 2381,
      protein_g: 160,
      carbs_g: 290,
      fat_g: 65,
      fiber_g: 38,
      effective_from: "2026-10-11",
      approved_via: "end_user_session",
    });
    // Left open: this is the current target until something supersedes it.
    expect(rows.nutrition_targets[0].effective_to ?? null).toBeNull();
    expect(rows.nutrition_targets[0].explanation).toContain("Mifflin-St Jeor");
  });

  it("refuses the caregiver at the service boundary, not only in the UI", async () => {
    // The authorization function being right is worth nothing if a route
    // forgets to call it.
    const rows = freshRows();
    const result = await confirmActivation(makeDb(rows), { contactId: MOTHER, actor: daughter, answers });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("forbidden");
    // And nothing was written on the way to refusing.
    expect(rows.nutrition_guidance).toHaveLength(0);
    expect(rows.nutrition_targets).toHaveLength(0);
    expect(rows.nutrition_guidance_screening).toHaveLength(0);
  });

  it("recomputes the targets instead of trusting the review step", async () => {
    // confirmActivation takes answers, never targets. If a tampered or
    // stale proposal could set the stored numbers, the review step would
    // be the weakest point in the whole feature.
    const rows = freshRows();
    await confirmActivation(makeDb(rows), {
      contactId: MOTHER,
      actor: motherHerself,
      // Same answers, plus fields that look like an attempt to dictate
      // the outcome. The signature does not admit them.
      answers: { ...answers, caloriesKcal: 900, targets: { caloriesKcal: 900 } } as GuidanceSetupAnswers,
    });
    expect(rows.nutrition_targets[0]).toMatchObject({ calories_kcal: 2381 });
  });

  it("records the screening decision even when the person never accepts", async () => {
    const rows = freshRows();
    await proposeActivation(makeDb(rows), { contactId: MOTHER, actor: motherHerself, answers });
    // Proposal only — nothing activated.
    expect(rows.nutrition_guidance).toHaveLength(0);
    expect(rows.nutrition_targets).toHaveLength(0);
    // But the decision about her body is on the record.
    expect(rows.nutrition_guidance_screening).toHaveLength(1);
    expect(rows.nutrition_guidance_screening[0]).toMatchObject({
      adults_contact_id: MOTHER,
      outcome: "supported",
      outcome_reasons: [],
    });
  });

  it("declines with the policy's own reasons rather than a generic error", async () => {
    const rows = freshRows();
    const result = await proposeActivation(makeDb(rows), {
      contactId: MOTHER,
      actor: motherHerself,
      answers: { ...answers, ageYears: 15 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("declined");
    if (result.kind !== "declined") return;
    expect(result.policy.outcome).toBe("needs_professional_review");
    expect(result.policy.reasons).toContain("under_18");
    // Fail-closed: the screening row says so too.
    expect(rows.nutrition_guidance_screening[0]).toMatchObject({ outcome: "needs_professional_review" });
  });

  it("will not activate while the policy row is unreviewed in production", async () => {
    const rows = freshRows({ nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "unreviewed" }] });
    const prevEnv = process.env.NODE_ENV;
    const prevTistra = process.env.NEXT_PUBLIC_TISTRA_ENV;
    try {
      Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
      delete process.env.NEXT_PUBLIC_TISTRA_ENV;
      const result = await confirmActivation(makeDb(rows), { contactId: MOTHER, actor: motherHerself, answers });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.kind).toBe("unavailable");
      if (result.kind !== "unavailable") return;
      // GUIDANCE_ENABLED is off by default too, so both blockers appear —
      // which is the point: neither alone would be enough.
      expect(result.blockers).toContain("policy_unreviewed");
      expect(rows.nutrition_targets).toHaveLength(0);
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", { value: prevEnv, configurable: true });
      if (prevTistra !== undefined) process.env.NEXT_PUBLIC_TISTRA_ENV = prevTistra;
    }
  });
});

describe("switching back to tracking", () => {
  it("keeps every meal, preference, target and the activation history", async () => {
    const rows = freshRows();
    await confirmActivation(makeDb(rows), { contactId: MOTHER, actor: motherHerself, answers });
    const targetsBefore = JSON.parse(JSON.stringify(rows.nutrition_targets));

    const result = await returnToTracking(makeDb(rows), { contactId: MOTHER, actor: motherHerself });
    expect(result).toEqual({ ok: true, mode: "tracking" });

    expect(rows.nutrition_guidance[0]).toMatchObject({ mode: "tracking" });
    expect(rows.nutrition_guidance[0].deactivated_at).toBeTruthy();
    // Preferences survive, so re-activating does not re-ask everything.
    expect(rows.nutrition_guidance[0]).toMatchObject({ avoided_foods: ["beef"], meals_per_day: 3 });
    // The target keeps its open effective_to: it was the applicable target
    // for the days it covered, and a historical view must still find it.
    expect(rows.nutrition_targets).toEqual(targetsBefore);

    const state = await getGuidanceState(makeDb(rows), MOTHER);
    expect(state.mode).toBe("tracking");
    expect(state.hasEverActivated).toBe(true);
  });

  it("closes the old target rather than adding a second current one when re-activated", async () => {
    const rows = freshRows();
    await confirmActivation(makeDb(rows), {
      contactId: MOTHER,
      actor: motherHerself,
      answers,
      now: new Date("2026-10-10T06:00:00Z"),
    });
    await confirmActivation(makeDb(rows), {
      contactId: MOTHER,
      actor: motherHerself,
      answers: { ...answers, weightKg: 84 },
      now: new Date("2026-11-01T06:00:00Z"),
    });

    expect(rows.nutrition_targets).toHaveLength(2);
    // The schema permits exactly one row with a null effective_to per
    // person, so failing to close the old one is not two current targets —
    // it is a failed insert at activation time, for a real person.
    expect(rows.nutrition_targets[0]).toMatchObject({ effective_from: "2026-10-10", effective_to: "2026-11-01" });
    expect(rows.nutrition_targets[1].effective_to).toBeUndefined();
    expect(rows.nutrition_targets.filter((t) => t.effective_to == null)).toHaveLength(1);
  });
});

describe("the setup flow asks only for what is missing", () => {
  it("prefills measurements and goals from the contact", async () => {
    const prefill = await buildSetupPrefill(makeDb(freshRows()), MOTHER);
    expect(prefill).toMatchObject({
      ageYears: 74,
      heightCm: 152,
      weightKg: 63,
      metabolicEquationSex: "female",
      activityLevel: "mostly_sitting",
      goals: ["healthy_aging"],
      timezone: "Asia/Kolkata",
    });
  });

  it("never prefills a screening answer", async () => {
    // Pregnancy and eating-disorder history are not facts to carry
    // forward from whatever an account holder once typed into a contact
    // form. They are questions to be asked of the person, now — and a
    // prefilled "No" that she merely failed to notice is not an answer.
    const prefill = await buildSetupPrefill(makeDb(freshRows()), MOTHER);
    expect(prefill).not.toHaveProperty("isPregnantOrBreastfeeding");
    expect(prefill).not.toHaveProperty("hasEatingDisorderHistory");
    expect(prefill).not.toHaveProperty("conditionsOrMedications");
  });
});

describe("a write the database refuses is reported, not swallowed", () => {
  // Every write here used to ignore its { error }, so confirmActivation
  // could answer ok with nothing saved. The fake now enforces 0068's
  // constraints and can fail any write on demand.
  const day1 = new Date("2026-10-10T06:00:00Z");
  const day2 = new Date("2026-11-01T06:00:00Z");
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => logged.mockRestore());

  const writeFailed = { ok: false, kind: "write_failed", message: WRITE_FAILED_MESSAGE };

  it("switches back on the same day it was switched off", async () => {
    // The path anyone trying the feature takes first. Closing today's
    // target at today would give it an empty range, which the schema
    // refuses; the insert then hit the one-current-target index. Both
    // failures were ignored and the confirm said ok over yesterday's numbers.
    const rows = freshRows();
    await confirmActivation(makeDb(rows), { contactId: MOTHER, actor: motherHerself, answers, now: day1 });
    await returnToTracking(makeDb(rows), { contactId: MOTHER, actor: motherHerself, now: day1 });

    const result = await confirmActivation(makeDb(rows), {
      contactId: MOTHER,
      actor: motherHerself,
      answers: { ...answers, weightKg: 84 },
      now: day1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets.caloriesKcal).not.toBe(2381);
    // A target superseded on its first day governed no day, so it is
    // replaced rather than kept as an empty range.
    expect(rows.nutrition_targets).toHaveLength(1);
    expect(rows.nutrition_targets[0]).toMatchObject({
      effective_from: "2026-10-10",
      calories_kcal: result.targets.caloriesKcal,
    });
    expect(rows.nutrition_targets[0].effective_to ?? null).toBeNull();
    expect(rows.nutrition_guidance[0]).toMatchObject({ mode: "guidance" });
  });

  it("leaves the mode alone when the target cannot be written", async () => {
    const rows = freshRows();
    await confirmActivation(makeDb(rows), { contactId: MOTHER, actor: motherHerself, answers, now: day1 });
    await returnToTracking(makeDb(rows), { contactId: MOTHER, actor: motherHerself, now: day1 });

    const result = await confirmActivation(makeDb(rows, ["nutrition_targets.insert"]), {
      contactId: MOTHER,
      actor: motherHerself,
      answers: { ...answers, weightKg: 84 },
      now: day2,
    });

    expect(result).toEqual(writeFailed);
    // Still in Tracking: the mode is written last, so it never switched on
    // over numbers that were not saved.
    expect(rows.nutrition_guidance[0]).toMatchObject({ mode: "tracking" });
    // And the target closed on the way to the failed insert is open again.
    expect(rows.nutrition_targets).toHaveLength(1);
    expect(rows.nutrition_targets[0]).toMatchObject({ calories_kcal: 2381, effective_to: null });
  });

  it("does not insert a second current target when the old one cannot be closed", async () => {
    const rows = freshRows();
    await confirmActivation(makeDb(rows), { contactId: MOTHER, actor: motherHerself, answers, now: day1 });

    const result = await confirmActivation(makeDb(rows, ["nutrition_targets.update"]), {
      contactId: MOTHER,
      actor: motherHerself,
      answers: { ...answers, weightKg: 84 },
      now: day2,
    });

    expect(result).toEqual(writeFailed);
    expect(rows.nutrition_targets).toHaveLength(1);
    expect(rows.nutrition_targets[0]).toMatchObject({ calories_kcal: 2381 });
  });

  it("reports a failed mode write, and a retry completes it", async () => {
    const rows = freshRows();
    const failing = ["nutrition_guidance.upsert"];
    const first = await confirmActivation(makeDb(rows, failing), { contactId: MOTHER, actor: motherHerself, answers, now: day1 });
    expect(first).toEqual(writeFailed);
    // The target landed and the mode did not: a current target in
    // Tracking, the same harmless state Return to Tracking leaves.
    expect(rows.nutrition_guidance).toHaveLength(0);
    expect(rows.nutrition_targets).toHaveLength(1);

    failing.length = 0;
    const retry = await confirmActivation(makeDb(rows), { contactId: MOTHER, actor: motherHerself, answers, now: day1 });
    expect(retry.ok).toBe(true);
    expect(rows.nutrition_guidance[0]).toMatchObject({ mode: "guidance" });
    expect(rows.nutrition_targets).toHaveLength(1);
  });

  it("reports a preference the table rejects instead of answering ok", async () => {
    // meals_per_day is checked between 1 and 8. The web form's parser
    // clamps it, but not every caller goes through that parser.
    const rows = freshRows();
    const result = await confirmActivation(makeDb(rows), {
      contactId: MOTHER,
      actor: motherHerself,
      answers: { ...answers, mealsPerDay: 12 },
      now: day1,
    });
    expect(result).toEqual(writeFailed);
    expect(rows.nutrition_guidance).toHaveLength(0);
  });

  it("will not show or set targets when the screening decision cannot be recorded", async () => {
    // The screening row is the audit trail for a decision about her body.
    // A target nobody can later account for is worse than a retry.
    const rows = freshRows();
    const db = makeDb(rows, ["nutrition_guidance_screening.upsert"]);
    expect(await proposeActivation(db, { contactId: MOTHER, actor: motherHerself, answers })).toEqual(writeFailed);
    expect(await confirmActivation(db, { contactId: MOTHER, actor: motherHerself, answers })).toEqual(writeFailed);
    expect(rows.nutrition_guidance).toHaveLength(0);
    expect(rows.nutrition_targets).toHaveLength(0);
  });

  it("does not say Guidance stopped when it did not", async () => {
    const rows = freshRows();
    await confirmActivation(makeDb(rows), { contactId: MOTHER, actor: motherHerself, answers, now: day1 });
    const result = await returnToTracking(makeDb(rows, ["nutrition_guidance.update"]), {
      contactId: MOTHER,
      actor: daughter,
    });
    expect(result).toEqual(writeFailed);
    expect(rows.nutrition_guidance[0]).toMatchObject({ mode: "guidance" });
  });

  it("logs which step failed, and none of her answers", async () => {
    const rows = freshRows();
    await confirmActivation(makeDb(rows, ["nutrition_targets.insert"]), {
      contactId: MOTHER,
      actor: motherHerself,
      answers: { ...answers, conditionsOrMedications: "metformin", isPregnantOrBreastfeeding: false },
    });
    expect(logged).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(logged.mock.calls[0]);
    expect(line).toContain("writing the target");
    expect(line).not.toMatch(/metformin|Pregnant|EatingDisorder/i);
  });
});
