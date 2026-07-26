import type { ActivityLevel, DailyMovementLevel, WeeklyModerateActivity, DerivedActivityLevel } from "./types";

export type { DailyMovementLevel, WeeklyModerateActivity, StrengthExerciseFrequency, DerivedActivityLevel } from "./types";

/** Renames DerivedActivityLevel's "not_active" into this package's
 * pre-existing ActivityLevel literal "mostly_sitting" — the two types
 * describe the same four real categories; only the "not active" tier's
 * name changed for the new user-facing/DB-facing vocabulary. Every other
 * value is identical. Use this at the boundary where a DerivedActivityLevel
 * needs to become a FoodBalanceUserProfile.activityLevel (i.e.
 * energy.ts/confidence.ts and everything downstream of them keep working
 * unmodified). */
export function mapDerivedToLegacyActivityLevel(derived: DerivedActivityLevel): ActivityLevel {
  return derived === "not_active" ? "mostly_sitting" : derived;
}

const WEEKLY_ACTIVITY_BASE: Record<Exclude<WeeklyModerateActivity, "not_sure">, DerivedActivityLevel> = {
  under_30: "not_active",
  "30_to_89": "lightly_active",
  "90_to_149": "moderately_active",
  "150_to_299": "moderately_active",
  "300_plus": "very_active",
};

const LEVEL_RANK: Record<DerivedActivityLevel, number> = {
  not_active: 0,
  lightly_active: 1,
  moderately_active: 2,
  very_active: 3,
};

function atLeast(level: DerivedActivityLevel, minimum: DerivedActivityLevel): DerivedActivityLevel {
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum] ? level : minimum;
}

/**
 * Derives the internal activity category (used by calorie/macro/
 * recommendation calculations) from the two behavioural onboarding
 * answers — the questions shown to the user describe observable daily
 * movement and weekly faster-breathing activity; this function is the
 * ONLY place that turns those into the coarser category the rest of the
 * product still reasons about. Never spread this mapping into UI
 * components — always call this function and store its result
 * (derivedActivityLevel) alongside the two raw answers, recomputing
 * whenever either answer changes.
 */
export function deriveActivityLevel(params: {
  dailyMovementLevel: DailyMovementLevel;
  weeklyModerateActivity: WeeklyModerateActivity;
}): DerivedActivityLevel {
  const { dailyMovementLevel, weeklyModerateActivity } = params;
  const weeklyBase: DerivedActivityLevel | null =
    weeklyModerateActivity === "not_sure" ? null : WEEKLY_ACTIVITY_BASE[weeklyModerateActivity];

  switch (dailyMovementLevel) {
    case "mostly_seated":
      // Weekly activity is the whole signal here — being seated all day
      // doesn't itself lower or raise a known weekly-activity answer.
      // Both unknown: conservative fallback, same rationale as the
      // "not_sure" case below.
      return weeklyBase ?? "lightly_active";

    case "mixed_light_movement":
      // A little daily movement doesn't change the weekly-activity-based
      // category — but if weekly activity itself is unsure, default
      // conservatively rather than falling all the way back to
      // "not_active" on two blanks.
      return weeklyBase ?? "lightly_active";

    case "moving_several_hours":
      // On your feet for hours a day is at least light activity even if
      // the person under-reports/doesn't track faster-breathing minutes;
      // 90+ such minutes bumps it to at least moderate.
      if (weeklyModerateActivity === "not_sure") return "lightly_active";
      if (weeklyModerateActivity === "90_to_149" || weeklyModerateActivity === "150_to_299" || weeklyModerateActivity === "300_plus") {
        return atLeast(weeklyBase!, "moderately_active");
      }
      return atLeast(weeklyBase!, "lightly_active");

    case "physically_demanding": {
      // Physically demanding daily work/household activity is at least
      // moderate on its own — but only escalates to very_active alongside
      // real weekly faster-breathing volume (150+ min), never automatically
      // from daily movement alone (household work isn't assumed to be as
      // intense as structured exercise).
      if (weeklyModerateActivity === "not_sure") return "moderately_active";
      const withMinimum = atLeast(weeklyBase!, "moderately_active");
      if (weeklyModerateActivity === "150_to_299" || weeklyModerateActivity === "300_plus") {
        return atLeast(withMinimum, "very_active");
      }
      return withMinimum;
    }

    case "not_sure":
      // Weekly activity answer is the primary signal when daily movement
      // itself is unsure. If BOTH are unsure, fall back to the same
      // conservative default this product already used for a completely
      // unanswered activity question (see NutritionGoalFields' "unknown"
      // default, which downstream energy.ts already treats as a wide,
      // moderate-leaning range) — lightly_active.
      return weeklyBase ?? "lightly_active";
  }
}
