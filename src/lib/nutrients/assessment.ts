import { MICRO_KEYS, NUTRIENTS, type MicroKey, type NutrientKey } from "./catalog";
import { allFoods, nutrientPer100g, type CompositionFood } from "./composition";
import type { HouseholdFacts } from "./facts";
import { likelyLowEnabled } from "./flags";
import type { MealEstimate } from "./meal-estimate";
import type { ResolvedReference, UpperLimitForm } from "./references";

// Turns a period of days into one assessment per vitamin and mineral.
//
// The vocabulary is fixed, and nothing here may say more than the data
// supports:
//
//   within_range            the documented average reaches the reference
//                           (and stays under any upper limit). Tracked
//                           quietly; it doesn't confirm biological adequacy.
//   below_reference         a neutral comparison: the documented average is
//                           under the reference. Not a judgement. Below an
//                           AI in particular says nothing about inadequacy.
//   above_upper_limit       intake of the form the UL applies to is over it.
//                           Unknown, not "fine", when the form isn't known.
//   no_reliable_source      no food in well-documented meals gave a
//                           meaningful amount. The next step asks about
//                           overlooked foods, fortified products or
//                           supplements, rather than claiming a shortfall.
//   not_enough_information  too few documented days, too little coverage,
//                           or no reference for this person. Says what
//                           detail would help.
//   likely_low              a validated, nutrient-specific rule found a
//                           persistent shortfall. OFF: behind its own flag
//                           AND requires a configured rule, and none are
//                           configured until a qualified reviewer sets them.
//
// Days are the unit. A day counts toward an average ("documented") only if
// it was fully logged, every meal on it has an estimate, and the share of
// its food weight with a known value for the nutrient meets the configured
// minimum. Unlogged days, partial days and today never enter an average,
// and nothing unknown is ever summed as zero.

export const ASSESSMENT_VERSION = "micro-assess-v1";

export interface LikelyLowRule {
  /** Compare the documented average with this reference kind. */
  against: "EAR" | "RDA" | "AI";
  /** Flag when average < factor x reference. */
  factor: number;
  minDocumentedDays: number;
  minCoverage: number;
  /** Who set the rule and where it's documented. Required. */
  approvedBy: string;
  citation: string;
}

export const ASSESSMENT_CONFIG = {
  version: ASSESSMENT_VERSION,
  /** Fewer documented days than this and there's no assessment. */
  minDocumentedDays: 3,
  /** Share of a day's food weight that must have a known value for the
   * nutrient for the day to count. Days above this but under 1 make the
   * average a floor ("at least"). */
  minDayCoverage: 0.8,
  /** Fewer documented days than this on either side and no trend. */
  minComparableDays: 3,
  /** A "meaningful source" gives at least this share of the person's
   * reference in one serving. Borrowed from food labelling: 21 CFR
   * 101.54(c) lets a food be called a "good source" of a nutrient when one
   * reference serving gives 10–19% of its Daily Value. */
  meaningfulSourceShare: 0.1,
  /** Nutrient-specific "likely low" rules. Deliberately empty: a qualified
   * reviewer must set them. */
  likelyLowRules: {} as Partial<Record<MicroKey, LikelyLowRule>>,
};

export type AssessmentStatus =
  | "within_range"
  | "below_reference"
  | "above_upper_limit"
  | "no_reliable_source"
  | "not_enough_information"
  | "likely_low";

export type ClarificationKey = "milk_fortified" | "supplements_in_routine" | "iodised_salt" | "product_brand";

export type NextStep =
  | { kind: "clarify"; key: ClarificationKey; question: string; itemName?: string }
  | { kind: "food"; foods: Array<{ key: string; label: string; perPortion: number | null; portion: string | null }>; text: string }
  | { kind: "log"; text: string }
  | { kind: "profile"; text: string }
  | { kind: "none" };

// ─── Day inputs ──────────────────────────────────────────────────────────

export type LoggingStatus = "complete" | "partial" | "unlogged" | "in_progress";

export interface DayInput {
  /** Local date, YYYY-MM-DD, in the person's timezone. */
  date: string;
  loggingStatus: LoggingStatus;
  /** One entry per confirmed meal. null = no estimate stored for it. */
  meals: Array<MealEstimate | null>;
  /** Confirmed supplement doses that day, canonical units. Schedules never
   * appear here, only doses someone confirmed taking. */
  supplementDoses: Partial<Record<NutrientKey, number>>;
  /** Scheduled doses not confirmed that day (taken or not, nobody said). */
  unconfirmedScheduledDoses: number;
}

export interface DayNutrient {
  date: string;
  /** Sum over the day's meals; a floor when partial. null when nothing known. */
  food: number | null;
  foodIsFloor: boolean;
  /** Share of the day's weighed food grams with a known value. */
  coverage: number;
  /** Confirmed supplement doses. */
  supplements: number;
  documented: boolean;
  /** Why the day doesn't count, when it doesn't. */
  excludedBecause: "not_complete" | "in_progress" | "meal_without_estimate" | "low_coverage" | null;
  /** Food contributions by food, for "main sources". */
  contributions: Array<{ key: string; label: string; amount: number }>;
  /** The largest amount one food gave in one meal that day. */
  largestServing: number;
}

const ROUND = (n: number) => Math.round(n * 1000) / 1000;

function componentLabel(c: MealEstimate["items"][number]["components"][number]): { key: string; label: string } {
  if (c.product) return { key: `product:${c.product.id}`, label: c.product.brand ? `${c.product.brand} ${c.product.name}` : c.product.name };
  if (c.food) return { key: c.food.key, label: c.name };
  return { key: `unmatched:${c.name}`, label: c.name };
}

/** One nutrient for one day. */
export function dayNutrient(day: DayInput, nutrient: NutrientKey, config = ASSESSMENT_CONFIG): DayNutrient {
  let food = 0;
  let anyKnown = false;
  let floor = false;
  let weighedGrams = 0;
  let knownGrams = 0;
  const contributions = new Map<string, { key: string; label: string; amount: number }>();
  let largestServing = 0;
  for (const meal of day.meals) {
    if (!meal) {
      floor = true;
      continue;
    }
    const n = meal.nutrients[nutrient];
    if (n.state === "unknown") floor = true;
    else {
      anyKnown = true;
      food += n.amount ?? 0;
      if (n.state === "partial") floor = true;
    }
    for (const item of meal.items) {
      for (const c of item.components) {
        if (c.grams == null) continue;
        weighedGrams += c.grams;
        const amount = c.amounts[nutrient];
        if (amount != null || c.trace.includes(nutrient)) knownGrams += c.grams;
        if (amount != null && amount > 0) {
          largestServing = Math.max(largestServing, amount);
          const { key, label } = componentLabel(c);
          const prev = contributions.get(key);
          if (prev) prev.amount += amount;
          else contributions.set(key, { key, label, amount });
        }
      }
    }
  }
  const coverage = weighedGrams > 0 ? knownGrams / weighedGrams : 0;
  const supplements = day.supplementDoses[nutrient] ?? 0;
  let excludedBecause: DayNutrient["excludedBecause"] = null;
  if (day.loggingStatus === "in_progress") excludedBecause = "in_progress";
  else if (day.loggingStatus !== "complete") excludedBecause = "not_complete";
  else if (day.meals.some((m) => m == null)) excludedBecause = "meal_without_estimate";
  else if (!anyKnown || coverage < config.minDayCoverage) excludedBecause = "low_coverage";
  return {
    date: day.date,
    food: anyKnown ? ROUND(food) : null,
    foodIsFloor: floor || coverage < 1,
    coverage: Math.round(coverage * 1000) / 1000,
    supplements: ROUND(supplements),
    documented: excludedBecause == null,
    excludedBecause,
    contributions: [...contributions.values()].map((c) => ({ ...c, amount: ROUND(c.amount) })),
    largestServing: ROUND(largestServing),
  };
}

// ─── Period assessment ───────────────────────────────────────────────────

export interface PeriodStats {
  documentedDays: number;
  totalDays: number;
  /** Mean of food totals over documented days. */
  foodAverage: number | null;
  foodAverageIsFloor: boolean;
  /** Mean of confirmed supplement doses over the same days. */
  supplementAverage: number | null;
  /** Mean of food + confirmed supplements. */
  totalAverage: number | null;
  /** Largest single-meal amount from one food on documented days. */
  largestServing: number | null;
}

export function periodStats(days: DayNutrient[]): PeriodStats {
  const documented = days.filter((d) => d.documented);
  const n = documented.length;
  const mean = (f: (d: DayNutrient) => number) => (n === 0 ? null : ROUND(documented.reduce((s, d) => s + f(d), 0) / n));
  const foodAverage = mean((d) => d.food ?? 0);
  const supplementAverage = mean((d) => d.supplements);
  return {
    documentedDays: n,
    totalDays: days.length,
    foodAverage,
    foodAverageIsFloor: documented.some((d) => d.foodIsFloor),
    supplementAverage,
    totalAverage: foodAverage == null ? null : ROUND(foodAverage + (supplementAverage ?? 0)),
    largestServing: n === 0 ? null : Math.max(0, ...documented.map((d) => d.largestServing)),
  };
}

export type Trend =
  | { kind: "insufficient"; currentDays: number; previousDays: number; required: number }
  | { kind: "change"; current: number; previous: number; delta: number; currentDays: number; previousDays: number };

export function trendFor(current: PeriodStats, previous: PeriodStats, required = ASSESSMENT_CONFIG.minComparableDays): Trend {
  if (current.documentedDays < required || previous.documentedDays < required || current.totalAverage == null || previous.totalAverage == null) {
    return { kind: "insufficient", currentDays: current.documentedDays, previousDays: previous.documentedDays, required };
  }
  return {
    kind: "change",
    current: current.totalAverage,
    previous: previous.totalAverage,
    delta: ROUND(current.totalAverage - previous.totalAverage),
    currentDays: current.documentedDays,
    previousDays: previous.documentedDays,
  };
}

export interface MicronutrientAssessment {
  nutrient: MicroKey;
  label: string;
  unit: string;
  status: AssessmentStatus;
  period: { start: string; end: string };
  days: { documented: number; total: number };
  food: { average: number | null; isFloor: boolean };
  supplements: { average: number | null; unconfirmedScheduledDoses: number };
  total: number | null;
  reference: ResolvedReference["target"];
  upperLimit: ResolvedReference["upperLimit"];
  /** total / reference, as a whole percentage. null without both. */
  percentOfReference: number | null;
  trend: Trend;
  mainSources: Array<{ key: string; label: string; share: number }>;
  observation: string;
  nextStep: NextStep;
  explanation: string;
  /** Used for ranking concerns. */
  evidence: number;
}

export interface AssessInput {
  period: { start: string; end: string };
  days: DayInput[];
  previousDays: DayInput[];
  references: Record<MicroKey, ResolvedReference>;
  household: HouseholdFacts;
  diet?: { vegetarian?: boolean; eggs?: boolean };
}

const fmt = (n: number, nutrient: MicroKey) => {
  const unit = NUTRIENTS[nutrient].unitLabel;
  const rounded = n >= 100 ? Math.round(n / 5) * 5 : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded.toLocaleString("en-US")} ${unit}`;
};

const MEAT_WORDS = /chicken|lamb|goat|beef|fish|shrimp|tuna|sardine|salmon|mackerel|pompano|tilapia|biryani_meat|keema/;

/** Foods rich in a nutrient per typical portion, from the composition data,
 * for a "food" next step. Values are per the source's own household
 * measure; nothing is invented. */
export function foodIdeas(nutrient: MicroKey, diet: AssessInput["diet"] = {}, limit = 3): Array<{ key: string; label: string; perPortion: number | null; portion: string | null }> {
  const candidates = allFoods().filter((f: CompositionFood) => {
    if (["fat", "spice", "sweet"].includes(f.group)) return false;
    if (diet.vegetarian && MEAT_WORDS.test(f.key)) return false;
    if (diet.vegetarian && !diet.eggs && f.key.startsWith("egg")) return false;
    return nutrientPer100g(f, nutrient).state === "value" && (f.aliases?.length ?? 0) > 0;
  });
  const scored = candidates.map((f) => {
    const per100 = nutrientPer100g(f, nutrient);
    const amount = per100.state === "value" ? per100.amount : 0;
    const portion = f.portions?.find((p) => /cup|piece|large|medium|slice/.test(p.label)) ?? null;
    const perPortion = portion ? Math.round(((amount * portion.grams) / 100) * 10) / 10 : null;
    const label = (f.aliases.find((a) => !a.startsWith("~")) ?? f.description).replace(/^./, (c) => c.toUpperCase());
    return { key: f.key, label, perPortion, portion: portion?.label ?? null, rank: perPortion ?? amount };
  });
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.rank - a.rank)
    .filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)))
    .slice(0, limit)
    .map(({ key, label, perPortion, portion }) => ({ key, label, perPortion, portion }));
}

const CLARIFICATION_QUESTIONS: Record<ClarificationKey, string> = {
  milk_fortified: "Is the milk you usually drink fortified with vitamins A and D? It says so on the packet.",
  supplements_in_routine: "Do you take any vitamin or mineral supplements?",
  iodised_salt: "Do you cook with iodised salt?",
  product_brand: "Which brand is this product? A photo of the label helps.",
};

function ulComparable(
  appliesTo: UpperLimitForm,
  nutrient: MicroKey,
  stats: PeriodStats,
  formStats: { retinol: PeriodStats; folicAcid: PeriodStats }
): { amount: number | null; knownForm: boolean } {
  switch (appliesTo) {
    case "supplemental":
      return { amount: stats.supplementAverage, knownForm: true };
    case "preformed_retinol":
      return { amount: formStats.retinol.documentedDays > 0 ? formStats.retinol.totalAverage : null, knownForm: formStats.retinol.documentedDays > 0 };
    case "folic_acid":
      return { amount: formStats.folicAcid.documentedDays > 0 ? formStats.folicAcid.totalAverage : null, knownForm: formStats.folicAcid.documentedDays > 0 };
    default:
      return { amount: stats.totalAverage, knownForm: nutrient !== "iodine" };
  }
}

function mealsMention(days: DayInput[], test: (key: string) => boolean): boolean {
  return days.some((d) => d.meals.some((m) => m?.items.some((i) => i.components.some((c) => c.food && test(c.food.key)))));
}

function fortificationUnknownIn(days: DayInput[]): boolean {
  return days.some((d) => d.meals.some((m) => m?.reasons.includes("milk_fortification_unknown")));
}

/** Assess every vitamin and mineral for one period. Pure. */
export function assessMicronutrients(input: AssessInput, config = ASSESSMENT_CONFIG): MicronutrientAssessment[] {
  const out: MicronutrientAssessment[] = [];
  const formDays = (key: NutrientKey, days: DayInput[]) => periodStats(days.map((d) => dayNutrient(d, key, config)));
  const formStats = { retinol: formDays("retinol", input.days), folicAcid: formDays("folic_acid", input.days) };
  const unconfirmed = input.days.reduce((s, d) => s + d.unconfirmedScheduledDoses, 0);

  for (const nutrient of MICRO_KEYS) {
    const label = NUTRIENTS[nutrient].label;
    const unit = NUTRIENTS[nutrient].unitLabel;
    const ref = input.references[nutrient];
    const days = input.days.map((d) => dayNutrient(d, nutrient, config));
    const stats = periodStats(days);
    const trend = trendFor(stats, periodStats(input.previousDays.map((d) => dayNutrient(d, nutrient, config))), config.minComparableDays);
    const target = ref?.target ?? null;
    const upperLimit = ref?.upperLimit ?? null;
    const percent = target && stats.totalAverage != null ? Math.round((stats.totalAverage / target.amount) * 100) : null;

    // Main sources over documented days.
    const byFood = new Map<string, { key: string; label: string; amount: number }>();
    for (const d of days.filter((x) => x.documented)) {
      for (const c of d.contributions) {
        const prev = byFood.get(c.key);
        if (prev) prev.amount += c.amount;
        else byFood.set(c.key, { key: c.key, label: c.label, amount: c.amount });
      }
    }
    const totalContrib = [...byFood.values()].reduce((s, c) => s + c.amount, 0);
    const mainSources = [...byFood.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map((c) => ({ key: c.key, label: c.label, share: totalContrib > 0 ? Math.round((c.amount / totalContrib) * 100) / 100 : 0 }));

    const atLeast = stats.foodAverageIsFloor ? "at least " : "";
    const documentedText = `${stats.documentedDays} of ${stats.totalDays} ${stats.totalDays === 1 ? "day" : "days"}`;
    let status: AssessmentStatus;
    let observation: string;
    let nextStep: NextStep = { kind: "none" };
    const notes: string[] = [];

    const milkLogged = mealsMention(input.days, (k) => k.startsWith("milk_"));
    const supplementsUnknown = !input.household.supplements_in_routine || input.household.supplements_in_routine === "unsure";

    if (nutrient === "iodine") {
      status = "not_enough_information";
      observation = "Iodine can't be estimated from photos: it depends on the salt and packaged foods used.";
      nextStep = input.household.iodised_salt && input.household.iodised_salt !== "unsure"
        ? { kind: "none" }
        : { kind: "clarify", key: "iodised_salt", question: CLARIFICATION_QUESTIONS.iodised_salt };
      if (input.household.iodised_salt === "yes") notes.push("Iodised salt is used at home; how much isn't known, so no amount is estimated.");
    } else if (!target) {
      status = "not_enough_information";
      const profileNote = ref?.notes.find((n) => /^Age is needed|sex isn't recorded/.test(n));
      if (profileNote) {
        observation = `There's no reference value to compare ${label.toLowerCase()} against until the profile is complete.`;
        nextStep = { kind: "profile", text: profileNote };
      } else {
        observation = `No reference value for ${label.toLowerCase()} is recorded for this person's reference set yet, so intake isn't compared.`;
        if (ref?.notes[0]) notes.push(ref.notes[0]);
      }
    } else if (stats.documentedDays < config.minDocumentedDays) {
      status = "not_enough_information";
      observation = `Only ${documentedText} had enough detail to estimate ${label.toLowerCase()}.`;
      const reasons = days.map((d) => d.excludedBecause).filter(Boolean);
      const coverageIssue = reasons.filter((r) => r === "low_coverage").length > reasons.filter((r) => r === "not_complete").length;
      if ((nutrient === "vitamin_d" || nutrient === "vitamin_a") && milkLogged && fortificationUnknownIn(input.days) && !input.household.milk_fortified) {
        nextStep = { kind: "clarify", key: "milk_fortified", question: CLARIFICATION_QUESTIONS.milk_fortified };
      } else {
        nextStep = coverageIssue
          ? { kind: "log", text: "Name what's in mixed dishes when you log them, so each ingredient can be counted." }
          : { kind: "log", text: `Log every meal on at least ${config.minDocumentedDays} days.` };
      }
    } else {
      const ul = upperLimit ? ulComparable(upperLimit.appliesTo, nutrient, stats, formStats) : null;
      const rule = config.likelyLowRules[nutrient];
      const largestShare = stats.largestServing != null ? stats.largestServing / target.amount : 0;
      if (upperLimit && ul?.amount != null && ul.amount > upperLimit.amount) {
        status = "above_upper_limit";
        const what =
          upperLimit.appliesTo === "supplemental"
            ? `from supplements`
            : upperLimit.appliesTo === "preformed_retinol"
              ? "of preformed vitamin A (retinol)"
              : upperLimit.appliesTo === "folic_acid"
                ? "of folic acid"
                : "";
        observation = `Estimated intake ${what ? `${what} ` : ""}averaged about ${fmt(ul.amount, nutrient)} a day on ${documentedText}, above the ${fmt(upperLimit.amount, nutrient)} upper limit.`;
        nextStep = { kind: "clarify", key: "supplements_in_routine", question: "Which supplements are you taking, and how often? A label photo helps." };
      } else if (
        rule &&
        likelyLowEnabled() &&
        stats.documentedDays >= rule.minDocumentedDays &&
        !stats.foodAverageIsFloor &&
        stats.totalAverage != null &&
        (() => {
          const base = rule.against === "EAR" ? ref.ear?.amount : target.amount;
          return base != null && stats.totalAverage < rule.factor * base;
        })()
      ) {
        status = "likely_low";
        observation = `Estimated ${label.toLowerCase()} has been consistently under the reference on ${documentedText}.`;
        nextStep = { kind: "food", foods: foodIdeas(nutrient, input.diet), text: `Foods that add ${label.toLowerCase()}` };
      } else if (stats.totalAverage != null && stats.totalAverage >= target.amount) {
        status = "within_range";
        observation = `Estimated ${label.toLowerCase()} averaged ${atLeast}about ${fmt(stats.totalAverage, nutrient)} a day on ${documentedText}, at or above the ${fmt(target.amount, nutrient)} reference.`;
      } else if (largestShare < config.meaningfulSourceShare) {
        status = "no_reliable_source";
        observation = `No food in the ${documentedText} with full detail gave a meaningful amount of ${label.toLowerCase()}.`;
        if ((nutrient === "vitamin_d" || nutrient === "vitamin_b12" || nutrient === "vitamin_a") && milkLogged && !input.household.milk_fortified) {
          nextStep = { kind: "clarify", key: "milk_fortified", question: CLARIFICATION_QUESTIONS.milk_fortified };
        } else if (supplementsUnknown) {
          nextStep = { kind: "clarify", key: "supplements_in_routine", question: CLARIFICATION_QUESTIONS.supplements_in_routine };
        } else {
          nextStep = { kind: "food", foods: foodIdeas(nutrient, input.diet), text: `Foods that add ${label.toLowerCase()}` };
        }
      } else {
        status = "below_reference";
        observation = `Estimated ${label.toLowerCase()} averaged ${atLeast}about ${fmt(stats.totalAverage ?? 0, nutrient)} a day on ${documentedText}, ${
          percent != null ? `about ${percent}% of` : "under"
        } the ${fmt(target.amount, nutrient)} reference.`;
        nextStep = { kind: "food", foods: foodIdeas(nutrient, input.diet), text: `Foods that add ${label.toLowerCase()}` };
      }
      if (ul && upperLimit && !ul.knownForm) {
        notes.push(`The upper limit applies to ${upperLimit.appliesTo.replace(/_/g, " ")} only, which isn't known separately here, so it wasn't checked.`);
      }
    }

    const explanation = [
      target
        ? `Compared with the ${target.kind === "AI" ? "Adequate Intake (AI)" : "Recommended Dietary Allowance (RDA)"} of ${fmt(target.amount, nutrient)} a day for ${target.lifeStage} (${
            target.edition === "icmr-nin-2020" ? "ICMR-NIN 2020" : "NASEM DRI"
          }).`
        : null,
      target?.kind === "AI" ? "An AI is set where evidence wasn't enough for an RDA; being under it doesn't mean intake is inadequate." : null,
      upperLimit
        ? `Upper limit: ${fmt(upperLimit.amount, nutrient)}${upperLimit.appliesTo === "total" ? "" : ` (${upperLimit.appliesTo.replace(/_/g, " ")} only)`}${
            upperLimit.fallbackFrom ? ", from NASEM because the person's own reference set has none recorded here" : ""
          }.`
        : null,
      `Only fully logged days where at least ${Math.round(config.minDayCoverage * 100)}% of the food could be matched to composition data count. Unlogged days aren't counted as zero.`,
      stats.foodAverageIsFloor ? "Some of the food on those days had no value for this nutrient, so the figure is a minimum." : null,
      unconfirmed > 0 ? `${unconfirmed} scheduled supplement ${unconfirmed === 1 ? "dose wasn't" : "doses weren't"} confirmed and aren't counted.` : null,
      ...notes,
      "These are estimates from photos and food composition tables, not a diagnosis.",
    ]
      .filter(Boolean)
      .join(" ");

    out.push({
      nutrient,
      label,
      unit,
      status,
      period: input.period,
      days: { documented: stats.documentedDays, total: stats.totalDays },
      food: { average: stats.foodAverage, isFloor: stats.foodAverageIsFloor },
      supplements: { average: stats.supplementAverage, unconfirmedScheduledDoses: unconfirmed },
      total: stats.totalAverage,
      reference: target,
      upperLimit,
      percentOfReference: percent,
      trend,
      mainSources,
      observation,
      nextStep,
      explanation,
      evidence: stats.documentedDays,
    });
  }
  return out;
}

const RANK: Record<AssessmentStatus, number> = {
  above_upper_limit: 0,
  likely_low: 1,
  no_reliable_source: 2,
  below_reference: 3,
  not_enough_information: 4,
  within_range: 9,
};

/**
 * The one or two concerns worth showing, ranked by evidence and
 * usefulness. Safety first (above an upper limit), then evidence-backed
 * gaps, then clarifications that would sharpen an estimate. A neutral
 * "below reference" only counts when its figure is a real average, not a
 * floor. Two concerns with the same next step are one concern.
 */
export function topConcerns(assessments: MicronutrientAssessment[], n = 2): MicronutrientAssessment[] {
  const eligible = assessments.filter((a) => {
    if (a.status === "within_range") return false;
    if (a.status === "below_reference") return !a.food.isFloor;
    if (a.status === "not_enough_information") return a.nextStep.kind === "clarify" && a.nextStep.key !== "iodised_salt";
    return true;
  });
  const ranked = eligible.sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      b.evidence - a.evidence ||
      (a.percentOfReference ?? 100) - (b.percentOfReference ?? 100) ||
      a.nutrient.localeCompare(b.nutrient)
  );
  const seen = new Set<string>();
  const out: MicronutrientAssessment[] = [];
  for (const a of ranked) {
    const key = a.nextStep.kind === "clarify" ? `clarify:${a.nextStep.key}` : `nutrient:${a.nutrient}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= n) break;
  }
  return out;
}

const PACKAGED_WORDS = /\b(biscuit|biscuits|cookie|cookies|cereal|cornflakes|muesli|granola|protein bar|bar|chips|namkeen|packet|packaged|instant|noodles cup|health drink|horlicks|bournvita|complan|protein powder|whey)\b/;

/**
 * The single question most worth asking next, or null. Only questions
 * whose answer changes an estimate: whether the milk logged is fortified
 * (vitamins A and D), whether supplements are part of the routine (when a
 * gap or missing source was found), the brand of a packaged product that
 * couldn't be matched, and, last, iodised salt. Never one already
 * answered, or one in `alreadyAsked`.
 */
export function nextClarification(
  input: { days: DayInput[]; household: HouseholdFacts; assessments: MicronutrientAssessment[] },
  alreadyAsked: ReadonlySet<ClarificationKey> = new Set()
): Extract<NextStep, { kind: "clarify" }> | null {
  const answered = (k: "milk_fortified" | "supplements_in_routine" | "iodised_salt") => {
    const v = input.household[k];
    return v === "yes" || v === "no";
  };
  if (!alreadyAsked.has("milk_fortified") && !answered("milk_fortified") && fortificationUnknownIn(input.days)) {
    return { kind: "clarify", key: "milk_fortified", question: CLARIFICATION_QUESTIONS.milk_fortified };
  }
  const gap = input.assessments.some((a) => a.status === "no_reliable_source" || (a.status === "below_reference" && !a.food.isFloor));
  if (!alreadyAsked.has("supplements_in_routine") && !answered("supplements_in_routine") && gap) {
    return { kind: "clarify", key: "supplements_in_routine", question: CLARIFICATION_QUESTIONS.supplements_in_routine };
  }
  if (!alreadyAsked.has("product_brand")) {
    for (const d of input.days) {
      for (const m of d.meals) {
        const item = m?.items.find((i) => i.origin === "unmatched" && PACKAGED_WORDS.test(i.name.toLowerCase()));
        if (item) return { kind: "clarify", key: "product_brand", question: CLARIFICATION_QUESTIONS.product_brand, itemName: item.name };
      }
    }
  }
  if (!alreadyAsked.has("iodised_salt") && !answered("iodised_salt") && input.days.some((d) => d.meals.some(Boolean))) {
    return { kind: "clarify", key: "iodised_salt", question: CLARIFICATION_QUESTIONS.iodised_salt };
  }
  return null;
}
