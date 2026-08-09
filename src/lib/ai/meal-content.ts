/**
 * Deliberately its own module rather than living in food-analyzer.ts: that
 * module imports the whole @google/generative-ai SDK at module scope, which
 * the stale-clarification cron route can't afford in its Worker bundle (see
 * the note at the top of src/app/api/cron/send-meal-reminders/route.ts) and
 * which test suites automock wholesale. Keeping this pure predicate separate
 * lets both the WhatsApp handler and the cron sweep share one copy.
 */

/**
 * Whether an analysis actually describes food, as opposed to the model's
 * "I couldn't read this" output. Guards the two best-guess force-save paths
 * (saveBestGuessForClarification and the stale-clarification cron sweep),
 * which take whatever is sitting in pending_meal and commit it to meal_logs
 * unreviewed.
 *
 * Without this a real user was told: "I've saved your breakfast using my
 * best guess: No meal content provided. Please share a photo or description
 * of your meal." — the model's failure text stored as a meal and read back
 * as if it were one, leaving a junk row in their log.
 *
 * Deliberately keys on structure (no named foods, and no calorie estimate)
 * rather than pattern-matching the failure prose, which is free-form model
 * output and would drift. A genuinely zero-calorie item (black coffee,
 * water) still has a named food, so it passes.
 */
export function analysisHasFoodContent(analysis: {
  foods?: Array<{ name?: string }> | null;
  total_calories_min?: number | null;
  total_calories_max?: number | null;
}): boolean {
  const hasNamedFood = (analysis.foods ?? []).some((f) => f?.name?.trim());
  if (hasNamedFood) return true;
  return (analysis.total_calories_min ?? 0) > 0 || (analysis.total_calories_max ?? 0) > 0;
}
