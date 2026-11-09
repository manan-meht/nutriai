import type { SupabaseClient } from "@supabase/supabase-js";

import { localDate } from "@/lib/guidance/daily-totals";

import { MICRO_KEYS } from "./catalog";
import {
  assessMicronutrients,
  ASSESSMENT_CONFIG,
  nextClarification,
  topConcerns,
  type DayInput,
  type LoggingStatus,
  type MicronutrientAssessment,
  type NextStep,
} from "./assessment";
import type { HouseholdFacts } from "./facts";
import { likelyLowEnabled, micronutrientsEnabled } from "./flags";
import type { MealEstimate } from "./meal-estimate";
import { loadEstimates } from "./pipeline";
import { editionFor, marketFor, resolveReferences, type ResolvedReference, type Sex } from "./references";
import { loadHouseholdFacts, loadSupplements, mealLogSubjectColumn, supplementTotalsByDate, type Subject, type SupplementSchedule } from "./store";

// Everything the vitamins-and-minerals screens need for one period, in one
// load: day-level data, one assessment per nutrient, the one or two
// concerns worth showing, the next clarifying question, and which
// reference edition was used.
//
// Day statuses can be passed in from the Progress tab's own aggregation
// (`loggingStatus`, from src/lib/guidance/aggregation.ts summarizeDays,
// which also counts meals confirmed skipped), so the vitamins card and the
// protein chart beside it agree on which days were complete. Without it,
// a meal-count rule is applied here (see loggingStatusFor).

export interface MicronutrientPerson {
  sex: Sex | null;
  ageYears: number | null;
  pregnant?: boolean | null;
  lactating?: boolean | null;
  whatsappNumber?: string | null;
  vegetarian?: boolean;
  eatsEggs?: boolean;
}

export interface LoadMicronutrientParams {
  contactType: Subject["contactType"];
  contactId: string;
  /** Local dates, inclusive. end is normally today. */
  start: string;
  end: string;
  /** The period before, for trends. */
  previous: { start: string; end: string };
  timezone: string;
  /** Today in the person's timezone. */
  today: string;
  person: MicronutrientPerson;
  expectedMealsPerDay: number;
  /** The day's status from the shared aggregation service (summarizeDays,
   * which also counts meals confirmed skipped), so these days agree with
   * every other Progress card. Used whenever it returns a value; otherwise
   * the meal-count rule in loggingStatusFor applies. */
  loggingStatus?: (date: string) => LoggingStatus | null;
  /** Clarifications already asked recently, to avoid repeating them. */
  alreadyAsked?: ReadonlySet<NonNullable<Extract<NextStep, { kind: "clarify" }>["key"]>>;
}

export type MicronutrientView =
  | { enabled: false }
  | {
      enabled: true;
      period: { start: string; end: string };
      days: DayInput[];
      assessments: MicronutrientAssessment[];
      concerns: MicronutrientAssessment[];
      clarification: Extract<NextStep, { kind: "clarify" }> | null;
      references: Record<string, ResolvedReference>;
      edition: { id: string; name: string; version: string; reviewStatus: string; urls: string[] };
      household: HouseholdFacts;
      supplements: SupplementSchedule[];
      likelyLowEnabled: boolean;
      configVersion: string;
    };

/** The fallback day rule, by meal count alone: today in progress, nothing
 * logged unlogged, fewer meals than usual partial. summarizeDays in
 * src/lib/guidance/aggregation.ts also counts meals confirmed skipped;
 * callers with those statuses pass them as `loggingStatus`. */
export function loggingStatusFor(mealCount: number, date: string, today: string, expectedMealsPerDay: number): LoggingStatus {
  if (date === today) return "in_progress";
  if (mealCount === 0) return "unlogged";
  return mealCount < Math.max(1, expectedMealsPerDay) ? "partial" : "complete";
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < 400; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > end) break;
    out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function loadMicronutrientPeriod(db: SupabaseClient, params: LoadMicronutrientParams): Promise<MicronutrientView> {
  if (!micronutrientsEnabled()) return { enabled: false };
  const subject: Subject = { contactType: params.contactType, contactId: params.contactId };
  const earliest = params.previous.start < params.start ? params.previous.start : params.start;
  // A day of margin either side of the local range; filtered by local date below.
  const sinceIso = new Date(Date.parse(`${earliest}T00:00:00Z`) - 24 * 3600 * 1000).toISOString();

  const { data: mealRows, error } = await db
    .from("meal_logs")
    .select("id, logged_at")
    .eq(mealLogSubjectColumn(params.contactType), params.contactId)
    .gte("logged_at", sinceIso);
  if (error) throw new Error("meals read failed");
  const meals = ((mealRows ?? []) as Array<{ id: string; logged_at: string }>)
    .map((m) => ({ id: m.id, date: localDate(m.logged_at, params.timezone) }))
    .filter((m) => m.date >= earliest && m.date <= params.end);

  const [estimates, household, supplements] = await Promise.all([
    loadEstimates(db, subject, meals.map((m) => m.id)),
    loadHouseholdFacts(db, subject),
    loadSupplements(db, subject, { start: earliest, end: params.end }),
  ]);

  const allDates = datesBetween(earliest, params.end);
  const supplementByDate = supplementTotalsByDate(supplements.schedules, supplements.doses, allDates, params.today);
  const dayFor = (date: string): DayInput => {
    const onDay = meals.filter((m) => m.date === date);
    const status = params.loggingStatus?.(date) ?? loggingStatusFor(onDay.length, date, params.today, params.expectedMealsPerDay);
    const supp = supplementByDate.get(date) ?? { totals: {}, unconfirmed: 0 };
    return {
      date,
      loggingStatus: status,
      meals: onDay.map((m) => (estimates.get(m.id) as MealEstimate | undefined) ?? null),
      supplementDoses: supp.totals,
      unconfirmedScheduledDoses: supp.unconfirmed,
    };
  };

  const days = datesBetween(params.start, params.end).map(dayFor);
  const previousDays = datesBetween(params.previous.start, params.previous.end).map(dayFor);
  const market = marketFor({ whatsappNumber: params.person.whatsappNumber, timezone: params.timezone });
  const references = resolveReferences(
    { sex: params.person.sex, ageYears: params.person.ageYears, pregnant: params.person.pregnant, lactating: params.person.lactating, market },
    MICRO_KEYS
  );
  const assessments = assessMicronutrients({
    period: { start: params.start, end: params.end },
    days,
    previousDays,
    references,
    household,
    diet: { vegetarian: params.person.vegetarian, eggs: params.person.eatsEggs },
  });
  const edition = editionFor(market);
  return {
    enabled: true,
    period: { start: params.start, end: params.end },
    days,
    assessments,
    concerns: topConcerns(assessments),
    clarification: nextClarification({ days, household, assessments }, params.alreadyAsked),
    references,
    edition: { id: edition.id, name: edition.name, version: edition.version, reviewStatus: edition.reviewStatus, urls: edition.urls },
    household,
    supplements: supplements.schedules,
    likelyLowEnabled: likelyLowEnabled(),
    configVersion: ASSESSMENT_CONFIG.version,
  };
}
