import type { SupabaseClient } from "@supabase/supabase-js";

import { GUIDANCE_ENABLED } from "@/lib/billing/feature-flags";

import {
  buildSetupPrefill,
  getGuidanceState,
  guidanceSubjectColumn,
  loadContactFacts,
  UNAVAILABLE_MESSAGE,
  type GuidanceMode,
  type GuidanceSetupAnswers,
  type GuidanceState,
} from "./activation";
import {
  authorizeGuidanceActivation,
  type ActivatedVia,
  type GuidanceActor,
  type GuidanceContactType,
} from "./authorization";
import { computeDailyTotals, localDate, targetForDate, type ConfirmedMealRow, type DailyTotals } from "./daily-totals";
import { loadReleaseState, type ReleaseState } from "./release";

// What the Guidance screen shows, decided on the server.
//
// The screen is one route per surface, and what it renders depends on who
// is looking and what state the person is in. Deciding that here, rather
// than in the component, keeps every branch that could expose a target or
// a screening answer on the server and testable without a browser. The
// component only ever receives the branch it is allowed to see.
//
// Anyone authorization.ts lets turn Guidance on gets the same flow: the
// tracked person, or the family caregiver or coach who tracks them. What
// differs is whose targets they are, which `person` carries so the screen
// can ask "Is Asha pregnant?" rather than "Are you?". Screening answers
// are never prefilled, for anyone, even when a previous screening row
// exists: they are asked again, now.

/** What the setup form may start from. Spelled out rather than passed
 * through, so a screening answer cannot reach the browser even if
 * buildSetupPrefill one day starts returning one. */
export type SetupPrefill = Pick<
  Partial<GuidanceSetupAnswers>,
  | "ageYears"
  | "heightCm"
  | "weightKg"
  | "metabolicEquationSex"
  | "activityLevel"
  | "goals"
  | "mealsPerDay"
  | "cookingAccess"
  | "cuisines"
  | "allergies"
  | "avoidedFoods"
>;

export interface TodayProgress {
  /** Local date in the tracked person's timezone, YYYY-MM-DD. */
  date: string;
  totals: DailyTotals;
  /** The target row that applies on `date`, not necessarily the latest. */
  target: { effectiveFrom: string; policyVersion: string; explanation: string };
}

/** Whose targets these are, as seen by the viewer: their own, or someone
 * they track and are acting for. */
export type GuidancePerson = { isSelf: true } | { isSelf: false; name: string };

export type GuidanceView =
  | { kind: "not_found" }
  /** The engineering flag is off here. The route should not exist. */
  | { kind: "feature_off" }
  /** Tracking, and activation is not offered in this environment. */
  | { kind: "unavailable"; message: string }
  | {
      kind: "setup";
      person: GuidancePerson;
      prefill: SetupPrefill;
      isPreviewOnly: boolean;
      policyVersion: string;
      hasEverActivated: boolean;
    }
  | {
      kind: "active";
      person: GuidancePerson;
      /** Who turned it on, so the tracked person is told when it was set up
       * for them by a caregiver or coach. */
      activatedVia: ActivatedVia | null;
      isPreviewOnly: boolean;
      policyVersion: string;
      activatedAt: string | null;
      today: TodayProgress | null;
    }
  /** Guidance is on, but the release gate no longer allows it here — say
   * a policy retired, or a row written from a preview environment against
   * a database that production also reads. Targets stay hidden; stopping
   * stays available. */
  | { kind: "paused"; message: string };

const PAUSED_MESSAGE =
  "Nutrition Guidance isn't available right now, so the targets are hidden. Meals are still logged as usual.";

/** Whether to show the way in at all. Hidden when the flag is off, and when
 * activation is not offered — unless Guidance is already on, because the
 * way in is also the only way to Return to Tracking. */
export function isGuidanceEntryVisible(release: ReleaseState, state: GuidanceState): boolean {
  if (release.blockers.includes("feature_disabled")) return false;
  return release.canActivate || state.mode === "guidance";
}

/** For a dashboard that has already checked the viewer may see this
 * contact. Carries nothing but the mode. */
export async function loadGuidanceEntry(
  db: SupabaseClient,
  contactId: string,
  contactType: GuidanceContactType = "adults"
): Promise<{ visible: boolean; mode: GuidanceMode }> {
  // Every contact page and /my-progress load calls this, and the flag is
  // off in production: answer without two queries whose result is known.
  if (!GUIDANCE_ENABLED) return { visible: false, mode: "tracking" };
  const [release, state] = await Promise.all([
    loadReleaseState(db),
    getGuidanceState(db, contactId, contactType),
  ]);
  return { visible: isGuidanceEntryVisible(release, state), mode: state.mode };
}

// One literal, not a concatenation: supabase-js parses the select string at
// the type level, and a concatenated `string` defeats it.
const MEAL_COLUMNS =
  "id, logged_at, total_calories_min, total_calories_max, total_protein_min, total_protein_max, total_carbs_min, total_carbs_max, total_fat_min, total_fat_max, total_fiber_min, total_fiber_max";

/** A meal_logs row as daily-totals wants it. Missing values stay null:
 * coercing them to zero is the under-reporting bug daily-totals.ts exists
 * to avoid, and AdultsMealLog's `?? 0` mapping is the wrong one to reuse. */
function toConfirmedMeal(m: Record<string, unknown>): ConfirmedMealRow {
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    id: String(m.id),
    loggedAt: String(m.logged_at),
    totalCaloriesMin: n(m.total_calories_min),
    totalCaloriesMax: n(m.total_calories_max),
    totalProteinMin: n(m.total_protein_min),
    totalProteinMax: n(m.total_protein_max),
    totalCarbsMin: n(m.total_carbs_min),
    totalCarbsMax: n(m.total_carbs_max),
    totalFatMin: n(m.total_fat_min),
    totalFatMax: n(m.total_fat_max),
    totalFiberMin: n(m.total_fiber_min),
    totalFiberMax: n(m.total_fiber_max),
  };
}

/** Today's totals against the target that applies today, or null when no
 * target covers today. */
export async function loadTodayProgress(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; timezone: string; now?: Date }
): Promise<TodayProgress | null> {
  const contactType = params.contactType ?? "adults";
  // meal_logs predates Guidance and names a coach client client_id, not
  // gym_client_id as the Guidance tables do.
  const mealColumn = contactType === "gym" ? "client_id" : "adults_contact_id";
  const now = params.now ?? new Date();
  const date = localDate(now.toISOString(), params.timezone);
  // 48 hours back covers "today" in any timezone; computeDailyTotals then
  // keeps only the meals that fall on `date` locally.
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const [targetsRes, mealsRes] = await Promise.all([
    db
      .from("nutrition_targets")
      .select("effective_from, effective_to, policy_version, calories_kcal, protein_g, carbs_g, fat_g, fiber_g, explanation")
      .eq(guidanceSubjectColumn(contactType), params.contactId),
    db.from("meal_logs").select(MEAL_COLUMNS).eq(mealColumn, params.contactId).gte("logged_at", since),
  ]);

  const targets = ((targetsRes.data ?? []) as Record<string, unknown>[]).map((t) => ({
    effectiveFrom: String(t.effective_from),
    effectiveTo: (t.effective_to as string | null) ?? null,
    policyVersion: String(t.policy_version),
    explanation: String(t.explanation ?? ""),
    caloriesKcal: Number(t.calories_kcal),
    proteinG: Number(t.protein_g),
    carbsG: Number(t.carbs_g),
    fatG: Number(t.fat_g),
    fiberG: Number(t.fiber_g),
  }));
  const target = targetForDate(targets, date);
  if (!target) return null;

  const meals = ((mealsRes.data ?? []) as Record<string, unknown>[]).map(toConfirmedMeal);

  return {
    date,
    totals: computeDailyTotals({ date, timezone: params.timezone, meals, target }),
    target: { effectiveFrom: target.effectiveFrom, policyVersion: target.policyVersion, explanation: target.explanation },
  };
}

async function loadPrefill(
  db: SupabaseClient,
  contactId: string,
  contactType: GuidanceContactType
): Promise<SetupPrefill> {
  const [measured, saved] = await Promise.all([
    buildSetupPrefill(db, contactId, contactType),
    // Preferences from an earlier activation. Returning to Tracking keeps
    // them so that switching back on does not re-ask everything — and
    // confirmActivation overwrites them with whatever the form sends, so a
    // form that started blank would erase them.
    db
      .from("nutrition_guidance")
      .select("meals_per_day, cooking_access, cuisines, allergies, avoided_foods")
      .eq(guidanceSubjectColumn(contactType), contactId)
      .maybeSingle(),
  ]);

  const prefs = (saved.data ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  return {
    ageYears: measured?.ageYears ?? null,
    heightCm: measured?.heightCm ?? null,
    weightKg: measured?.weightKg ?? null,
    metabolicEquationSex: measured?.metabolicEquationSex ?? null,
    activityLevel: measured?.activityLevel ?? null,
    goals: measured?.goals ?? [],
    mealsPerDay: typeof prefs.meals_per_day === "number" ? prefs.meals_per_day : null,
    cookingAccess: (prefs.cooking_access as GuidanceSetupAnswers["cookingAccess"]) ?? null,
    cuisines: list(prefs.cuisines),
    allergies: list(prefs.allergies),
    avoidedFoods: list(prefs.avoided_foods),
  };
}

export async function loadGuidanceView(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; actor: GuidanceActor; now?: Date }
): Promise<GuidanceView> {
  const contactType = params.contactType ?? "adults";
  const facts = await loadContactFacts(db, params.contactId, contactType);
  if (!facts) return { kind: "not_found" };

  // The same question confirmActivation asks. A stranger, or a session for
  // someone else, learns nothing — not even that the contact exists.
  const activation = authorizeGuidanceActivation(params.actor, facts);
  if (!activation.allowed) return { kind: "not_found" };

  const release = await loadReleaseState(db);
  if (release.blockers.includes("feature_disabled")) return { kind: "feature_off" };

  const state = await getGuidanceState(db, params.contactId, contactType);
  const onBehalf = activation.activatedVia === "caregiver" || activation.activatedVia === "coach";
  const person: GuidancePerson = onBehalf ? { isSelf: false, name: facts.fullName ?? "this person" } : { isSelf: true };

  if (state.mode === "guidance") {
    if (!release.canActivate) return { kind: "paused", message: PAUSED_MESSAGE };
    return {
      kind: "active",
      person,
      activatedVia: state.activatedVia,
      isPreviewOnly: release.isPreviewOnly,
      policyVersion: release.policyVersion,
      activatedAt: state.activatedAt,
      today: await loadTodayProgress(db, {
        contactId: params.contactId,
        contactType,
        timezone: facts.timezone,
        now: params.now,
      }),
    };
  }

  if (!release.canActivate) return { kind: "unavailable", message: UNAVAILABLE_MESSAGE };

  return {
    kind: "setup",
    person,
    prefill: await loadPrefill(db, params.contactId, contactType),
    isPreviewOnly: release.isPreviewOnly,
    policyVersion: release.policyVersion,
    hasEverActivated: state.hasEverActivated,
  };
}
