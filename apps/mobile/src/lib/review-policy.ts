/** Decides when to ask someone for an App Store rating.
 *
 * Deliberately dependency-free (no React, no Expo, no "@/" imports) so the
 * repo's root jest config can exercise it directly — the mobile package has
 * no test runner of its own, and the rules below are exactly the sort that
 * are easy to get subtly wrong and impossible to notice. Same split as
 * push-nudge.ts, which the push card uses for the same reason.
 *
 * Why the gating is strict. Apple enforces three prompts per user per 365
 * days at the OS level: requestReview() beyond that silently does nothing
 * and the user is never told. That allowance is spent whether or not the
 * moment was well chosen, so a prompt fired at the wrong time is not merely
 * ignored — it burns one of three chances for the year.
 */

/** Meals logged across everyone the account tracks before asking.
 *
 * Roughly a fortnight of real use for a typical family, and past the point
 * where someone is still deciding whether the app works. Below this the
 * honest answer to "how are you finding it?" is "I don't know yet", and
 * that is not a rating worth collecting. */
export const MEALS_BEFORE_ASKING = 15;

/** Long enough that a second ask never reads as nagging, short enough that
 * someone who declined in year one can be asked again later. Apple's own
 * window is 365 days; staying inside it means our gate binds first, which
 * keeps the behaviour ours to reason about rather than the OS's. */
export const REASK_AFTER_MS = 180 * 24 * 60 * 60 * 1000;

export function shouldAskForReview(params: {
  totalMeals: number;
  lastAskedAt: number | null;
  now: number;
}): boolean {
  if (params.totalMeals < MEALS_BEFORE_ASKING) return false;
  if (params.lastAskedAt === null) return true;
  return params.now - params.lastAskedAt >= REASK_AFTER_MS;
}
