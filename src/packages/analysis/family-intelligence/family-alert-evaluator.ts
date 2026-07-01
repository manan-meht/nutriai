import type { ConfirmedMeal, FamilyMealInsight, AnalysisConfidence } from "@/types";

export interface FamilyAlertCandidate {
  alertType:
    | "meals_missing"
    | "portion_decline"
    | "low_appetite"
    | "protein_decline"
    | "hydration_decline"
    | "no_recent_activity";
  observedPattern: string;
  timePeriodDays: number;
  dataCompleteness: number;
  confidence: AnalysisConfidence;
  suggestedAction?: string;
}

export function evaluateFamilyAlerts(
  meals: ConfirmedMeal[],
  insights: FamilyMealInsight[],
  periodDays: number = 7
): FamilyAlertCandidate[] {
  const alerts: FamilyAlertCandidate[] = [];
  const now = new Date();
  const since = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const recentMeals = meals.filter((m) => new Date(m.loggedAt) >= since);
  const expectedMeals = periodDays * 2; // expect at least 2 logged per day
  const dataCompleteness = Math.min(recentMeals.length / expectedMeals, 1);

  // Only trigger alerts when there's sufficient data
  if (dataCompleteness < 0.4) return [];

  // Sustained missing meals — more than 2 consecutive days with no logs
  const daysBucket: Record<string, number> = {};
  for (const m of recentMeals) {
    const day = new Date(m.loggedAt).toDateString();
    daysBucket[day] = (daysBucket[day] ?? 0) + 1;
  }
  const daysWithMeals = Object.keys(daysBucket).length;
  const missedDays = periodDays - daysWithMeals;

  if (missedDays >= 3) {
    alerts.push({
      alertType: "meals_missing",
      observedPattern: `Meals appear to be missing on ${missedDays} out of the last ${periodDays} days.`,
      timePeriodDays: periodDays,
      dataCompleteness,
      confidence: missedDays >= 4 ? "medium" : "low",
      suggestedAction:
        "You might gently check in to see if everything is okay — sometimes logging just slips when life gets busy.",
    });
  }

  // Sustained low portions
  const portionSignals = insights.map((i) => i.quantitySignal).filter((s) => s !== "unknown");
  const lowerCount = portionSignals.filter((s) => s === "possibly_lower").length;
  if (portionSignals.length >= 5 && lowerCount / portionSignals.length >= 0.6) {
    alerts.push({
      alertType: "portion_decline",
      observedPattern: `Portions have appeared smaller than usual in ${lowerCount} of the last ${portionSignals.length} meals.`,
      timePeriodDays: periodDays,
      dataCompleteness,
      confidence: lowerCount / portionSignals.length >= 0.75 ? "medium" : "low",
      suggestedAction:
        "It may be worth gently asking how appetite has been this week.",
    });
  }

  // Repeated low appetite
  const appetiteSignals = insights.map((i) => i.appetiteSignal).filter((s) => s !== "unknown");
  const lowAppetiteCount = appetiteSignals.filter((s) => s === "low").length;
  if (appetiteSignals.length >= 4 && lowAppetiteCount >= 3) {
    alerts.push({
      alertType: "low_appetite",
      observedPattern: `Appetite has been reported as low on ${lowAppetiteCount} occasions this period.`,
      timePeriodDays: periodDays,
      dataCompleteness,
      confidence: "medium",
      suggestedAction:
        "A check-in call this week might be a good idea. If the pattern continues, consider speaking with a doctor or dietitian.",
    });
  }

  // No recent activity at all
  const latestMeal = recentMeals.sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
  )[0];
  if (!latestMeal) {
    const daysSinceLast = periodDays;
    if (daysSinceLast >= 4) {
      alerts.push({
        alertType: "no_recent_activity",
        observedPattern: `No meals have been shared in the last ${daysSinceLast} days.`,
        timePeriodDays: daysSinceLast,
        dataCompleteness: 0,
        confidence: "low",
        suggestedAction:
          "It may be that logging has simply paused. A gentle message to check in could be reassuring.",
      });
    }
  }

  return alerts;
}
