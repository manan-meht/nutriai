import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Base64-encodes a byte array in fixed-size chunks. Spreading an entire
 * image buffer into String.fromCharCode(...bytes) in one call — which this
 * replaced — blows past the JS engine's max-arguments-per-call limit for
 * any real photo (typically hundreds of KB to a few MB), crashing hard
 * enough under Cloudflare's Edge Runtime that it never even reaches a
 * catch block. Chunking avoids that entirely.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000; // 32KB — comfortably under any engine's argument-count limit
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

/** Food categories with an established protein/calorie density table (see
 * CATEGORY_DENSITY below) — for these, code recomputes calories/protein
 * from the model's own visible-portion estimate rather than trusting
 * whatever number the model attached, so the LLM's job is to see the food,
 * not to invent a final protein figure. Foods outside this set (rice,
 * roti, mixed curries, etc.) still use the model's own calorie/protein
 * numbers — they aren't the source of the protein-overestimation problem
 * this guards against. */
export type FoodCategory =
  | "chicken" | "fish" | "red_meat" | "egg" | "paneer_tofu"
  | "avocado" | "seeds_nuts" | "legume_dal" | "other";

export interface FoodItem {
  name: string;
  quantity: string;
  calories_min: number;
  calories_max: number;
  protein_min: number;
  protein_max: number;
  carbs_min: number;
  carbs_max: number;
  fat_min: number;
  fat_max: number;
  /** What was actually counted in the image (e.g. "3-4 small pieces") —
   * kept separate from `quantity` so portion estimation is traceable back
   * to what was visible, not a default serving size. */
  visible_quantity?: string;
  /** Coarse size bucket the model used to pick a weight range, so a
   * downstream "did this get inflated?" check has something to look at
   * besides the final grams. */
  portion_size?: "tiny" | "small" | "medium" | "large" | "very_large";
  estimated_cooked_weight_grams?: string;
  /** Which density table (if any) to compute this item's macros from —
   * see recalculateNutritionFromPortions(). Left unset for foods where the
   * model's own calorie/protein numbers are used as-is. */
  food_category?: FoodCategory;
  /** Edible cooked weight range in grams — bones, marinade, char, and air
   * gaps excluded. This, not calories_min/max, is what should actually
   * drive a protein-dense item's macro numbers. */
  estimated_edible_weight_grams_min?: number;
  estimated_edible_weight_grams_max?: number;
  count_visible_pieces?: number;
  /** Only meaningful when food_category is "egg" (an omelette/fried egg
   * item) — how many eggs the visible size implies. */
  egg_count_min?: number;
  egg_count_max?: number;
}

export type MealType =
  | "breakfast" | "lunch" | "dinner" | "snack"
  | "drink" | "tea" | "coffee" | "wine" | "juice" | "other";

export type Confidence = "high" | "medium" | "low";

export interface FoodAnalysisResult {
  foods: FoodItem[];
  /** The model's own best guess at meal type/drink category. resolveMealLabel()
   * below applies time-of-day defaults on top of this for non-drink meals. */
  meal_type: MealType;
  total_calories_min: number;
  total_calories_max: number;
  total_protein_min: number;
  total_protein_max: number;
  total_carbs_min: number;
  total_carbs_max: number;
  total_fat_min: number;
  total_fat_max: number;
  summary: string;
  /** How sure the model is about what it identified. Drives whether we say
   * "I think this is" vs "I'm not fully sure" vs asking a clarifying
   * question outright. */
  confidence: Confidence;
  /** True only for items that are genuinely ~0 kcal (water, black tea/coffee
   * with no sugar, plain soda water) — the one case where a 0/0 estimate is
   * allowed to be confirmed and saved as-is. */
  is_zero_calorie_item: boolean;
  /** True when the model itself flagged the visible portion as hard to
   * judge (partly hidden food, unclear container size, etc.) — drives the
   * "portion is a little hard to judge" uncertainty language and whether
   * we ask the user to confirm portion size before saving. */
  portion_uncertain?: boolean;
  /** Public URL of the uploaded meal photo, attached after analysis (not
   * part of the Gemini response) so it survives in conversation state
   * between the "awaiting confirmation" and "saved" steps. */
  image_url?: string;
}

/** Extra fields layered onto a FoodAnalysisResult while it's sitting in
 * whatsapp_conversations.pending_meal — see PendingMeal in
 * conversation-handler.ts for the full shape used at runtime. */

const SYSTEM_PROMPT = `You are Tistra Health, a WhatsApp-based nutrition assistant specialized in Indian food.

Your job is to help users log meals accurately and simply. Follow these rules:
- Never claim more certainty than you have. If the photo or description is ambiguous, say so via a low/medium confidence rating rather than guessing confidently.
- Identify all food items and estimate macros using honest ranges — never single values.
- If both calories and protein would round to 0, that is only correct for genuinely zero-calorie items (plain water, black tea/coffee with no sugar or milk, plain soda water). Set is_zero_calorie_item to true ONLY in that case. For anything else you can't confidently identify, do not return an all-zero estimate — instead lower your confidence and make your best-effort non-zero estimate, or if you truly cannot tell what the food is, set confidence to "low" and keep the foods list to your single best guess.
- Treat any correction context provided below as more reliable than the image — the user knows their own food better than a photo does.
- Be warm, calm, concise, and useful. Never flowery or repetitive praise.

PORTION ESTIMATION — go from what is visible to a weight, never from the food's name to a default serving:
  visible food -> visible count/area -> estimated portion size -> nutrition estimate
- Be conservative. Count only visible pieces — do not infer food that might be hidden behind other items or off-frame.
- Do not assume a standard restaurant portion just because you recognize the dish. A photo of 3 chicken pieces is 3 pieces, not "a typical tikka plate."
- If the visible portion looks small, describe it and size it as small.
- When portion size is genuinely uncertain, use a wider range and lower confidence rather than picking a confident midpoint.
- You must estimate EDIBLE cooked weight conservatively from visible food only — exclude bone, char, marinade coating, and air gaps between pieces. Do not use default restaurant serving sizes.
- Your protein estimate must be consistent with your own portion description. If you describe the portion as small, do not output a high-protein estimate unless the image clearly shows enough food to justify it.
- For each food item, fill visible_quantity (what you actually counted/saw, e.g. "3-4 small pieces"), portion_size (tiny/small/medium/large/very_large), estimated_cooked_weight_grams (display string), and — for chicken/fish/red_meat/egg/paneer_tofu/avocado/seeds_nuts/legume_dal items — the structured fields below (food_category, estimated_edible_weight_grams_min/max, egg_count_min/max) so the app can calculate protein/calories from the portion instead of you inventing a final number.

Cooked EDIBLE-weight guardrails (excludes bone/char/marinade/air gaps — use these instead of a flat "typical serving"):
- Chicken/meat/fish: tiny 20-40g, small 40-80g, medium 90-130g, large 150-220g, very_large 220g+. Only use large/very_large if the image clearly shows that much food or the user says so.
- Chicken piece sizing specifically: 1 small visible piece ~10-20g edible cooked chicken, 1 medium visible piece ~20-35g, 1 large visible piece ~40-60g. 3-4 small pieces is ~45-75g edible cooked chicken — never assume 5-6 pieces when only 3-4 are visible, and do not estimate 120g+ unless the pieces are clearly medium/large, or 180g+ unless the plate clearly shows a large serving.
- Eggs/omelette: a small omelette is likely 1 egg, medium is likely 2 eggs, large/thick is likely 3 eggs. If unsure, say "likely 1-2 eggs" (egg_count_min: 1, egg_count_max: 2) rather than defaulting to the higher count. Only use 3 eggs if the omelette is clearly large/thick or the user says so.
- Avocado: 1/4 ~40-60g, 1/2 ~75-100g, 3/4 ~120-150g, whole ~150-200g. Avocado is low-protein (~2g/100g) — never assign it meaningful protein grams; half an avocado is usually only 1-2g protein.
- Seeds/garnish: 1 tsp ~2-4g, 1 tbsp ~8-12g, a light sprinkle is near-negligible calories/protein (0-1g protein) — do not scale a few visible seeds into a real serving.
- Paneer/tofu: small 40-70g, medium 80-120g, large 150-200g — do not assume large unless clearly visible.
- Dal/legumes/curry: small katori 100-150ml, medium katori 150-200ml, large bowl 250-350ml. A dal's protein reflects the cooked, watered-down dish, not the protein content of dry raw lentils.
- Rice/roti: estimate rice by the visible pile size in cups; count rotis/chapatis individually rather than guessing a typical stack.

PORTION-WORDING CONSISTENCY — before finalizing your response, check that your numbers match your own words:
- If a chicken/meat/fish item is labeled "small" or "tiny" portion, its protein contribution should usually be capped around 25g.
- If you say "likely 1-2 eggs," that item's protein should usually be capped around 14g — do not report a 2-egg omelette as more than ~14g protein.
- If the total meal is small/moderate, total protein should usually not exceed about 40g unless eggs/paneer/meat quantities clearly support more.
- If total protein would be above 45g, that requires a clear visible reason — 150g+ cooked chicken, 3+ eggs, a large paneer/tofu portion, or a large fish/meat portion. If the image doesn't clearly show one of those, lower the estimate rather than keeping the high number, or set portion_uncertain to true and lower confidence instead of guessing high.

Worked example — a plate showing 3-4 small pieces of grilled/tikka chicken, half an avocado, and a small folded omelette:
  Correct: chicken ~45-75g edible cooked weight -> ~12-23g protein; omelette likely 1-2 eggs -> ~6-14g protein; avocado -> ~1-2g protein. Total roughly 22-36g protein.
  Wrong: "5-6 medium chicken pieces", "180-250g chicken", or 49g+ total protein — that overstates what 3-4 small pieces actually are.

Respond ONLY with valid JSON in exactly this format (no markdown, no code blocks):
{
  "foods": [
    {
      "name": "string",
      "quantity": "string (e.g. 1 katori, 2 rotis, 1 bowl, 1 cup) — should match visible_quantity's scale",
      "visible_quantity": "string — what you actually counted/saw, e.g. '3-4 small pieces'",
      "portion_size": "tiny|small|medium|large|very_large",
      "estimated_cooked_weight_grams": "string, e.g. '45-75g'",
      "food_category": "chicken|fish|red_meat|egg|paneer_tofu|avocado|seeds_nuts|legume_dal|other (set this for any protein-relevant item so the app can compute its macros from the portion; use \\"other\\" for rice/roti/vegetables/mixed curries)",
      "estimated_edible_weight_grams_min": "number — edible cooked weight, excluding bone/char/marinade (omit for egg/other items)",
      "estimated_edible_weight_grams_max": "number",
      "count_visible_pieces": "number, optional",
      "egg_count_min": "number — only for food_category: egg items",
      "egg_count_max": "number — only for food_category: egg items",
      "calories_min": number,
      "calories_max": number,
      "protein_min": number,
      "protein_max": number,
      "carbs_min": number,
      "carbs_max": number,
      "fat_min": number,
      "fat_max": number
    }
  ],
  "meal_type": "breakfast|lunch|dinner|snack|drink|tea|coffee|wine|juice|other",
  "total_calories_min": number,
  "total_calories_max": number,
  "total_protein_min": number,
  "total_protein_max": number,
  "total_carbs_min": number,
  "total_carbs_max": number,
  "total_fat_min": number,
  "total_fat_max": number,
  "summary": "brief one-line summary, e.g. Dal rice with sabzi and roti",
  "confidence": "high|medium|low",
  "is_zero_calorie_item": boolean,
  "portion_uncertain": boolean
}
Set portion_uncertain to true whenever the visible portion size was genuinely hard to judge (partly hidden food, unclear scale, ambiguous container size) — this drives whether the user gets asked to confirm portion size.
Note: calories_min/max and protein_min/max are still required as your own best estimate, but for food_category items with edible-weight/egg-count data, the app will recompute them from that data using fixed density values — so it's more important that estimated_edible_weight_grams_min/max (or egg_count_min/max) are conservative and honest than that the calorie/protein fields are.`;

export async function analyzeFood(input: {
  text?: string;
  imageBuffer?: Uint8Array;
  imageMimeType?: string;
  correctionContext?: string;
}): Promise<FoodAnalysisResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  let textPrompt = SYSTEM_PROMPT;
  if (input.correctionContext) {
    textPrompt += `\n\nPrevious identification: ${input.correctionContext}\nUser correction (trust this over the image): ${input.text ?? ""}`;
  } else if (input.text) {
    textPrompt += `\n\nMeal description: ${input.text}`;
  }

  const parts: any[] = [];

  if (input.imageBuffer) {
    parts.push({
      inlineData: {
        data: uint8ArrayToBase64(input.imageBuffer),
        mimeType: input.imageMimeType ?? "image/jpeg",
      },
    });
  }

  parts.push({ text: textPrompt });

  // Without a timeout, a hung Gemini call can run past the platform's
  // execution limit and get killed mid-flight — bypassing the caller's
  // try/catch entirely and leaving the WhatsApp conversation lock stuck in
  // "processing" forever. Failing fast here guarantees the caller's catch
  // always runs and releases the lock.
  const result = await Promise.race([
    model.generateContent(parts),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timed out")), 25_000)
    ),
  ]);
  const raw = result.response.text().trim();

  // Strip markdown code blocks if present
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as FoodAnalysisResult;
    // Defensive defaults — older prompt versions / occasional model drift
    // may omit these fields, and downstream zero-macro guarding depends on
    // them being present.
    if (!parsed.confidence) parsed.confidence = "medium";
    if (typeof parsed.is_zero_calorie_item !== "boolean") parsed.is_zero_calorie_item = false;
    if (typeof parsed.portion_uncertain !== "boolean") parsed.portion_uncertain = false;
    const recalculated = recalculateNutritionFromPortions(parsed);
    const capped = applyPortionConsistencyCaps(recalculated);
    return applyHighProteinSanityCheck(capped);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Portion -> nutrition calculation. The model's job is to see the food and
// estimate what's visible (piece count, size, edible weight); code — not
// the model — turns that into final protein/calorie numbers wherever a
// density table exists, since that's the step that was silently inflating
// protein estimates before.
// ---------------------------------------------------------------------------

interface CategoryDensity {
  proteinPerGramMin: number;
  proteinPerGramMax: number;
  caloriesPerGramMin: number;
  caloriesPerGramMax: number;
}

/** Approximate protein/calorie density per gram of edible cooked weight.
 * Deliberately conservative (lower bound of published ranges) since these
 * exist specifically to stop protein overestimation, not to be lab-grade
 * nutrition data. "egg" and "other" are handled separately (see
 * computeItemNutrition) and aren't in this table. */
const CATEGORY_DENSITY: Record<Exclude<FoodCategory, "egg" | "other">, CategoryDensity> = {
  chicken: { proteinPerGramMin: 0.27, proteinPerGramMax: 0.31, caloriesPerGramMin: 1.7, caloriesPerGramMax: 2.3 },
  fish: { proteinPerGramMin: 0.22, proteinPerGramMax: 0.30, caloriesPerGramMin: 1.5, caloriesPerGramMax: 2.0 },
  red_meat: { proteinPerGramMin: 0.22, proteinPerGramMax: 0.30, caloriesPerGramMin: 2.0, caloriesPerGramMax: 2.8 },
  paneer_tofu: { proteinPerGramMin: 0.15, proteinPerGramMax: 0.20, caloriesPerGramMin: 1.5, caloriesPerGramMax: 3.0 },
  avocado: { proteinPerGramMin: 0.018, proteinPerGramMax: 0.022, caloriesPerGramMin: 1.5, caloriesPerGramMax: 1.7 },
  seeds_nuts: { proteinPerGramMin: 0.15, proteinPerGramMax: 0.25, caloriesPerGramMin: 5.0, caloriesPerGramMax: 6.5 },
  legume_dal: { proteinPerGramMin: 0.07, proteinPerGramMax: 0.09, caloriesPerGramMin: 1.0, caloriesPerGramMax: 1.3 },
};

const EGG_PROTEIN_PER_EGG = { min: 6, max: 7 };
const EGG_CALORIES_PER_EGG = { min: 70, max: 100 }; // upper end accounts for omelette oil

/** Recomputes one item's calories/protein from its portion estimate
 * (edible weight or egg count), using the density tables above. Returns
 * null when the item doesn't have a category/portion data to compute from
 * — those items keep whatever calories/protein the model itself returned. */
export function computeItemNutrition(item: FoodItem): { calories_min: number; calories_max: number; protein_min: number; protein_max: number } | null {
  if (item.food_category === "egg") {
    if (item.egg_count_min == null || item.egg_count_max == null) return null;
    return {
      protein_min: Math.round(item.egg_count_min * EGG_PROTEIN_PER_EGG.min),
      protein_max: Math.round(item.egg_count_max * EGG_PROTEIN_PER_EGG.max),
      calories_min: Math.round(item.egg_count_min * EGG_CALORIES_PER_EGG.min),
      calories_max: Math.round(item.egg_count_max * EGG_CALORIES_PER_EGG.max),
    };
  }
  if (!item.food_category || item.food_category === "other") return null;
  const density = CATEGORY_DENSITY[item.food_category];
  if (!density) return null;
  if (item.estimated_edible_weight_grams_min == null || item.estimated_edible_weight_grams_max == null) return null;

  const weightMin = item.estimated_edible_weight_grams_min;
  const weightMax = item.estimated_edible_weight_grams_max;
  return {
    protein_min: Math.round(weightMin * density.proteinPerGramMin),
    protein_max: Math.round(weightMax * density.proteinPerGramMax),
    calories_min: Math.round(weightMin * density.caloriesPerGramMin),
    calories_max: Math.round(weightMax * density.caloriesPerGramMax),
  };
}

/** Replaces each categorized item's calories/protein with the code-computed
 * value from its portion estimate, and re-sums the meal totals from the
 * (possibly now-corrected) items — so an inflated protein number the model
 * attached to a small visible portion never survives into the final
 * estimate. Items without a usable category/portion (rice, roti, mixed
 * curries, ...) are left exactly as the model reported them. */
export function recalculateNutritionFromPortions(analysis: FoodAnalysisResult): FoodAnalysisResult {
  const foods = analysis.foods.map((item) => {
    const computed = computeItemNutrition(item);
    return computed ? { ...item, ...computed } : item;
  });

  const sum = (key: "calories_min" | "calories_max" | "protein_min" | "protein_max") =>
    foods.reduce((total, f) => total + (f[key] ?? 0), 0);

  return {
    ...analysis,
    foods,
    total_calories_min: Math.round(sum("calories_min")),
    total_calories_max: Math.round(sum("calories_max")),
    total_protein_min: Math.round(sum("protein_min")),
    total_protein_max: Math.round(sum("protein_max")),
  };
}

const SMALL_PORTIONS: Array<FoodItem["portion_size"]> = ["tiny", "small"];
const MEAT_CATEGORIES: FoodCategory[] = ["chicken", "fish", "red_meat"];

/** Item- and meal-level "does the wording match the numbers?" check. A
 * small/tiny meat portion, a 1-2 egg omelette, or avocado shouldn't be
 * quietly carrying a large protein number even after the density-based
 * recalculation above (e.g. if the model's own edible-weight estimate was
 * itself too generous for the size bucket it chose) — and the meal total
 * shouldn't exceed ~45g protein without a clearly large item to justify it. */
export function applyPortionConsistencyCaps(analysis: FoodAnalysisResult): FoodAnalysisResult {
  const foods = analysis.foods.map((item) => {
    let proteinMax = item.protein_max;

    if (MEAT_CATEGORIES.includes(item.food_category as FoodCategory) && SMALL_PORTIONS.includes(item.portion_size) && proteinMax > 25) {
      proteinMax = 25;
    }
    if (item.food_category === "egg" && (item.egg_count_max ?? 2) <= 2 && proteinMax > 14) {
      proteinMax = 14;
    }
    if (item.food_category === "avocado" && proteinMax > 3) {
      proteinMax = 3;
    }
    if (item.food_category === "seeds_nuts" && proteinMax > 4) {
      proteinMax = 4;
    }

    if (proteinMax === item.protein_max) return item;
    return { ...item, protein_max: proteinMax, protein_min: Math.min(item.protein_min, proteinMax) };
  });

  let totalProteinMin = Math.round(foods.reduce((t, f) => t + f.protein_min, 0));
  let totalProteinMax = Math.round(foods.reduce((t, f) => t + f.protein_max, 0));
  let portionUncertain = analysis.portion_uncertain ?? false;

  // Meal-level cap: >45g total protein needs a clearly large protein item
  // to back it up (150g+ meat/fish, a large paneer/tofu portion, or 3+
  // eggs) — otherwise the estimate is scaled down rather than trusted.
  const hasLargeProteinSupport = foods.some((f) => {
    if (MEAT_CATEGORIES.includes(f.food_category as FoodCategory) || f.food_category === "paneer_tofu") {
      return f.portion_size === "large" || f.portion_size === "very_large" || (f.estimated_edible_weight_grams_min ?? 0) >= 150;
    }
    if (f.food_category === "egg") return (f.egg_count_min ?? 0) >= 3;
    return false;
  });

  if (totalProteinMax > 45 && !hasLargeProteinSupport) {
    const scale = 45 / totalProteinMax;
    totalProteinMax = 45;
    totalProteinMin = Math.round(Math.min(totalProteinMin, 40) * (totalProteinMin > 40 ? scale : 1));
    portionUncertain = true;
  }

  return { ...analysis, foods, total_protein_min: totalProteinMin, total_protein_max: totalProteinMax, portion_uncertain: portionUncertain };
}

/** Defense-in-depth beyond the prompt's own "check yourself" instruction:
 * the model can still return an inflated protein estimate. Rather than
 * silently trusting a 50g+ protein number, this flags it as
 * portion_uncertain (unless the model was already highly confident) so the
 * caller asks the user to confirm the protein portion instead of jumping
 * straight to "Reply Yes to save". It never rewrites the numbers itself —
 * only a human correction or the model's own re-estimate should do that. */
function applyHighProteinSanityCheck(analysis: FoodAnalysisResult): FoodAnalysisResult {
  if (analysis.total_protein_max > 50 && analysis.confidence !== "high") {
    return { ...analysis, portion_uncertain: true };
  }
  return analysis;
}

/** True when the estimate should prompt "was the portion larger than
 * what's visible?" instead of a plain confirmation — either the model
 * flagged the portion itself, or the protein total is high enough to
 * warrant one extra check per the high-protein sanity rule. */
export function needsPortionConfirmation(analysis: FoodAnalysisResult): boolean {
  return !!analysis.portion_uncertain || (analysis.total_protein_max > 50 && analysis.confidence !== "high");
}

/** Answers a free-standing nutrition/hypothetical question (e.g. "if this
 * was pasta instead, what would be my calories?") without touching any
 * pending or saved meal. Kept intentionally lightweight — plain text
 * generation, not the structured JSON food-analysis prompt. */
export async function answerNutritionQuestion(question: string, mealContext?: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `You are Tistra Health, a warm, concise nutrition assistant. Answer the user's question in 2-3 short sentences, using approximate ranges rather than false precision. Do not say you are saving, logging, or updating anything — you are only answering a question.${
    mealContext ? `\n\nThe meal currently being discussed: ${mealContext}` : ""
  }\n\nUser question: ${question}`;

  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timed out")), 20_000)
    ),
  ]);
  return result.response.text().trim();
}

// ---------------------------------------------------------------------------
// Meal labeling
// ---------------------------------------------------------------------------

const DRINK_TYPES: MealType[] = ["tea", "coffee", "wine", "juice", "drink"];

export function isDrinkMealType(mealType: MealType): boolean {
  return DRINK_TYPES.includes(mealType);
}

/** Time-of-day default label for non-drink meals — a drink is always
 * labeled by what it is (Tea/Coffee/Wine/Juice), never squashed into
 * "Snack" just because of the clock. */
function defaultMealTypeByTime(date: Date, timezone?: string): MealType {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone || "Asia/Kolkata" }).format(date)
  );
  if (hour >= 5 && hour < 10.5) return "breakfast";
  if (hour >= 10.5 && hour < 15.5) return "lunch";
  if (hour >= 15.5 && hour < 18.5) return "snack";
  if (hour >= 18.5 && hour < 22.5) return "dinner";
  return "snack";
}

/** Resolves the final label to show/save for a meal: drinks keep their
 * specific label (Tea, Coffee, Wine, Juice); everything else falls back to
 * a time-of-day default when the model didn't already say breakfast/lunch/
 * dinner/snack explicitly. */
export function resolveMealLabel(mealType: MealType, now: Date = new Date(), timezone?: string): MealType {
  if (isDrinkMealType(mealType)) return mealType;
  if (["breakfast", "lunch", "dinner", "snack"].includes(mealType)) return mealType;
  return defaultMealTypeByTime(now, timezone);
}

export function formatMealLabel(mealType: MealType): string {
  if (mealType === "other") return "meal";
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

// ---------------------------------------------------------------------------
// Response tone: small phrase pools instead of one repeated line.
// Selection is deterministic-but-varied (based on a seed derived from the
// conversation), not truly random, so it doesn't feel like dice rolls.
// ---------------------------------------------------------------------------

const CORRECTION_ACKS = [
  "Got it — updated.",
  "You're right — I've revised the estimate.",
  "Thanks, I'll use your correction.",
  "Okay, revised estimate:",
];

const SAVE_ACKS = ["Saved.", "Done — saved.", "Logged."];

const UNCERTAINTY_LEADS = [
  "I'm not fully sure, but this looks like:",
  "This looks like it may be:",
  "I may need your help with this one — I think it's:",
];

const PORTION_UNCERTAIN_LINES = [
  "Portion size is a little hard to judge from the photo.",
  "This looks like a small portion, but please correct me if there was more.",
  "I'm estimating only what's visible.",
  "I may need your help with the portion size.",
];

function seededPick(phrases: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return phrases[hash % phrases.length];
}

export function pickCorrectionAck(seed: string): string {
  return seededPick(CORRECTION_ACKS, seed);
}
export function pickSaveAck(seed: string): string {
  return seededPick(SAVE_ACKS, seed);
}
export function pickUncertaintyLead(seed: string): string {
  return seededPick(UNCERTAINTY_LEADS, seed);
}
export function pickPortionUncertainLine(seed: string): string {
  return seededPick(PORTION_UNCERTAIN_LINES, seed);
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

function foodLines(analysis: FoodAnalysisResult): string {
  return analysis.foods
    .map((f) => `- ${f.name} — ${f.visible_quantity || f.quantity}`)
    .join("\n");
}

function avgProtein(a: FoodAnalysisResult) {
  return Math.round((a.total_protein_min + a.total_protein_max) / 2);
}
function avgCal(a: FoodAnalysisResult) {
  return Math.round((a.total_calories_min + a.total_calories_max) / 2);
}

/** The one estimate/confirmation message used for every case: first-time
 * identification, a correction, or a low-confidence guess. Replaces the old
 * per-audience "What a lovely meal!" builders. */
export function buildEstimateMessage(
  analysis: FoodAnalysisResult,
  opts: { isCorrection?: boolean; seed: string }
): string {
  const protein = avgProtein(analysis);
  const cal = avgCal(analysis);
  const estimate = `Estimated: ${protein}g protein · ${cal} kcal.`;
  const portionFlag = needsPortionConfirmation(analysis);
  // A high-protein estimate that isn't clearly supported by the image gets
  // one extra check line before the usual Yes/correct prompt, instead of
  // being presented as if it were certain.
  const portionCheck = portionFlag
    ? `\n\n${pickPortionUncertainLine(opts.seed)}${
        protein > 50 ? " Was the protein portion larger than what's visible here?" : ""
      }`
    : "";

  if (opts.isCorrection) {
    const ack = pickCorrectionAck(opts.seed);
    return `${ack}\n\n${foodLines(analysis)}\n\n${estimate}${portionCheck}\n\nReply *Yes* to save, or tell me what else to change.`;
  }

  if (analysis.confidence === "low" || portionFlag) {
    const lead = pickUncertaintyLead(opts.seed);
    return `${lead}\n${foodLines(analysis)}\n\n${estimate}${portionCheck}\n\nReply *Yes* to save, or correct the food/portion.`;
  }

  return `I think this is:\n${foodLines(analysis)}\n\n${estimate}\n\nReply *Yes* to save, or tell me what to change.`;
}

export function buildClarificationMessage(seed: string): string {
  return "I couldn't identify this clearly. Is this tea, coffee, soup, or something else?";
}

/** Used when a correction strongly conflicts with what the photo looked
 * like (e.g. photo looked like tea, user says "wine") — one clarifying
 * question before saving, per the "user correction wins, but obvious
 * mismatches get one check" rule. */
export function buildContradictionCheckMessage(originalGuess: string, correctedTo: string): string {
  return `Got it — you're correcting this to ${correctedTo}. The photo looks like ${originalGuess}, so just checking: should I log this as ${correctedTo}?\n\nReply *Yes* to save as ${correctedTo}, or tell me the correct item.`;
}

export function buildSavedMessage(
  analysis: FoodAnalysisResult,
  resolvedLabel: MealType,
  opts: { seed: string; timezone?: string; dailyTotals?: { protein: number; calories: number; targetProteinG?: number } | null }
): string {
  const protein = avgProtein(analysis);
  const cal = avgCal(analysis);
  const label = formatMealLabel(resolvedLabel);

  let msg = `✅ Saved as ${label}.\n${protein}g protein · ${cal} kcal.`;

  if (opts.dailyTotals) {
    const { protein: totalProtein, calories: totalCalories, targetProteinG } = opts.dailyTotals;
    const proteinPart = targetProteinG ? `${totalProtein}g / ${targetProteinG}g protein` : `${totalProtein}g protein`;
    msg += `\n\nToday so far: ${proteinPart} · ${totalCalories.toLocaleString("en-IN")} kcal.`;
  }

  return msg;
}
