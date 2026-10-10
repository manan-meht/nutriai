import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActivityLevel, MetabolicEquationSex, NutritionGoal } from "@nutriai/health-scoring";

import {
  authorizeGuidanceActivation,
  authorizeGuidanceDeactivation,
  type ActivatedVia,
  type AuthorizationResult,
  type GuidanceActor,
  type GuidanceContactFacts,
} from "./authorization";
import { localDate } from "./daily-totals";
import { NUTRITION_POLICY_VERSION, proposeTargets, type PolicyResult, type ProposedTargets } from "./policy";
import { screenForGuidance } from "./screening";
import { loadReleaseState, type ReleaseBlocker, type ReleaseState } from "./release";

// Turning Guidance on, and off again.
//
// Activation is two server calls, because the brief requires a review step
// showing proposed targets before anything is switched on:
//
//   proposeActivation  → screens, computes, returns targets to show
//   confirmActivation  → screens and computes AGAIN, then writes
//
// confirmActivation deliberately does not accept the targets it is
// confirming. They arrive at the browser in the proposal and could come
// back altered; recomputing from the answers means the only way to change
// a target is to change an answer, and the only numbers ever stored are
// ones the policy produced on this server. The round trip costs nothing —
// the policy is pure arithmetic — and it removes a whole class of bug
// where a stale or edited proposal becomes somebody's calorie target.
//
// Every entry point re-checks permission and the release gate. None of
// them trusts that a previous call did.

export interface GuidanceSetupAnswers {
  // Measurements and goals — these produce the targets.
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  metabolicEquationSex: MetabolicEquationSex | null;
  activityLevel: ActivityLevel | null;
  goals: NutritionGoal[];

  // Suitability screening. Stored apart from everything else; never
  // returned to a caregiver — see authorization.canReadScreeningAnswers.
  isPregnantOrBreastfeeding: boolean | null;
  hasEatingDisorderHistory: boolean | null;
  conditionsOrMedications: string | null;

  // Preferences. These shape what gets suggested, never what the targets
  // are, so a missing answer here is not a reason to withhold a target.
  timezone: string;
  mealsPerDay: number | null;
  usualMealTimes: string[] | null;
  cookingAccess: "full_kitchen" | "limited" | "none" | "unknown" | null;
  cuisines: string[];
  allergies: string[];
  avoidedFoods: string[];
}

export type GuidanceMode = "tracking" | "guidance";

export interface GuidanceState {
  mode: GuidanceMode;
  activatedAt: string | null;
  activatedVia: ActivatedVia | null;
  activatedPolicyVersion: string | null;
  deactivatedAt: string | null;
  /** True when a row exists at all. Absence means Tracking and has never
   * been otherwise — distinct from a row that says 'tracking' because the
   * person switched back, which keeps its activation history. */
  hasEverActivated: boolean;
}

export type ActivationFailure =
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "forbidden"; reason: string; message: string }
  | { ok: false; kind: "unavailable"; blockers: ReleaseBlocker[]; message: string }
  /** Screening or policy declined. `policy` carries the reasons and the
   * copy to show, including whether the remedy is a question or a
   * referral. */
  | { ok: false; kind: "declined"; policy: Exclude<PolicyResult, { outcome: "targets" }> };

export type ProposalResult =
  | {
      ok: true;
      targets: ProposedTargets;
      explanation: string;
      notes: string[];
      policyVersion: string;
      /** The policy behind these numbers has not been clinically reviewed
       * and this environment is only allowed to show them because it is
       * not production. Any screen that renders them must say so. */
      isPreviewOnly: boolean;
    }
  | ActivationFailure;

export type ConfirmResult =
  | { ok: true; mode: "guidance"; targets: ProposedTargets; effectiveFrom: string; activatedVia: ActivatedVia }
  | ActivationFailure;

export type DeactivateResult = { ok: true; mode: "tracking" } | ActivationFailure;

const UNAVAILABLE_MESSAGE = "Nutrition Guidance isn't available yet. You can keep logging meals as usual.";

async function loadContactFacts(
  db: SupabaseClient,
  contactId: string
): Promise<(GuidanceContactFacts & { timezone: string }) | null> {
  const { data } = await db
    .from("adults_contacts")
    .select("id, caregiver_id, relationship_type, timezone")
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return null;
  return {
    contactId: data.id,
    caregiverId: data.caregiver_id ?? null,
    relationshipType: data.relationship_type === "self" ? "self" : "family_caregiver",
    timezone: data.timezone ?? "Asia/Kolkata",
  };
}

function forbidden(result: Extract<AuthorizationResult, { allowed: false }>): ActivationFailure {
  return { ok: false, kind: "forbidden", reason: result.reason, message: result.message };
}

function unavailable(release: ReleaseState): ActivationFailure {
  return { ok: false, kind: "unavailable", blockers: release.blockers, message: UNAVAILABLE_MESSAGE };
}

/** Records what was answered and what was decided, every time it is
 * decided — including when the answer is "supported", and including when
 * the person then abandons the review step. The row is the audit trail for
 * a decision about somebody's body, so it is not conditional on them going
 * on to accept the result. */
async function recordScreening(
  db: SupabaseClient,
  contactId: string,
  answers: GuidanceSetupAnswers
): Promise<ReturnType<typeof screenForGuidance>> {
  const screening = screenForGuidance({
    ageYears: answers.ageYears,
    heightCm: answers.heightCm,
    weightKg: answers.weightKg,
    metabolicEquationSex: answers.metabolicEquationSex,
    isPregnantOrBreastfeeding: answers.isPregnantOrBreastfeeding,
    hasEatingDisorderHistory: answers.hasEatingDisorderHistory,
    conditionsOrMedications: answers.conditionsOrMedications,
  });

  await db.from("nutrition_guidance_screening").upsert(
    {
      adults_contact_id: contactId,
      answers: {
        ageYears: answers.ageYears,
        heightCm: answers.heightCm,
        weightKg: answers.weightKg,
        metabolicEquationSex: answers.metabolicEquationSex,
        isPregnantOrBreastfeeding: answers.isPregnantOrBreastfeeding,
        hasEatingDisorderHistory: answers.hasEatingDisorderHistory,
        conditionsOrMedications: answers.conditionsOrMedications,
      },
      outcome: screening.outcome,
      outcome_reasons: screening.reasons,
      screened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "adults_contact_id" }
  );

  return screening;
}

function runPolicy(answers: GuidanceSetupAnswers): PolicyResult {
  return proposeTargets({
    ageYears: answers.ageYears,
    heightCm: answers.heightCm,
    weightKg: answers.weightKg,
    metabolicEquationSex: answers.metabolicEquationSex,
    activityLevel: answers.activityLevel,
    goals: answers.goals,
    isPregnantOrBreastfeeding: answers.isPregnantOrBreastfeeding,
    hasEatingDisorderHistory: answers.hasEatingDisorderHistory,
    conditionsOrMedications: answers.conditionsOrMedications,
  });
}

/** Current mode for a contact. Safe for any viewer with access to the
 * person's data: it carries no screening answers and no targets. */
export async function getGuidanceState(db: SupabaseClient, contactId: string): Promise<GuidanceState> {
  const { data } = await db
    .from("nutrition_guidance")
    .select("mode, activated_at, activated_via, activated_policy_version, deactivated_at")
    .eq("adults_contact_id", contactId)
    .maybeSingle();

  if (!data) {
    return {
      mode: "tracking",
      activatedAt: null,
      activatedVia: null,
      activatedPolicyVersion: null,
      deactivatedAt: null,
      hasEverActivated: false,
    };
  }

  return {
    mode: data.mode === "guidance" ? "guidance" : "tracking",
    activatedAt: data.activated_at ?? null,
    activatedVia: (data.activated_via as ActivatedVia | null) ?? null,
    activatedPolicyVersion: data.activated_policy_version ?? null,
    deactivatedAt: data.deactivated_at ?? null,
    hasEverActivated: data.activated_at != null,
  };
}

/**
 * What the setup flow already knows, so it asks only for what is missing.
 *
 * Everything here is shown for confirmation rather than assumed: a weight
 * recorded eight months ago is a reasonable prefill and a poor basis for a
 * calorie target, and the person is the only one who can say which it is.
 */
export async function buildSetupPrefill(
  db: SupabaseClient,
  contactId: string
): Promise<Partial<GuidanceSetupAnswers> | null> {
  const { data } = await db
    .from("adults_contacts")
    .select(
      "age, date_of_birth, height_cm, weight_kg, metabolic_equation_sex, activity_level, derived_activity_level, primary_nutrition_goal, nutrition_goals, timezone"
    )
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return null;

  const goals: NutritionGoal[] = Array.isArray(data.nutrition_goals)
    ? (data.nutrition_goals as NutritionGoal[])
    : data.primary_nutrition_goal
      ? [data.primary_nutrition_goal as NutritionGoal]
      : [];

  return {
    ageYears: data.age ?? null,
    heightCm: data.height_cm ?? null,
    weightKg: data.weight_kg ?? null,
    metabolicEquationSex: (data.metabolic_equation_sex as MetabolicEquationSex | null) ?? null,
    // derived_activity_level is the behavioural-questions answer and is
    // preferred over the legacy subjective dropdown (see
    // derive-activity-level.ts) when a contact has both.
    activityLevel: (data.activity_level as ActivityLevel | null) ?? null,
    goals,
    timezone: data.timezone ?? "Asia/Kolkata",
    // Screening answers are never prefilled. Pregnancy and eating-disorder
    // history are not facts to be carried forward silently from whatever
    // the account holder once typed into a contact form — they are
    // questions to be asked of the person, now.
  };
}

/**
 * Step one: screen, compute, and return what would be set — without
 * switching anything on.
 */
export async function proposeActivation(
  db: SupabaseClient,
  params: { contactId: string; actor: GuidanceActor; answers: GuidanceSetupAnswers }
): Promise<ProposalResult> {
  const facts = await loadContactFacts(db, params.contactId);
  if (!facts) return { ok: false, kind: "not_found" };

  const auth = authorizeGuidanceActivation(params.actor, facts);
  if (!auth.allowed) return forbidden(auth);

  const release = await loadReleaseState(db);
  if (!release.canActivate) return unavailable(release);

  await recordScreening(db, params.contactId, params.answers);

  const policy = runPolicy(params.answers);
  if (policy.outcome !== "targets") return { ok: false, kind: "declined", policy };

  return {
    ok: true,
    targets: policy.targets,
    explanation: policy.explanation,
    notes: policy.notes,
    policyVersion: policy.policyVersion,
    isPreviewOnly: release.isPreviewOnly,
  };
}

/**
 * Step two: switch Guidance on and store the first target version.
 *
 * Takes the answers again, not the proposal — see the module note.
 */
export async function confirmActivation(
  db: SupabaseClient,
  params: { contactId: string; actor: GuidanceActor; answers: GuidanceSetupAnswers; now?: Date }
): Promise<ConfirmResult> {
  const facts = await loadContactFacts(db, params.contactId);
  if (!facts) return { ok: false, kind: "not_found" };

  const auth = authorizeGuidanceActivation(params.actor, facts);
  if (!auth.allowed) return forbidden(auth);

  const release = await loadReleaseState(db);
  if (!release.canActivate) return unavailable(release);

  await recordScreening(db, params.contactId, params.answers);

  const policy = runPolicy(params.answers);
  if (policy.outcome !== "targets") return { ok: false, kind: "declined", policy };

  const now = params.now ?? new Date();
  const timezone = params.answers.timezone || facts.timezone;
  // A target applies to a DAY, and which day "now" belongs to is a
  // question about the person's timezone, not the server's.
  const effectiveFrom = localDate(now.toISOString(), timezone);
  const nowIso = now.toISOString();

  await db.from("nutrition_guidance").upsert(
    {
      adults_contact_id: params.contactId,
      mode: "guidance",
      activated_at: nowIso,
      deactivated_at: null,
      activated_via: auth.activatedVia,
      activated_by_profile_id: params.actor.kind === "caregiver" ? params.actor.profileId : null,
      activated_policy_version: NUTRITION_POLICY_VERSION,
      meals_per_day: params.answers.mealsPerDay,
      usual_meal_times: params.answers.usualMealTimes,
      cooking_access: params.answers.cookingAccess,
      cuisines: params.answers.cuisines,
      allergies: params.answers.allergies,
      avoided_foods: params.answers.avoidedFoods,
      updated_at: nowIso,
    },
    { onConflict: "adults_contact_id" }
  );

  // Close any open target before inserting the new one. The schema allows
  // exactly one row per person with effective_to null, so skipping this
  // does not produce two current targets — it produces a failed insert.
  await db
    .from("nutrition_targets")
    .update({ effective_to: effectiveFrom })
    .eq("adults_contact_id", params.contactId)
    .is("effective_to", null);

  await db.from("nutrition_targets").insert({
    adults_contact_id: params.contactId,
    policy_version: policy.policyVersion,
    effective_from: effectiveFrom,
    calories_kcal: policy.targets.caloriesKcal,
    protein_g: policy.targets.proteinG,
    carbs_g: policy.targets.carbsG,
    fat_g: policy.targets.fatG,
    fiber_g: policy.targets.fiberG,
    inputs: policy.inputs,
    explanation: policy.explanation,
    approved_at: nowIso,
    approved_via: auth.activatedVia,
  });

  return { ok: true, mode: "guidance", targets: policy.targets, effectiveFrom, activatedVia: auth.activatedVia };
}

/**
 * Back to Tracking.
 *
 * Writes two fields and deletes nothing. Meals, preferences, targets and
 * check-ins all stay exactly as they are, so switching back and forth
 * costs the person nothing and re-activating resumes where they left off.
 * The current target row keeps its open effective_to on purpose: it was
 * the applicable target for the days it covered, and a historical view of
 * those days must still find it.
 */
export async function returnToTracking(
  db: SupabaseClient,
  params: { contactId: string; actor: GuidanceActor; now?: Date }
): Promise<DeactivateResult> {
  const facts = await loadContactFacts(db, params.contactId);
  if (!facts) return { ok: false, kind: "not_found" };

  const auth = authorizeGuidanceDeactivation(params.actor, facts);
  if (!auth.allowed) return forbidden(auth);

  const nowIso = (params.now ?? new Date()).toISOString();
  await db
    .from("nutrition_guidance")
    .update({ mode: "tracking", deactivated_at: nowIso, updated_at: nowIso })
    .eq("adults_contact_id", params.contactId);

  return { ok: true, mode: "tracking" };
}
