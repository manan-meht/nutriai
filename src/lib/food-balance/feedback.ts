import type { DietaryProfile } from "@/lib/dietary-profile";

export type RecommendationFeedback = "helpful" | "not_useful" | "already_eat" | "dont_like" | "not_available" | "too_hard";

function withoutIds(ids: string[], remove: string[]): string[] {
  return ids.filter((id) => !remove.includes(id));
}
function withIds(ids: string[], add: string[]): string[] {
  return Array.from(new Set([...ids, ...add]));
}

/** Applies feedback on a recommendation's shown foods (see
 * FoodBalanceRecommendation.exampleFoodIds) to the Food Profile. Pure —
 * callers persist the result (see the server actions in the adults/gym
 * dashboard actions.ts files).
 *
 * "already_eat"/"not_useful"/"too_hard" have no dedicated field per the
 * spec's data-model — "already_eat" reuses unavailable_suggestion_ids as
 * a deprioritization signal (the ranking effect the spec asks for —
 * "prefer variety... next time" — is the same lower-priority treatment as
 * "not available," even though the underlying reason differs; a real
 * distinct field would be needed if these two ever need to be
 * distinguished in the UI later — TODO). "not_useful"/"too_hard" are
 * acknowledged but don't change the profile — there's no rule in the spec
 * for what they should do to future ranking beyond generic feedback. */
export function applyRecommendationFeedback(
  profile: DietaryProfile,
  feedback: RecommendationFeedback,
  foodIds: string[]
): DietaryProfile {
  if (foodIds.length === 0) return profile;

  switch (feedback) {
    case "helpful":
      return {
        ...profile,
        liked_suggestion_ids: withIds(profile.liked_suggestion_ids, foodIds),
        disliked_suggestion_ids: withoutIds(profile.disliked_suggestion_ids, foodIds),
        unavailable_suggestion_ids: withoutIds(profile.unavailable_suggestion_ids, foodIds),
        last_updated_at: new Date().toISOString(),
      };
    case "dont_like":
      return {
        ...profile,
        disliked_suggestion_ids: withIds(profile.disliked_suggestion_ids, foodIds),
        liked_suggestion_ids: withoutIds(profile.liked_suggestion_ids, foodIds),
        unavailable_suggestion_ids: withoutIds(profile.unavailable_suggestion_ids, foodIds),
        last_updated_at: new Date().toISOString(),
      };
    case "not_available":
    case "already_eat":
      return {
        ...profile,
        unavailable_suggestion_ids: withIds(profile.unavailable_suggestion_ids, foodIds),
        last_updated_at: new Date().toISOString(),
      };
    case "not_useful":
    case "too_hard":
    default:
      return profile;
  }
}
