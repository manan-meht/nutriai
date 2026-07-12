import type { ClassifiedMeal } from "./food-classification";

// "Mood" drives color only — green/yellow/red map to
// "improving"/"steady"/"needs support", never to "good food"/"bad food".
export type TrendMood = "positive" | "neutral" | "attention";

export interface TrendCard {
  key: string;
  title: string;
  body: string;
  mood: TrendMood;
  hasEnoughData: boolean;
  footnote?: string;
}

export interface WeeklyFocusHabit {
  title: string;
  targetCount: number;
  currentCount: number;
}

export interface HabitMomentum {
  score: number; // 0-100, consistency-based, never a "diet score"
  headline: string;
  focus: string;
}

export type SpectrumPosition = "needs_support" | "getting_stronger" | "healthier_pattern";

export interface PatternSpectrum {
  position: SpectrumPosition;
  note: string;
}

export interface WeeklyProgressMetric {
  label: string;
  thisWeekLabel: string;
  changeLabel: string;
  mood: TrendMood;
}

export interface HabitDashboardData {
  proteinTrend: TrendCard;
  balancedPlateTrend: TrendCard;
  healthierDirectionTrend: TrendCard;
  weeklyFocus: WeeklyFocusHabit | null;
  habitMomentum: HabitMomentum;
  patternSpectrum: PatternSpectrum;
  weeklyProgress: WeeklyProgressMetric[];
}

const MS_DAY = 86_400_000;
const MIN_MEALS_FOR_COMPARISON = 3;

function splitWeeks(meals: ClassifiedMeal[]) {
  const now = Date.now();
  const thisWeek = meals.filter((m) => (now - new Date(m.loggedAt).getTime()) / MS_DAY <= 7);
  const lastWeek = meals.filter((m) => {
    const ago = (now - new Date(m.loggedAt).getTime()) / MS_DAY;
    return ago > 7 && ago <= 14;
  });
  return { thisWeek, lastWeek };
}

function fraction(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function moodFromDelta(delta: number, positiveAt = 0.08, negativeAt = -0.08): TrendMood {
  if (delta >= positiveAt) return "positive";
  if (delta <= negativeAt) return "attention";
  return "neutral";
}

export function buildHabitDashboard(allMeals: ClassifiedMeal[]): HabitDashboardData {
  const { thisWeek, lastWeek } = splitWeeks(allMeals);
  const hasComparison = lastWeek.length >= MIN_MEALS_FOR_COMPARISON;
  const hasAnyData = thisWeek.length > 0;

  // --- Card 1: Protein trend ---
  const proteinCountThis = thisWeek.filter((m) => m.proteinAnchorStatus !== "missing").length;
  const proteinCountLast = lastWeek.filter((m) => m.proteinAnchorStatus !== "missing").length;
  const proteinFracThis = fraction(proteinCountThis, thisWeek.length);
  const proteinFracLast = fraction(proteinCountLast, lastWeek.length);

  const proteinTrend: TrendCard = !hasAnyData
    ? placeholderCard("protein", "Protein")
    : !hasComparison
      ? {
          key: "protein",
          title: "Protein",
          body: `Protein appeared in ${proteinCountThis} of ${thisWeek.length} meals this week. Keep sharing meals for a few more days to see trends.`,
          mood: "neutral",
          hasEnoughData: false,
        }
      : (() => {
          const mood = moodFromDelta(proteinFracThis - proteinFracLast);
          const title =
            mood === "positive" ? "Protein is improving" : mood === "attention" ? "Protein is lower this week" : "Protein is steady";
          const body =
            mood === "positive"
              ? `Protein appeared in ${proteinCountThis} of ${thisWeek.length} meals, up from ${proteinCountLast} last week.`
              : mood === "attention"
                ? `Protein appeared less often this week. A simple next step: add curd, dal, eggs, paneer, tofu, fish, or chicken to one meal.`
                : `Protein has stayed similar this week. Try adding one protein anchor to breakfast.`;
          return { key: "protein", title, body, mood, hasEnoughData: true };
        })();

  // --- Card 2: Balanced plate trend ---
  const balancedCountThis = thisWeek.filter((m) => m.mealBalanceStatus !== "needs_support").length;
  const balancedCountLast = lastWeek.filter((m) => m.mealBalanceStatus !== "needs_support").length;
  const balancedFracThis = fraction(balancedCountThis, thisWeek.length);
  const balancedFracLast = fraction(balancedCountLast, lastWeek.length);

  const balancedPlateTrend: TrendCard = !hasAnyData
    ? placeholderCard("balance", "Balanced plates")
    : !hasComparison
      ? {
          key: "balance",
          title: "Balanced plates",
          body: `${balancedCountThis} of ${thisWeek.length} meals included protein or vegetables this week. Keep sharing meals to see trends.`,
          mood: "neutral",
          hasEnoughData: false,
        }
      : (() => {
          const mood = moodFromDelta(balancedFracThis - balancedFracLast);
          const title =
            mood === "positive" ? "More balanced plates" : mood === "attention" ? "Fewer balanced plates this week" : "Balanced plates are steady";
          const body =
            mood === "positive"
              ? `More meals included protein, vegetables, and carbs together compared with last week.`
              : mood === "attention"
                ? `Fewer meals looked complete this week. Start with one upgrade: add protein or vegetables to lunch.`
                : `Meal balance is steady. Try adding one vegetable, salad, fruit, dal, or curd to one meal.`;
          return { key: "balance", title, body, mood, hasEnoughData: true };
        })();

  // --- Card 3: Healthier direction trend ---
  const directionScore = (m: ClassifiedMeal) => {
    let s = 0;
    if (m.proteinAnchorStatus !== "missing") s += 1;
    if (m.vegetableFiberStatus !== "missing") s += 1;
    if (m.homeCookedLikelihood === "high") s += 1;
    if (m.ultraProcessedLikelihood !== "high") s += 1;
    if (!m.sugaryDrinkPresent) s += 1;
    return s / 5;
  };
  const avgDirectionThis = thisWeek.length ? thisWeek.reduce((s, m) => s + directionScore(m), 0) / thisWeek.length : 0;
  const avgDirectionLast = lastWeek.length ? lastWeek.reduce((s, m) => s + directionScore(m), 0) / lastWeek.length : 0;

  const healthierDirectionTrend: TrendCard = !hasAnyData
    ? placeholderCard("direction", "Moving in a healthier direction")
    : !hasComparison
      ? {
          key: "direction",
          title: "Moving in a healthier direction",
          body: "Keep sharing meals for a few more days to see trends. No food is bad — we look at the overall pattern.",
          mood: "neutral",
          hasEnoughData: false,
        }
      : (() => {
          const mood = moodFromDelta(avgDirectionThis - avgDirectionLast, 0.05, -0.05);
          const body =
            mood === "positive"
              ? "Your meals are moving in a healthier direction. More meals included home-cooked foods, protein, or fiber compared with last week. No food is bad — Tistra looks at the overall pattern."
              : mood === "attention"
                ? "This week needs a little support. No food is bad — try making the next meal stronger with protein or vegetables."
                : "Your overall pattern is steady. Keep sharing meals so Tistra can suggest one small improvement. No food is bad — Tistra looks at the overall pattern.";
          return { key: "direction", title: "Moving in a healthier direction", body, mood, hasEnoughData: true };
        })();

  // --- Weekly focus habit ---
  const breakfasts = thisWeek.filter((m) => m.mealType === "breakfast");
  const breakfastsWithProtein = breakfasts.filter((m) => m.proteinAnchorStatus !== "missing").length;
  const vegCountThis = thisWeek.filter((m) => m.vegetableFiberStatus !== "missing").length;
  const daysLoggedThisWeek = new Set(thisWeek.map((m) => m.loggedAt.slice(0, 10))).size;

  let weeklyFocus: WeeklyFocusHabit | null = null;
  if (hasAnyData) {
    if (proteinFracThis < 0.5) {
      weeklyFocus = { title: "Add protein to breakfast", targetCount: 4, currentCount: Math.min(breakfastsWithProtein, 4) };
    } else if (fraction(vegCountThis, thisWeek.length) < 0.5) {
      weeklyFocus = { title: "Add one vegetable or fiber food to lunch", targetCount: 4, currentCount: Math.min(vegCountThis, 4) };
    } else if (daysLoggedThisWeek < 5) {
      weeklyFocus = { title: "Share at least 2 meals per day", targetCount: 5, currentCount: daysLoggedThisWeek };
    } else {
      weeklyFocus = { title: "Keep up consistent, balanced meals", targetCount: 5, currentCount: 5 };
    }
  }

  // --- Habit Momentum ---
  const consistencyInputs = hasAnyData
    ? [
        proteinFracThis,
        fraction(vegCountThis, thisWeek.length),
        fraction(balancedCountThis, thisWeek.length),
        fraction(daysLoggedThisWeek, 7),
      ]
    : [];
  const baseScore = consistencyInputs.length
    ? Math.round((consistencyInputs.reduce((a, b) => a + b, 0) / consistencyInputs.length) * 100)
    : 0;
  const improvementBonus = hasComparison && avgDirectionThis > avgDirectionLast ? 5 : 0;
  const habitMomentumScore = Math.max(0, Math.min(100, baseScore + improvementBonus));

  const habitMomentum: HabitMomentum = {
    score: habitMomentumScore,
    headline: !hasAnyData
      ? "Share a few meals to start building momentum."
      : habitMomentumScore >= 70
        ? "Your meals are becoming more consistent."
        : habitMomentumScore >= 40
          ? "You're building steady habits."
          : "Let's build some momentum together.",
    focus: weeklyFocus ? `Focus this week: ${weeklyFocus.title.toLowerCase()}.` : "Keep sharing meals for personalized focus areas.",
  };

  // --- Pattern spectrum ---
  const position: SpectrumPosition =
    habitMomentumScore >= 70 ? "healthier_pattern" : habitMomentumScore >= 40 ? "getting_stronger" : "needs_support";
  const patternSpectrum: PatternSpectrum = {
    position,
    note: "Foods are not judged individually. Tistra looks at the overall pattern across meals.",
  };

  // --- Weekly progress board ---
  const homeCookedCountThis = thisWeek.filter((m) => m.homeCookedLikelihood === "high").length;
  const enjoymentCountThis = thisWeek.filter((m) => m.enjoymentFoodPresent).length;
  const daysLoggedLastWeek = new Set(lastWeek.map((m) => m.loggedAt.slice(0, 10))).size;

  const weeklyProgress: WeeklyProgressMetric[] = hasAnyData
    ? [
        boardMetric("Protein anchors", proteinCountThis, thisWeek.length, proteinCountLast, lastWeek.length, hasComparison),
        boardMetric("Balanced meals", balancedCountThis, thisWeek.length, balancedCountLast, lastWeek.length, hasComparison),
        boardMetric(
          "Vegetable/fiber meals",
          vegCountThis,
          thisWeek.length,
          lastWeek.filter((m) => m.vegetableFiberStatus !== "missing").length,
          lastWeek.length,
          hasComparison
        ),
        boardMetric(
          "Home-cooked meals",
          homeCookedCountThis,
          thisWeek.length,
          lastWeek.filter((m) => m.homeCookedLikelihood === "high").length,
          lastWeek.length,
          hasComparison
        ),
        {
          label: "Enjoyment foods",
          thisWeekLabel: `${enjoymentCountThis} time${enjoymentCountThis === 1 ? "" : "s"} this week`,
          changeLabel: "No food is bad — this is just for awareness.",
          mood: "neutral",
        },
        {
          label: "Meal sharing consistency",
          thisWeekLabel: `${daysLoggedThisWeek} of 7 days`,
          changeLabel: hasComparison
            ? daysLoggedThisWeek > daysLoggedLastWeek
              ? "Up from last week"
              : daysLoggedThisWeek < daysLoggedLastWeek
                ? "Lower than last week"
                : "Similar to last week"
            : "Not enough data yet",
          mood: hasComparison ? moodFromDelta((daysLoggedThisWeek - daysLoggedLastWeek) / 7, 0.05, -0.05) : "neutral",
        },
      ]
    : [];

  return {
    proteinTrend,
    balancedPlateTrend,
    healthierDirectionTrend,
    weeklyFocus,
    habitMomentum,
    patternSpectrum,
    weeklyProgress,
  };
}

function placeholderCard(key: string, title: string): TrendCard {
  return {
    key,
    title,
    body: "Keep sharing meals for a few more days to see trends.",
    mood: "neutral",
    hasEnoughData: false,
  };
}

function boardMetric(
  label: string,
  countThis: number,
  totalThis: number,
  countLast: number,
  totalLast: number,
  hasComparison: boolean
): WeeklyProgressMetric {
  const fracThis = fraction(countThis, totalThis);
  const fracLast = fraction(countLast, totalLast);
  const mood = hasComparison ? moodFromDelta(fracThis - fracLast) : "neutral";
  const changeLabel = !hasComparison
    ? "Not enough data yet"
    : mood === "positive"
      ? "Up from last week"
      : mood === "attention"
        ? "Lower than last week"
        : "Similar to last week";
  return {
    label,
    thisWeekLabel: `${countThis} of ${totalThis} meals`,
    changeLabel,
    mood,
  };
}
