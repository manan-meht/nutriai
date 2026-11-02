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
import {
  computeDailyTotals,
  localDate,
  targetForDate,
  type ConfirmedMealRow,
  type DailyTarget,
  type DailyTotals,
} from "./daily-totals";
import { guidanceHistory, mealImpacts, type GuidanceDay, type MealImpact } from "./meal-impact";
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
  "id, logged_at, meal_type, foods, total_calories_min, total_calories_max, total_protein_min, total_protein_max, total_carbs_min, total_carbs_max, total_fat_min, total_fat_max, total_fiber_min, total_fiber_max";

/** A confirmed meal plus what was in it, for screens that show the person
 * exactly what they ate. */
export interface GuidanceMealRow extends ConfirmedMealRow {
  mealType: string | null;
  foods: Array<{ name: string; quantity: string | null }>;
}

/** A meal_logs row as daily-totals wants it. Missing values stay null:
 * coercing them to zero is the under-reporting bug daily-totals.ts exists
 * to avoid, and AdultsMealLog's `?? 0` mapping is the wrong one to reuse. */
function toConfirmedMeal(m: Record<string, unknown>): GuidanceMealRow {
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  const foods = Array.isArray(m.foods) ? (m.foods as Array<Record<string, unknown>>) : [];
  return {
    mealType: typeof m.meal_type === "string" ? m.meal_type : null,
    foods: foods
      .filter((f) => typeof f?.name === "string" && f.name)
      .map((f) => {
        const quantity = f.visible_quantity || f.quantity;
        return { name: String(f.name), quantity: typeof quantity === "string" && quantity ? quantity : null };
      }),
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

/** A nutrition_targets row as the Guidance code uses it. */
export interface TargetRow extends DailyTarget {
  effectiveFrom: string;
  effectiveTo: string | null;
  policyVersion: string;
  explanation: string;
}

export async function loadTargetRows(db: SupabaseClient, contactId: string, contactType: GuidanceContactType): Promise<TargetRow[]> {
  const { data } = await db
    .from("nutrition_targets")
    .select("effective_from, effective_to, policy_version, calories_kcal, protein_g, carbs_g, fat_g, fiber_g, explanation")
    .eq(guidanceSubjectColumn(contactType), contactId);
  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
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
}

export async function loadMealRows(
  db: SupabaseClient,
  contactId: string,
  contactType: GuidanceContactType,
  sinceIso: string
): Promise<GuidanceMealRow[]> {
  // meal_logs predates Guidance and names a coach client client_id, not
  // gym_client_id as the Guidance tables do.
  const mealColumn = contactType === "gym" ? "client_id" : "adults_contact_id";
  const { data } = await db.from("meal_logs").select(MEAL_COLUMNS).eq(mealColumn, contactId).gte("logged_at", sinceIso);
  return ((data ?? []) as Record<string, unknown>[]).map(toConfirmedMeal);
}

/** Today's totals against the target that applies today, or null when no
 * target covers today. */
export async function loadTodayProgress(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; timezone: string; now?: Date }
): Promise<TodayProgress | null> {
  const contactType = params.contactType ?? "adults";
  const now = params.now ?? new Date();
  const date = localDate(now.toISOString(), params.timezone);
  // 48 hours back covers "today" in any timezone; computeDailyTotals then
  // keeps only the meals that fall on `date` locally.
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const [targets, meals] = await Promise.all([
    loadTargetRows(db, params.contactId, contactType),
    loadMealRows(db, params.contactId, contactType, since),
  ]);

  const target = targetForDate(targets, date);
  if (!target) return null;

  return {
    date,
    totals: computeDailyTotals({ date, timezone: params.timezone, meals, target }),
    target: { effectiveFrom: target.effectiveFrom, policyVersion: target.policyVersion, explanation: target.explanation },
  };
}

/** Which of these family contacts are in Guidance, for an overview that
 * lists several people at once. Same gate as everything else: the flag,
 * the release gate, then the mode, so in production (policy unreviewed)
 * this is always empty and costs no query past the flag. */
export async function loadGuidanceContactIds(db: SupabaseClient, contactIds: string[]): Promise<string[]> {
  if (!GUIDANCE_ENABLED || contactIds.length === 0) return [];
  const release = await loadReleaseState(db);
  if (!release.canActivate) return [];
  const { data } = await db
    .from("nutrition_guidance")
    .select("adults_contact_id")
    .eq("mode", "guidance")
    .in("adults_contact_id", contactIds);
  return ((data ?? []) as Array<{ adults_contact_id: string | null }>)
    .map((r) => r.adults_contact_id)
    .filter((id): id is string => id != null);
}

/** What a dashboard shows once Guidance is on: today meal by meal, and
 * every day since it started against that day's target. */
export interface GuidanceDashboard {
  isPreviewOnly: boolean;
  /** The tracked person's timezone, for meal times. */
  timezone: string;
  /** Today, YYYY-MM-DD, in the tracked person's timezone. */
  date: string;
  today: {
    target: DailyTarget;
    totals: DailyTotals;
    meals: Array<MealImpact<GuidanceMealRow>>;
  } | null;
  /** Newest first. The dashboard narrows it with its own date range. */
  history: GuidanceDay[];
}

/** History reaches back at most this far, the same window the family
 * dashboard already loads meals for. */
const HISTORY_DAYS = 400;

/**
 * The Guidance part of a dashboard, or null when the dashboard should stay
 * as it is: the flag is off, the release gate is closed, or the person is in
 * Tracking. The same three conditions the Guidance screen uses before it
 * shows a target, so a dashboard never shows numbers that screen would
 * hide.
 *
 * For a page that has already checked the viewer may see this contact.
 */
export async function loadGuidanceDashboard(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; now?: Date }
): Promise<GuidanceDashboard | null> {
  if (!GUIDANCE_ENABLED) return null;
  const contactType = params.contactType ?? "adults";
  const [release, state, facts] = await Promise.all([
    loadReleaseState(db),
    getGuidanceState(db, params.contactId, contactType),
    loadContactFacts(db, params.contactId, contactType),
  ]);
  if (!release.canActivate || state.mode !== "guidance" || !facts) return null;

  const now = params.now ?? new Date();
  const date = localDate(now.toISOString(), facts.timezone);
  const targets = await loadTargetRows(db, params.contactId, contactType);
  if (targets.length === 0) return null;

  const earliestAllowed = new Date(now.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const firstTarget = targets.reduce((min, t) => (t.effectiveFrom < min ? t.effectiveFrom : min), targets[0].effectiveFrom);
  const from = firstTarget > earliestAllowed ? firstTarget : earliestAllowed;
  // A day's meals can start up to 14 hours before UTC midnight; a day of
  // slack keeps the first day whole in any timezone.
  const since = new Date(Date.parse(`${from}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString();
  const meals = await loadMealRows(db, params.contactId, contactType, since);

  const todayTarget = targetForDate(targets, date);
  return {
    isPreviewOnly: release.isPreviewOnly,
    timezone: facts.timezone,
    date,
    today: todayTarget
      ? {
          target: todayTarget,
          totals: computeDailyTotals({ date, timezone: facts.timezone, meals, target: todayTarget }),
          meals: mealImpacts({ date, timezone: facts.timezone, meals, target: todayTarget }),
        }
      : null,
    history: guidanceHistory({ from, to: date, timezone: facts.timezone, meals, targets }),
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
