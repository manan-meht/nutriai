// Reusable overlay-caption library for meal-photo share cards (see
// ./types.ts's MealShareData) — punchy, Gen-Z-adjacent, social-share
// captions a user can pick/shuffle/edit before sharing. Deliberately
// separate from src/lib/share-cards/ (which celebrates abstract wins with
// no real photo) — this is copy layered on top of the user's own photo.
//
// Self-user rule: every `textSelf` avoids first-person pronouns ("I ...")
// — captions read as a plain description of the plate/meal, not a
// first-person claim, so they work unmodified for a self-share and are
// still grammatically clean when a relationship/coach prefix is added.

export type ShareOverlayTextCategory =
  | "protein"
  | "balanced_meal"
  | "fiber_veg"
  | "home_cooked"
  | "consistency"
  | "comeback"
  | "improvement"
  | "funny";

export type ShareOverlayAudience = "self" | "family" | "coach" | "any";

/** How a family/coach prefix attaches grammatically:
 * - "action": the caption reads as something the plate/person is doing —
 *   prefixed with "My {relationship} " / "Client " (no possessive).
 * - "possessive": the caption reads as a noun phrase belonging to someone
 *   — prefixed with "My {relationship}'s " / "Client's ". */
export type ShareOverlayTextFormat = "action" | "possessive";

export interface ShareOverlayTextSuggestion {
  id: string;
  category: ShareOverlayTextCategory;
  /** Base copy, no first-person pronouns — used as-is for a self-share,
   * and as the tail end of family/coach-prefixed versions. */
  textSelf: string;
  format: ShareOverlayTextFormat;
  mealTags?: Array<"breakfast" | "lunch" | "dinner" | "snack" | "any">;
  achievementTags?: string[];
  tone: "playful" | "funny" | "subtle" | "bold";
  maxLength?: number;
  requiresMetric?: "protein" | "carbs" | "fat" | "fiber" | "calories" | null;
  avoidIfSensitive?: boolean;
}

function s(
  id: string,
  category: ShareOverlayTextCategory,
  textSelf: string,
  format: ShareOverlayTextFormat,
  tone: ShareOverlayTextSuggestion["tone"],
  opts: Partial<Pick<ShareOverlayTextSuggestion, "mealTags" | "requiresMetric" | "avoidIfSensitive">> = {}
): ShareOverlayTextSuggestion {
  return { id, category, textSelf, format, tone, ...opts };
}

// Note per product feedback: "protein maxxing" is funny and current, but
// overused it reads try-hard — used sparingly below (2 of 20 protein
// lines), mixed with cleaner lines like "Protein showed up."
export const SHARE_OVERLAY_TEXT_LIBRARY: ShareOverlayTextSuggestion[] = [
  // ---- Protein (20) ----
  s("protein-1", "protein", "Protein maxxing for breakfast", "action", "playful", { mealTags: ["breakfast"], requiresMetric: "protein" }),
  s("protein-2", "protein", "Protein showed up", "action", "subtle", { requiresMetric: "protein" }),
  s("protein-3", "protein", "Protein came prepared", "action", "subtle", { requiresMetric: "protein" }),
  s("protein-4", "protein", "Protein understood the assignment", "action", "playful", { requiresMetric: "protein" }),
  s("protein-5", "protein", "Protein in the group chat", "possessive", "funny", { requiresMetric: "protein" }),
  s("protein-6", "protein", "Protein era unlocked", "possessive", "playful", { requiresMetric: "protein" }),
  s("protein-7", "protein", "Main character protein", "possessive", "bold", { requiresMetric: "protein" }),
  s("protein-8", "protein", "Breakfast with protein energy", "action", "playful", { mealTags: ["breakfast"], requiresMetric: "protein" }),
  s("protein-9", "protein", "Lunch said protein first", "action", "funny", { mealTags: ["lunch"], requiresMetric: "protein" }),
  s("protein-10", "protein", "Dinner brought the protein", "action", "subtle", { mealTags: ["dinner"], requiresMetric: "protein" }),
  s("protein-11", "protein", "Protein arc going strong", "possessive", "playful", { requiresMetric: "protein" }),
  s("protein-12", "protein", "Powered by protein", "action", "subtle", { requiresMetric: "protein" }),
  s("protein-13", "protein", "Protein doing the heavy lifting", "action", "funny", { requiresMetric: "protein" }),
  s("protein-14", "protein", "Protein was not optional today", "action", "bold", { requiresMetric: "protein" }),
  s("protein-15", "protein", "The protein agenda continues", "possessive", "funny", { requiresMetric: "protein" }),
  s("protein-16", "protein", "Low-key protein flex", "possessive", "playful", { requiresMetric: "protein" }),
  s("protein-17", "protein", "Protein-coded meal", "possessive", "funny", { requiresMetric: "protein" }),
  s("protein-18", "protein", "Protein behavior detected", "action", "funny", { requiresMetric: "protein" }),
  s("protein-19", "protein", "This plate lifts", "possessive", "playful", { requiresMetric: "protein" }),
  s("protein-20", "protein", "Protein maxxing, respectfully", "action", "playful", { requiresMetric: "protein" }),

  // ---- Balanced meal / macros (20) ----
  s("balanced-1", "balanced_meal", "Macros understood the assignment", "action", "playful"),
  s("balanced-2", "balanced_meal", "Balanced plate behavior", "action", "subtle"),
  s("balanced-3", "balanced_meal", "The whole macro squad showed up", "possessive", "funny"),
  s("balanced-4", "balanced_meal", "Protein, carbs, fats — all invited", "possessive", "funny"),
  s("balanced-5", "balanced_meal", "Macros in formation", "possessive", "bold"),
  s("balanced-6", "balanced_meal", "This plate has range", "possessive", "playful"),
  s("balanced-7", "balanced_meal", "Balance looking suspiciously good", "possessive", "funny"),
  s("balanced-8", "balanced_meal", "A plate with structure", "possessive", "subtle"),
  s("balanced-9", "balanced_meal", "Nutritionally giving", "action", "funny"),
  s("balanced-10", "balanced_meal", "Meal balance unlocked", "possessive", "playful"),
  s("balanced-11", "balanced_meal", "The plate is plating", "possessive", "funny"),
  s("balanced-12", "balanced_meal", "Macros doing teamwork", "action", "playful"),
  s("balanced-13", "balanced_meal", "Balanced, but make it casual", "possessive", "funny"),
  s("balanced-14", "balanced_meal", "Fuel with main character energy", "possessive", "bold"),
  s("balanced-15", "balanced_meal", "This meal came with a plan", "possessive", "subtle"),
  s("balanced-16", "balanced_meal", "Protein + carbs + fats = plot", "possessive", "funny"),
  s("balanced-17", "balanced_meal", "The macro math is mathing", "possessive", "funny"),
  s("balanced-18", "balanced_meal", "Balanced meal, no notes", "possessive", "subtle"),
  s("balanced-19", "balanced_meal", "A very organized plate", "possessive", "playful"),
  s("balanced-20", "balanced_meal", "This meal has its life together", "possessive", "funny"),

  // ---- Fiber / vegetables (15) ----
  s("fiber-1", "fiber_veg", "Fiber entered the chat", "action", "funny", { requiresMetric: "fiber" }),
  s("fiber-2", "fiber_veg", "More color, more plot", "possessive", "playful"),
  s("fiber-3", "fiber_veg", "Vegetables made an appearance", "action", "subtle"),
  s("fiber-4", "fiber_veg", "Fiber friend behavior", "action", "funny", { requiresMetric: "fiber" }),
  s("fiber-5", "fiber_veg", "The gut-support arc continues", "possessive", "funny"),
  s("fiber-6", "fiber_veg", "Color on the plate", "possessive", "subtle"),
  s("fiber-7", "fiber_veg", "Plant points unlocked", "possessive", "playful"),
  s("fiber-8", "fiber_veg", "Greens doing side quests", "possessive", "funny"),
  s("fiber-9", "fiber_veg", "Fiber maxxing, softly", "action", "playful", { requiresMetric: "fiber" }),
  s("fiber-10", "fiber_veg", "Vegetable era loading", "possessive", "playful"),
  s("fiber-11", "fiber_veg", "This plate touched grass", "possessive", "funny"),
  s("fiber-12", "fiber_veg", "Fruit and veg cameo", "possessive", "funny"),
  s("fiber-13", "fiber_veg", "Fiber said hello", "action", "funny", { requiresMetric: "fiber" }),
  s("fiber-14", "fiber_veg", "Texture, color, balance", "possessive", "subtle"),
  s("fiber-15", "fiber_veg", "The plate got greener", "possessive", "subtle"),

  // ---- Home-cooked (10) ----
  s("home-1", "home_cooked", "Home-cooked and quietly iconic", "action", "playful"),
  s("home-2", "home_cooked", "Kitchen deserves applause", "possessive", "funny"),
  s("home-3", "home_cooked", "Chef energy activated", "possessive", "playful"),
  s("home-4", "home_cooked", "Real food, real momentum", "possessive", "subtle"),
  s("home-5", "home_cooked", "Home-cooked meal behavior", "action", "funny"),
  s("home-6", "home_cooked", "Kitchen arc unlocked", "possessive", "playful"),
  s("home-7", "home_cooked", "Meal prep had a moment", "possessive", "funny"),
  s("home-8", "home_cooked", "Cooked at home, flexed online", "action", "funny"),
  s("home-9", "home_cooked", "Homemade with main character energy", "possessive", "bold"),
  s("home-10", "home_cooked", "The kitchen cooked today", "possessive", "funny"),

  // ---- Consistency (10) ----
  s("consistency-1", "consistency", "Consistency era", "possessive", "playful"),
  s("consistency-2", "consistency", "Still showing up", "action", "subtle"),
  s("consistency-3", "consistency", "Tiny habits, big energy", "possessive", "playful"),
  s("consistency-4", "consistency", "Routine looking real", "possessive", "funny"),
  s("consistency-5", "consistency", "The streak survives", "possessive", "funny"),
  s("consistency-6", "consistency", "Logged and locked in", "action", "bold"),
  s("consistency-7", "consistency", "Momentum is momentum", "possessive", "subtle"),
  s("consistency-8", "consistency", "This habit has receipts", "possessive", "funny"),
  s("consistency-9", "consistency", "Quiet consistency flex", "possessive", "playful"),
  s("consistency-10", "consistency", "Showing up again", "action", "subtle"),

  // ---- Comeback / improvement (10) ----
  s("comeback-1", "comeback", "Back in rhythm", "action", "subtle"),
  s("comeback-2", "comeback", "Comeback meal energy", "possessive", "playful"),
  s("comeback-3", "improvement", "Small upgrade, big vibe", "possessive", "funny"),
  s("comeback-4", "improvement", "Progress has entered the chat", "possessive", "funny"),
  s("comeback-5", "improvement", "Better than last week", "possessive", "subtle", { avoidIfSensitive: true }),
  s("comeback-6", "improvement", "The food arc is improving", "possessive", "playful"),
  s("comeback-7", "improvement", "A little more balanced today", "possessive", "subtle"),
  s("comeback-8", "comeback", "Plot twist: consistency returned", "possessive", "funny"),
  s("comeback-9", "improvement", "Upgrade unlocked", "possessive", "playful"),
  s("comeback-10", "improvement", "The plate leveled up", "possessive", "playful"),

  // ---- Funny / social (15) ----
  s("funny-1", "funny", "Fuel, but make it cute", "possessive", "funny"),
  s("funny-2", "funny", "This meal has lore", "possessive", "funny"),
  s("funny-3", "funny", "Plate check passed", "possessive", "funny"),
  s("funny-4", "funny", "Nutrition side quest completed", "possessive", "funny"),
  s("funny-5", "funny", "Casually balanced", "possessive", "subtle"),
  s("funny-6", "funny", "Meal said slay, but responsibly", "possessive", "funny"),
  s("funny-7", "funny", "Health era, but chill", "possessive", "playful"),
  s("funny-8", "funny", "Main character meal", "possessive", "bold"),
  s("funny-9", "funny", "The plate is giving responsible", "possessive", "funny"),
  s("funny-10", "funny", "Soft launch of better habits", "possessive", "funny"),
  s("funny-11", "funny", "Ate like future self was watching", "action", "playful"),
  s("funny-12", "funny", "Food choices with plot development", "possessive", "funny"),
  s("funny-13", "funny", "A meal with good PR", "possessive", "funny"),
  s("funny-14", "funny", "This plate is in its wellness era", "possessive", "playful"),
  s("funny-15", "funny", "Not a diet, just data", "possessive", "subtle"),
];

/** Phrases that must never appear in this library — enforced by a test,
 * not runtime filtering, since the library is static/hand-authored. Kept
 * here (not just in the test) so a future contributor adding a line sees
 * the rule right next to the data. */
export const SHARE_OVERLAY_BANNED_PHRASES = [
  "cheat meal",
  "bad food",
  "clean eating",
  "weight loss flex",
  "cure",
  "treat",
  "reverse",
  "guilt",
  "before and after",
  "before/after",
];

const RELATIONSHIP_LABELS: Record<string, string> = {
  mom: "mom",
  dad: "dad",
  parent: "parent",
  "mother-in-law": "mother-in-law",
  "father-in-law": "father-in-law",
  partner: "partner",
  spouse: "spouse",
  client: "client",
  "family member": "family member",
};

function lowercaseFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Renders one suggestion's caption for the given audience/relationship —
 * self captions pass through unmodified (already pronoun-free); family
 * captions prefix "My {relationship} " (action) or "My {relationship}'s "
 * (possessive); coach captions use "Client " / "Client's " the same way. */
export function formatOverlayText(
  suggestion: Pick<ShareOverlayTextSuggestion, "textSelf" | "format">,
  audience: ShareOverlayAudience,
  relationship?: string
): string {
  if (audience === "self" || audience === "any") return suggestion.textSelf;

  if (audience === "coach") {
    return suggestion.format === "possessive"
      ? `Client's ${lowercaseFirst(suggestion.textSelf)}`
      : `Client ${lowercaseFirst(suggestion.textSelf)}`;
  }

  // family
  const label = (relationship && RELATIONSHIP_LABELS[relationship.toLowerCase()]) || relationship || "family member";
  return suggestion.format === "possessive"
    ? `My ${label}'s ${lowercaseFirst(suggestion.textSelf)}`
    : `My ${label} ${lowercaseFirst(suggestion.textSelf)}`;
}

/** Lightweight, per-meal category guess from the macro numbers already on
 * MealShareData — deliberately simple (no fiber field exists on
 * MealShareData, and this feature shares one photo, not a weekly digest,
 * so it can't reuse src/lib/share-cards/triggers.ts's fuller
 * multi-day evaluation). A protein-forward meal (>=25g) is tagged
 * "protein"; otherwise a roughly even macro split is tagged
 * "balanced_meal"; "funny" is always included so generic/silly options
 * stay available regardless. TODO: once fiber is tracked on
 * MealShareData, add a "fiber_veg" trigger here too. */
export function deriveMealShareCategories(meal: { proteinG: number; carbsG: number; fatG: number }): ShareOverlayTextCategory[] {
  const categories: ShareOverlayTextCategory[] = [];
  if (meal.proteinG >= 25) categories.push("protein");

  const proteinCal = meal.proteinG * 4;
  const carbsCal = meal.carbsG * 4;
  const fatCal = meal.fatG * 9;
  const total = proteinCal + carbsCal + fatCal;
  if (total > 0) {
    const proteinShare = proteinCal / total;
    const carbsShare = carbsCal / total;
    const fatShare = fatCal / total;
    const isRoughlyBalanced = proteinShare >= 0.15 && carbsShare >= 0.25 && fatShare >= 0.15;
    if (isRoughlyBalanced) categories.push("balanced_meal");
  }

  categories.push("funny");
  return categories;
}

export interface OverlayTextContext {
  mealType?: "breakfast" | "lunch" | "dinner" | "snack" | "unknown";
  /** Achievement/context categories detected for this meal — caller's
   * responsibility to derive (e.g. from MealShareData's macro values or
   * src/lib/share-cards/triggers.ts's evaluation), kept as a plain
   * category list here so this module stays decoupled from that pure
   * scoring package. Empty/omitted falls back to generic categories. */
  categories?: ShareOverlayTextCategory[];
  audience: ShareOverlayAudience;
  relationship?: string;
}

/** Ranks the library for relevance to the given context, formats each for
 * the audience, and returns up to `count` suggestions (id + formatted
 * text + category), most relevant first. Always includes at least a few
 * "funny"/generic options so the list never looks empty for an
 * unclassified meal. */
export function suggestOverlayTexts(
  context: OverlayTextContext,
  count = 8
): Array<{ id: string; category: ShareOverlayTextCategory; text: string }> {
  const categories = context.categories && context.categories.length > 0 ? context.categories : ["balanced_meal", "funny"];

  const scored = SHARE_OVERLAY_TEXT_LIBRARY.map((suggestion) => {
    let score = 0;
    if (categories.includes(suggestion.category)) score += 3;
    const mealType = context.mealType && context.mealType !== "unknown" ? context.mealType : "any";
    if (suggestion.mealTags?.includes(mealType) || suggestion.mealTags?.includes("any")) score += 1;
    if (!suggestion.mealTags) score += 0.5; // no meal-tag restriction is a mild positive (broadly applicable)
    return { suggestion, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ suggestion }) => ({
      id: suggestion.id,
      category: suggestion.category,
      text: formatOverlayText(suggestion, context.audience, context.relationship),
    }));
}

/** Picks `count` suggestions at random from the still-relevant pool
 * (same category set as suggestOverlayTexts) — backs the "Shuffle"
 * control, which should feel fresh but stay on-topic rather than
 * surfacing something wildly unrelated (e.g. a fiber caption on a
 * clearly high-protein-only breakfast). */
export function shuffleOverlayTexts(
  context: OverlayTextContext,
  count = 8
): Array<{ id: string; category: ShareOverlayTextCategory; text: string }> {
  const pool = SHARE_OVERLAY_TEXT_LIBRARY.filter(
    (suggestion) => !context.categories || context.categories.length === 0 || context.categories.includes(suggestion.category)
  );
  const source = pool.length > 0 ? pool : SHARE_OVERLAY_TEXT_LIBRARY;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((suggestion) => ({
    id: suggestion.id,
    category: suggestion.category,
    text: formatOverlayText(suggestion, context.audience, context.relationship),
  }));
}
