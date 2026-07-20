// Mirrors the main web app's src/lib/share-cards/types.ts — duplicated here rather
// than shared, matching this app's existing pattern (see lib/food-balance.ts's
// own comment on why). Keep in sync manually if the web app's share-cards
// logic changes.

// Shareable accomplishment cards ("Your wins") — playful, non-clinical
// celebration cards a user can post to Instagram/Facebook Stories or
// WhatsApp. See this directory's other files for the concept library
// (concepts.ts), trigger evaluation (triggers.ts), and the anti-spam/
// dashboard selector (selector.ts).
//
// Product principle (do not violate when adding new concepts): celebrate
// "I showed up" / "I was consistent" / "balance improved" — never "I
// complied with my diet", weight loss, calorie restriction, or "good vs
// bad" food framing. See concepts.ts's module doc for the full list of
// banned phrasings.

export type ShareCardCategory =
  | "daily_win"
  | "weekly_consistency"
  | "food_balance"
  | "improvement"
  | "personality_badge"
  | "comeback";

export type ShareCardFormat = "story_9_16" | "square_1_1";

export type ShareCardPrivacyRisk = "low" | "medium" | "high";

export interface ShareCardAchievementCriteria {
  metric?: string;
  threshold?: number;
  comparison?: "daily" | "weekly" | "previous_period" | "all_time";
  minMealsRequired?: number;
  minDaysRequired?: number;
}

export interface ShareCardConcept {
  id: string;
  category: ShareCardCategory;
  title: string;
  headlineOptions: string[];
  supportingTextOptions: string[];
  triggerDescription: string;
  /** Discriminant consumed by triggers.ts#evaluateTrigger — kept separate
   * from `id` so concept ids can be renamed/localized later without
   * touching evaluation logic. */
  triggerKey: string;
  achievementCriteria: ShareCardAchievementCriteria;
  defaultFormat: ShareCardFormat;
  allowedFormats: ShareCardFormat[];
  privacyRisk: ShareCardPrivacyRisk;
  hideExactMetricsByDefault: boolean;
  visualDirection: string;
  /** Generic (no user data) background-generation prompt for a future
   * Nano Banana (or similar) image model — see this file's header comment
   * on why the card's own text is never baked into the generated image. */
  nanoBananaPrompt?: string;
  shareCta: string;
  lowConfidenceFallback?: string;
}

/** One concept resolved into an actual displayable/shareable card — the
 * output of triggers.ts#getEarnedCards. Headline/supportingText are picked
 * from the concept's option lists (see pickCardCopy in triggers.ts, which
 * rotates the pick so the same card doesn't show identical copy every
 * time it's earned). */
export interface EarnedShareCard {
  concept: ShareCardConcept;
  earnedAt: string;
  headline: string;
  supportingText: string;
  /** A single generic, non-exact stat safe to show by default, e.g. "7-day
   * streak" or "5 days logged" — never exact grams/calories/weight. */
  stat?: string;
  /** True when the underlying data was thin enough that we fell back to
   * concept.lowConfidenceFallback for the supporting text instead of the
   * normal option list. */
  isLowConfidence: boolean;
  format: ShareCardFormat;
  /** Up to 4 real meal-photo URLs relevant to this earned card (e.g. the
   * user's own home-cooked meals for a "home cooked win" card), most
   * recent first — see triggers.ts#selectSharePhotos. Undefined/empty
   * means "no good photo match," in which case the card falls back to its
   * plain gradient background rather than showing unrelated photos. */
  photoUrls?: string[];
}
