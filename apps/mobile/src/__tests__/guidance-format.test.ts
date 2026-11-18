// Guidance's formatting, wording and setup-form helpers in the app.
// Imported by relative path, not "@/", because the root jest config maps
// "@/" to the WEB app's src.
import { compare, nutrientStats, summarizeDays } from "../lib/guidance-aggregation";
import {
  amount,
  assessmentText,
  clockTime,
  daySkipSlots,
  dayTotalsLine,
  dayValueText,
  isUnknownDay,
  estimate,
  fmt,
  foodsTitle,
  formatDay,
  greeting,
  habitNextText,
  localDate,
  longDate,
  mealSummaryLine,
  mealValues,
  mealValuesLine,
  mealWhen,
  microAmountText,
  nextMealSlot,
  progressHeadline,
  rangeText,
  viewerFor,
  weekdayShort,
} from "../lib/guidance-format";
import {
  hasRequiredDetails,
  initialSetupForm,
  personWords,
  setupFormToAnswers,
  validateSetupForm,
  type SetupFormState,
} from "../lib/guidance-setup-form";
import type { GuidanceMealRow } from "../lib/guidance-types";

const meal = (over: Partial<GuidanceMealRow> = {}): GuidanceMealRow => ({
  id: "m1",
  loggedAt: "2026-11-09T02:40:00Z", // 8:10 am in Kolkata
  mealType: "breakfast",
  foods: [{ name: "paratha", quantity: "2" }, { name: "egg bhurji", quantity: null }, { name: "milk", quantity: "1 glass" }],
  totalCaloriesMin: 700,
  totalCaloriesMax: 878,
  totalProteinMin: 28,
  totalProteinMax: 32,
  totalCarbsMin: null,
  totalCarbsMax: null,
  totalFatMin: 30,
  totalFatMax: null,
  totalFiberMin: null,
  totalFiberMax: 6,
  ...over,
});

describe("numbers", () => {
  it("groups thousands like en-US and keeps up to three decimals", () => {
    expect(fmt(1436)).toBe("1,436");
    expect(fmt(1234567.5)).toBe("1,234,567.5");
    expect(fmt(-2400)).toBe("-2,400");
    expect(fmt(0)).toBe("0");
  });

  it("rounds energy to 10 kcal and marks it as an estimate", () => {
    expect(estimate(789, "calories")).toBe("~790");
    expect(estimate(62.4, "protein")).toBe("62");
    expect(amount(1436, "calories")).toBe("1,436 kcal");
    expect(amount(95, "fiber")).toBe("95 g");
  });
});

describe("meals", () => {
  it("never turns a missing value into zero", () => {
    expect(mealValues(meal())).toEqual({ calories: 789, protein: 30, carbs: null, fat: 30, fiber: 6 });
    expect(mealValuesLine(meal())).toBe("Energy ~790 kcal · Protein 30 g · Carbs unknown · Fat 30 g · Fibre 6 g");
    expect(mealSummaryLine(meal({ totalProteinMin: null, totalProteinMax: null }))).toBe("Protein unknown · ~790 kcal");
  });

  it("names the foods the way the web does", () => {
    expect(foodsTitle(meal().foods)).toBe("Paratha, egg bhurji & milk");
    expect(foodsTitle([])).toBe("Logged meal");
  });

  it("reads times and dates in the person's timezone", () => {
    expect(clockTime("2026-11-09T02:40:00Z", "Asia/Kolkata")).toBe("8:10 am");
    expect(clockTime("2026-11-09T12:00:00Z", "Asia/Kolkata")).toBe("5:30 pm");
    expect(localDate("2026-11-09T20:00:00Z", "Asia/Kolkata")).toBe("2026-11-10");
    expect(localDate("2026-11-09T20:00:00Z", "Not/AZone")).toBe("2026-11-09");
    expect(mealWhen("2026-11-09T02:40:00Z", "2026-11-09", "Asia/Kolkata")).toBe("8:10 am");
    expect(mealWhen("2026-11-09T02:40:00Z", "2026-11-10", "Asia/Kolkata")).toBe("Mon 8:10 am");
  });
});

describe("dates", () => {
  it("matches the web's en-GB wording", () => {
    expect(longDate("2026-11-09")).toBe("Monday, 9 November");
    expect(rangeText("2026-11-02", "2026-11-08")).toBe("2–8 November");
    expect(rangeText("2026-10-26", "2026-11-01")).toBe("26 October – 1 November");
    expect(formatDay("2026-09-14")).toBe("Mon 14 Sept");
    expect(weekdayShort("2026-11-15")).toBe("Sun");
  });
});

describe("who is looking", () => {
  const guidance = { generatedAt: "2026-11-09T03:00:00Z", timezone: "Asia/Kolkata" }; // 8:30 am

  it("greets the person themselves, and names them to anyone else", () => {
    expect(greeting(guidance, { kind: "self" }, "Kamlesh")).toEqual({
      title: "Good morning, Kamlesh",
      subtitle: "Let's make your next meal count.",
    });
    expect(greeting(guidance, { kind: "family", name: "Kamlesh" }, "Kamlesh").title).toBe("Kamlesh's day");
  });

  it("is self only for a self contact", () => {
    expect(viewerFor({ fullName: "Kamlesh Mehta", isCoach: false, relationshipType: "self" })).toEqual({ kind: "self" });
    expect(viewerFor({ fullName: "Kamlesh Mehta", isCoach: false, relationshipType: "family_caregiver" })).toEqual({
      kind: "family",
      name: "Kamlesh",
    });
    expect(viewerFor({ fullName: "Asha Rao", isCoach: true })).toEqual({ kind: "coach", name: "Asha" });
  });

  it("picks the next meal by the person's clock", () => {
    expect(nextMealSlot("2026-11-09T03:00:00Z", "Asia/Kolkata")).toBe("breakfast");
    expect(nextMealSlot("2026-11-09T07:00:00Z", "Asia/Kolkata")).toBe("lunch");
    expect(nextMealSlot("2026-11-09T14:00:00Z", "Asia/Kolkata")).toBe("dinner");
  });
});

describe("progress wording", () => {
  const totals = (date: string, mealCount: number, protein: number) => {
    const n = (consumed: number, target: number) => ({ target, consumed, remaining: 0, over: 0, isIncomplete: false, mealsMissingData: 0 });
    return {
      date,
      loggedAt: `${date}T12:00:00`,
      totals: { date, mealCount, calories: n(1500, 1800), protein: n(protein, 90), carbs: n(1, 1), fat: n(1, 1), fiber: n(1, 1), hasIncompleteData: false },
    };
  };

  it("says when the week has a few complete days, and builds the stats from aggregation", () => {
    const days = summarizeDays(
      [totals("2026-11-11", 1, 20), totals("2026-11-10", 3, 80), totals("2026-11-09", 3, 70)],
      "2026-11-11",
      3
    ).sort((a, b) => a.date.localeCompare(b.date));
    expect(progressHeadline(days, "2026-11-11", { kind: "self" }, "week")).toBe("2 complete days so far");
    const stats = nutrientStats(days, "protein");
    const text = assessmentText(stats, compare(stats, nutrientStats([], "protein")), "protein", "week");
    expect(text.average).toBe("75 g");
    expect(text.change).toBe("–");
    expect(text.changeCaption).toBe("vs last week: needs 3 complete days in each");
    expect(text.sentence).toMatch(/^Protein averaged 75 g on fully logged days/);
  });

  it("shows a dash, never zero, with no complete days", () => {
    const stats = nutrientStats([], "protein");
    expect(assessmentText(stats, compare(stats, stats), "protein", "month")).toMatchObject({
      average: "–",
      sentence: "No fully logged days this month to assess protein yet.",
    });
  });

  it("suggests keeping a habit that's mostly working", () => {
    expect(habitNextText({ eligible: 6, successes: 5, unclear: 0, marks: [], noun: "breakfasts" })).toBe(
      "Keep the same habit next week, or choose a new one."
    );
    expect(habitNextText({ eligible: 0, successes: 0, unclear: 0, marks: [], noun: "breakfasts" })).toBe(
      "Log breakfasts this week to see how it's going."
    );
  });

  it("offers skips only for a recent past day's unlogged main meals", () => {
    const guidance = {
      date: "2026-11-11",
      timezone: "Asia/Kolkata",
      meals: [meal({ loggedAt: "2026-11-10T02:40:00Z", mealType: "breakfast" })],
      skips: [{ date: "2026-11-10", slot: "lunch" as const, confirmedVia: "caregiver" as const }],
    };
    expect(daySkipSlots("2026-11-10", guidance)).toEqual([
      { slot: "lunch", skipped: true },
      { slot: "dinner", skipped: false },
    ]);
    expect(daySkipSlots("2026-11-11", guidance)).toBeNull();
    expect(daySkipSlots("2026-11-01", guidance)).toBeNull();
  });

  it("calls a day's nutrient unknown when no meal reported it, and a floor when some did", () => {
    const n = (consumed: number, mealsMissingData: number) => ({
      target: 28,
      consumed,
      remaining: 0,
      over: 0,
      isIncomplete: mealsMissingData > 0,
      mealsMissingData,
    });
    expect(isUnknownDay(n(0, 2), 2)).toBe(true);
    expect(isUnknownDay(n(9, 1), 2)).toBe(false);
    // Nothing logged yet today is a real zero so far, not an unknown.
    expect(isUnknownDay(n(0, 0), 0)).toBe(false);
    expect(dayValueText(n(0, 2), "fiber", 2)).toBe("unknown");
    expect(dayValueText(n(9, 1), "fiber", 2)).toBe("at least 9");
    const totals = {
      date: "2026-11-10",
      mealCount: 2,
      calories: { ...n(1200, 0), target: 1436 },
      protein: { ...n(50, 0), target: 95 },
      carbs: { ...n(150, 0), target: 160 },
      fat: { ...n(40, 0), target: 48 },
      fiber: n(0, 2),
      hasIncompleteData: true,
    };
    expect(dayTotalsLine(totals)).toBe("Energy ~1,200 / 1,436 kcal · Protein 50 / 95 g · Carbs 150 / 160 g · Fat 40 / 48 g · Fibre unknown / 28 g");
  });

  it("writes an unknown vitamin or mineral amount as Unknown", () => {
    expect(microAmountText(null, "mg")).toBe("Unknown");
    expect(microAmountText(412, "mg", true)).toBe("at least 410 mg");
    expect(microAmountText(2.34, "µg")).toBe("2.3 µg");
  });
});

describe("setup form", () => {
  const filled = (over: Partial<SetupFormState> = {}): SetupFormState => ({
    ...initialSetupForm({ ageYears: 58, heightCm: 168, weightKg: 74, metabolicEquationSex: "male", goals: ["healthy_aging"] }),
    isPregnantOrBreastfeeding: "no",
    hasEatingDisorderHistory: "no",
    ...over,
  });

  it("prefills measurements but never the health questions", () => {
    const form = initialSetupForm({ ageYears: 58, allergies: ["peanuts", "shellfish"] });
    expect(form.ageYears).toBe("58");
    expect(form.allergies).toBe("peanuts, shellfish");
    expect(form.isPregnantOrBreastfeeding).toBe("");
    expect(form.hasEatingDisorderHistory).toBe("");
    expect(hasRequiredDetails(form)).toBe(false);
  });

  it("sends blanks as null, and lists split on commas", () => {
    const answers = setupFormToAnswers(filled({ hasEatingDisorderHistory: "", mealsPerDay: "", cuisines: " Thai, , South Indian " }));
    expect(answers).toMatchObject({
      ageYears: 58,
      isPregnantOrBreastfeeding: false,
      hasEatingDisorderHistory: null,
      mealsPerDay: null,
      cookingAccess: null,
      conditionsOrMedications: null,
      cuisines: ["Thai", "South Indian"],
    });
  });

  it("stops at the first unanswered or out-of-range question", () => {
    expect(validateSetupForm(filled())).toBeNull();
    expect(validateSetupForm(filled({ heightCm: "" }))?.field).toBe("details");
    expect(validateSetupForm(filled({ ageYears: "130" }))?.message).toBe("Age should be between 1 and 120 years.");
    expect(validateSetupForm(filled({ isPregnantOrBreastfeeding: "" }))?.field).toBe("health");
    expect(validateSetupForm(filled({ mealsPerDay: "9" }))?.field).toBe("preferences");
  });

  it("words the questions for whoever the targets are for", () => {
    expect(personWords({ isSelf: true }).pregnant).toBe("Are you pregnant or breastfeeding?");
    expect(personWords({ isSelf: false, name: "Asha" }).pregnant).toBe("Is Asha pregnant or breastfeeding?");
  });
});
