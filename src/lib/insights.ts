import { DEFAULT_DIETARY_PROFILE, DietaryProfile, getProteinFoodSuggestions } from "@/lib/dietary-profile";

export interface MealSnapshot {
  loggedAt: string;
  totalProteinMin: number;
  totalProteinMax: number;
  totalCaloriesMin: number;
  totalCaloriesMax: number;
}

export interface TrendInsights {
  headline: string;
  mood: "positive" | "neutral" | "attention";
  bullets: string[];
  // raw numbers for rendering
  avgProteinThisWeek: number;
  avgProteinLastWeek: number;
  avgCalThisWeek: number;
  avgCalLastWeek: number;
  daysLoggedThisWeek: number;
  daysLoggedLastWeek: number;
  proteinChangePct: number | null;
  calChangeAbs: number | null;
}

function avg(meals: MealSnapshot[], field: "protein" | "calories", days: number): number {
  if (!meals.length) return 0;
  const total = meals.reduce((s, m) => {
    const val =
      field === "protein"
        ? (m.totalProteinMin + m.totalProteinMax) / 2
        : (m.totalCaloriesMin + m.totalCaloriesMax) / 2;
    return s + val;
  }, 0);
  return Math.round(total / days);
}

export function computeInsights(
  meals: MealSnapshot[],
  opts?: { targetProteinG?: number; targetCaloriesMin?: number; product?: "gym" | "adults"; dietaryProfile?: DietaryProfile }
): TrendInsights | null {
  if (meals.length === 0) return null;

  const now = Date.now();
  const MS_DAY = 86400000;

  const thisWeek = meals.filter((m) => (now - new Date(m.loggedAt).getTime()) / MS_DAY <= 7);
  const lastWeek = meals.filter((m) => {
    const ago = (now - new Date(m.loggedAt).getTime()) / MS_DAY;
    return ago > 7 && ago <= 14;
  });

  const daysLoggedThisWeek = new Set(thisWeek.map((m) => m.loggedAt.slice(0, 10))).size;
  const daysLoggedLastWeek = new Set(lastWeek.map((m) => m.loggedAt.slice(0, 10))).size;

  const avgProteinThisWeek = avg(thisWeek, "protein", 7);
  const avgProteinLastWeek = avg(lastWeek, "protein", 7);
  const avgCalThisWeek = avg(thisWeek, "calories", 7);
  const avgCalLastWeek = avg(lastWeek, "calories", 7);

  const proteinChangePct =
    avgProteinLastWeek > 0
      ? Math.round(((avgProteinThisWeek - avgProteinLastWeek) / avgProteinLastWeek) * 100)
      : null;

  const calChangeAbs =
    avgCalLastWeek > 0 ? Math.round(avgCalThisWeek - avgCalLastWeek) : null;

  const isAdults = opts?.product === "adults";
  const targetProtein = opts?.targetProteinG;
  const targetCalMin = opts?.targetCaloriesMin;
  // Falls back to plant-based suggestions (dal, tofu, ...) for a brand-new
  // profile, per the "plant-based until observed otherwise" default —
  // never a hardcoded "egg" suggestion regardless of what this person
  // actually eats (see @/lib/dietary-profile's module docs).
  const proteinFoods = getProteinFoodSuggestions(opts?.dietaryProfile ?? DEFAULT_DIETARY_PROFILE);

  const bullets: string[] = [];

  // Protein insight
  if (proteinChangePct !== null && Math.abs(proteinChangePct) >= 5) {
    const dir = proteinChangePct > 0 ? "up" : "down";
    const pct = Math.abs(proteinChangePct);
    if (isAdults) {
      bullets.push(
        proteinChangePct > 0
          ? `Protein is up ${pct}% vs last week — the body is getting stronger fuel 💪`
          : `Protein is down ${pct}% vs last week — try adding ${proteinFoods.slice(0, 2).join(" or ")} to meals`
      );
    } else {
      bullets.push(
        proteinChangePct > 0
          ? `Protein ${dir} ${pct}% vs last week (${avgProteinThisWeek}g avg/day)`
          : `Protein ${dir} ${pct}% vs last week — focus on hitting the daily target`
      );
    }
  } else if (avgProteinThisWeek > 0) {
    if (targetProtein) {
      const pct = Math.round((avgProteinThisWeek / targetProtein) * 100);
      if (isAdults) {
        bullets.push(
          pct >= 90
            ? `Hitting protein goals well — ${avgProteinThisWeek}g avg per day 🎉`
            : `Protein at ${avgProteinThisWeek}g/day — target is ${targetProtein}g, a bit more protein-rich food would help`
        );
      } else {
        bullets.push(`Averaging ${avgProteinThisWeek}g protein/day — ${pct}% of the ${targetProtein}g target`);
      }
    } else {
      bullets.push(`Averaging ${avgProteinThisWeek}g protein per day this week`);
    }
  }

  // Calories insight
  if (calChangeAbs !== null && Math.abs(calChangeAbs) >= 100) {
    const dir = calChangeAbs > 0 ? "up" : "down";
    const abs = Math.abs(calChangeAbs);
    if (isAdults) {
      bullets.push(
        calChangeAbs > 0
          ? `Eating more this week (+${abs} kcal/day avg) — great to see! 🌟`
          : `Calorie intake is a little lower this week (${abs} kcal/day less) — make sure meals are filling enough`
      );
    } else {
      const vsTarget = targetCalMin
        ? avgCalThisWeek < targetCalMin
          ? ` — still below ${targetCalMin} kcal target`
          : ""
        : "";
      bullets.push(`Calories ${dir} ${abs} kcal/day vs last week${vsTarget}`);
    }
  } else if (targetCalMin && avgCalThisWeek > 0 && avgCalThisWeek < targetCalMin * 0.85) {
    bullets.push(
      isAdults
        ? `Calorie intake is on the lower side (${avgCalThisWeek} kcal avg) — encourage bigger portions`
        : `Averaging ${avgCalThisWeek} kcal/day — below the ${targetCalMin} kcal minimum target`
    );
  }

  // Consistency insight
  if (daysLoggedThisWeek > 0 && daysLoggedLastWeek > 0) {
    const diff = daysLoggedThisWeek - daysLoggedLastWeek;
    if (diff > 0) {
      bullets.push(
        isAdults
          ? `Logging more consistently — ${daysLoggedThisWeek} days this week vs ${daysLoggedLastWeek} last week 📈`
          : `More consistent this week: ${daysLoggedThisWeek} days logged vs ${daysLoggedLastWeek} last week`
      );
    } else if (diff < 0) {
      bullets.push(
        isAdults
          ? `Fewer meals logged this week (${daysLoggedThisWeek} days vs ${daysLoggedLastWeek}) — gentle reminder might help`
          : `Logging dipped to ${daysLoggedThisWeek} days this week vs ${daysLoggedLastWeek} last week`
      );
    }
  } else if (daysLoggedThisWeek >= 5) {
    bullets.push(
      isAdults ? `Logging every day this week — wonderful consistency! 🌟` : `Excellent — logged meals ${daysLoggedThisWeek} out of 7 days this week`
    );
  }

  // Headline and mood
  const positiveSignals =
    (proteinChangePct !== null && proteinChangePct >= 5 ? 1 : 0) +
    (calChangeAbs !== null && calChangeAbs >= 100 ? 1 : 0) +
    (daysLoggedThisWeek >= 5 ? 1 : 0) +
    (targetProtein && avgProteinThisWeek >= targetProtein * 0.9 ? 1 : 0);

  const negativeSignals =
    (proteinChangePct !== null && proteinChangePct <= -10 ? 1 : 0) +
    (daysLoggedThisWeek <= 2 ? 1 : 0) +
    (targetCalMin && avgCalThisWeek < targetCalMin * 0.8 ? 1 : 0);

  let mood: "positive" | "neutral" | "attention";
  let headline: string;

  if (negativeSignals >= 2) {
    mood = "attention";
    headline = isAdults ? "Needs a little attention this week" : "Needs attention — a few things to address";
  } else if (positiveSignals >= 2) {
    mood = "positive";
    headline = isAdults ? "Doing really well this week! 🌟" : "Strong week — trending in the right direction";
  } else {
    mood = "neutral";
    headline = isAdults ? "A steady week overall" : "Steady progress this week";
  }

  if (bullets.length === 0) {
    bullets.push(isAdults ? "Keep encouraging them to log every meal!" : "Log more meals to see detailed trends.");
  }

  return {
    headline,
    mood,
    bullets,
    avgProteinThisWeek,
    avgProteinLastWeek,
    avgCalThisWeek,
    avgCalLastWeek,
    daysLoggedThisWeek,
    daysLoggedLastWeek,
    proteinChangePct,
    calChangeAbs,
  };
}
