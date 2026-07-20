import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken } from "@/lib/supabase";
import { getContactDetails } from "@/lib/adults";
import { getClientDetails } from "@/lib/gym";
import { mapMealLogToFoodBalanceInput, mapRowToFoodBalanceProfile, resolveMacroTargets } from "@/lib/food-balance";
import { personalizeFoodBalanceRecommendations } from "@/lib/food-balance-personalize";
import { applyRecommendationFeedback, type RecommendationFeedback } from "@/lib/food-balance-feedback";
import { DEFAULT_DIETARY_PROFILE } from "@/lib/dietary-profile-types";
import { calculateFoodBalanceScore } from "@nutriai/health-scoring";
import { getEarnedCards, type ShareCardComponentScores } from "@/lib/share-cards/triggers";
import { SHARE_CARD_CONCEPTS } from "@/lib/share-cards/concepts";

export const runtime = "edge";

// Mirrors src/app/api/v1/food-balance-score/route.ts in the main web app —
// same mutually-exclusive ?contactId=/?clientId= convention, same
// snapshot persistence, and now the same Food Profile personalization
// (see src/lib/food-balance/personalize.ts on the web side —
// @/lib/food-balance-personalize here is that logic's local mirror, see
// its own header comment). Duplicated rather than shared for now (see
// src/lib/food-balance.ts's own comment).
//
//   GET /food-balance-score?contactId=... or ?clientId=...
//   POST /food-balance-score  { contactId|clientId, feedback, foodIds }
//     — records feedback on a recommendation's shown foods (Helpful/Not
//     useful/Already eat/Don't like/Not available/Too hard), folded into
//     this same route rather than a new file (see this app's own
//     comments elsewhere on why: fixed Worker bundle overhead per route).
export async function GET(request: NextRequest) {
  // Same flag as the main web app's NEXT_PUBLIC_FOOD_BALANCE_SCORE_V1 (see
  // src/lib/billing/feature-flags.ts there) — set independently in this
  // app's own environment since it's a separate Cloudflare Pages project.
  if (process.env.NEXT_PUBLIC_FOOD_BALANCE_SCORE_V1 !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const contactId = request.nextUrl.searchParams.get("contactId");
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!contactId && !clientId) {
    return NextResponse.json({ error: "contactId or clientId is required" }, { status: 400 });
  }

  const isGym = Boolean(clientId);
  const id = (contactId ?? clientId)!;
  const table = isGym ? "gym_clients" : "adults_contacts";
  const ownerColumn = isGym ? "trainer_id" : "caregiver_id";
  const contactType = isGym ? "gym_client" : "adults_contact";

  const details = isGym ? await getClientDetails(id, auth.supabase) : await getContactDetails(id, auth.supabase);
  if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: profileRow } = await auth.supabase
    .from(table)
    .select(
      "date_of_birth, age, weight_kg, height_cm, gender, activity_level, resistance_training_status, preferred_units, nutrition_goals, target_weight_kg, dietary_profile, dismissed_share_card_ids, custom_macro_targets"
    )
    .eq("id", id)
    .eq(ownerColumn, auth.user.id)
    .single();

  const { data: previousSnapshot } = await auth.supabase
    .from("food_balance_score_snapshots")
    .select("displayed_score")
    .eq("contact_id", id)
    .eq("contact_type", contactType)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Share cards ("Your wins") — closest snapshot at least 5 days old
  // approximates "last week's" component scores for the improvement
  // concepts, same as the main web app's contacts/[contactId]/route.ts.
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const { data: priorWeekSnapshot } = await auth.supabase
    .from("food_balance_score_snapshots")
    .select("component_scores_json")
    .eq("contact_id", id)
    .eq("contact_type", contactType)
    .lte("calculated_at", fiveDaysAgo.toISOString())
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const meals = details.meals.map((m: any) => mapMealLogToFoodBalanceInput(m));
  const profile = profileRow ? mapRowToFoodBalanceProfile(profileRow) : undefined;

  const result = calculateFoodBalanceScore({
    allMeals: meals,
    profile,
    previousDisplayedScore: previousSnapshot?.displayed_score ?? null,
  });

  const macroProfile = profile ?? { ...mapRowToFoodBalanceProfile({ ...profileRow, nutrition_goals: ["improve_nutrition"] })! };
  const { recommendedMacroTargets, activeMacroTargets } = resolveMacroTargets(macroProfile, profileRow?.custom_macro_targets ?? undefined);

  const distinctDays = new Set(details.meals.map((m: any) => m.loggedAt.slice(0, 10))).size || 1;
  const avgOf = (min: string, max: string) =>
    details.meals.reduce((s: number, m: any) => s + ((m[min] as number) + (m[max] as number)) / 2, 0) / distinctDays;

  const dietaryProfile = { ...DEFAULT_DIETARY_PROFILE, ...(profileRow?.dietary_profile ?? {}) };
  result.recommendations = personalizeFoodBalanceRecommendations(result.recommendations, dietaryProfile, {
    goal: profileRow?.nutrition_goals?.[0] ?? undefined,
    macroTargets: {
      protein: { averageG: avgOf("totalProteinMin", "totalProteinMax"), targetG: activeMacroTargets.protein.target },
      fiber: { averageG: avgOf("totalFiberMin", "totalFiberMax"), targetG: activeMacroTargets.fiber.target },
      carbs: { averageG: avgOf("totalCarbsMin", "totalCarbsMax"), targetG: activeMacroTargets.carbs.target },
    },
  });

  if (result.calculatedAt) {
    await auth.supabase.from("food_balance_score_snapshots").insert({
      contact_id: id,
      contact_type: contactType,
      raw_score: result.rawScore,
      displayed_score: result.score,
      food_foundation_score: result.foodFoundationScore,
      goal_alignment_score: result.goalAlignmentScore,
      component_scores_json: result.componentScores ?? {},
      confidence: result.confidence,
      status: result.status,
      recommendation_ids_json: result.recommendations.map((r) => r.id),
      scoring_version: result.scoringVersion,
      scoring_window_end: result.calculatedAt,
      calculated_at: result.calculatedAt,
    });
  }

  // Share cards ("Your wins") — folded into this same response rather
  // than a new route/endpoint, same bundle-size reasoning as the rest of
  // this file. Reuses the meals/component-scores already computed above.
  const componentScores: ShareCardComponentScores = {
    macroAndFibreBalance: result.componentScores?.foodFoundation.macroAndFibreBalance.score ?? null,
    fruitAndVegetableIntake: result.componentScores?.foodFoundation.fruitAndVegetableIntake.score ?? null,
    homePreparedMealShare: result.componentScores?.foodFoundation.homePreparedMealShare.score ?? null,
    minimallyProcessedFoodBalance: result.componentScores?.foodFoundation.minimallyProcessedFoodBalance.score ?? null,
    proteinAdequacy: result.componentScores?.goalAlignment.proteinAdequacy?.score ?? null,
    fibreAdequacy: result.componentScores?.goalAlignment.fibreAdequacy?.score ?? null,
    goalAlignmentScore: result.goalAlignmentScore,
  };
  const priorComponentScores = priorWeekSnapshot?.component_scores_json as
    | { foodFoundation?: Record<string, { score: number | null }>; goalAlignment?: Record<string, { score: number | null }> }
    | undefined;
  const previousWeekComponentScores: ShareCardComponentScores | undefined = priorComponentScores
    ? {
        macroAndFibreBalance: priorComponentScores.foodFoundation?.macroAndFibreBalance?.score ?? null,
        fruitAndVegetableIntake: priorComponentScores.foodFoundation?.fruitAndVegetableIntake?.score ?? null,
        homePreparedMealShare: priorComponentScores.foodFoundation?.homePreparedMealShare?.score ?? null,
        minimallyProcessedFoodBalance: priorComponentScores.foodFoundation?.minimallyProcessedFoodBalance?.score ?? null,
      }
    : undefined;

  const dismissedIds = new Set(profileRow?.dismissed_share_card_ids ?? []);
  const earnedShareCards = getEarnedCards(SHARE_CARD_CONCEPTS, {
    meals: details.meals.map((m: any) => ({
      loggedAt: m.loggedAt,
      mealType: m.mealType,
      totalProteinMin: m.totalProteinMin,
      totalProteinMax: m.totalProteinMax,
      totalFiberMin: m.totalFiberMin,
      totalFiberMax: m.totalFiberMax,
    })),
    componentScores,
    previousWeekComponentScores,
    distinctLoggingDaysThisWeek: result.dataCoverage.distinctLoggingDays,
    totalMealsAllTime: details.meals.length,
  }).filter((c) => !dismissedIds.has(c.concept.id));

  return NextResponse.json({ ...result, earnedShareCards, recommendedMacroTargets, activeMacroTargets });
}

// PATCH /food-balance-score?resource=share-card-dismiss  { contactId|clientId, conceptId }
//   — "don't show this one again" for a share card. Folded in here rather
//   than a new route, same reasoning as everywhere else in this file.
// PATCH /food-balance-score?resource=macro-targets  { contactId|clientId, targets? , reset? }
//   — mirrors the main web app's contact/client route PATCH handler for
//   macro-target edit/reset (see those routes' own comments).
export async function PATCH(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource");

  if (resource === "macro-targets") {
    const auth = await getUserFromBearerToken(request);
    if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const contactId: string | undefined = body?.contactId;
    const clientId: string | undefined = body?.clientId;
    if (!contactId && !clientId) return NextResponse.json({ error: "contactId or clientId is required" }, { status: 400 });

    const isGym = Boolean(clientId);
    const id = (contactId ?? clientId)!;
    const table = isGym ? "gym_clients" : "adults_contacts";
    const ownerColumn = isGym ? "trainer_id" : "caregiver_id";

    const nextCustomMacroTargets = body.reset === true ? null : (body.targets ?? null);
    const { error } = await auth.supabase
      .from(table)
      .update({ custom_macro_targets: nextCustomMacroTargets, macro_targets_customized_at: new Date().toISOString() })
      .eq("id", id)
      .eq(ownerColumn, auth.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (resource !== "share-card-dismiss") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const contactId: string | undefined = body?.contactId;
  const clientId: string | undefined = body?.clientId;
  const conceptId: string | undefined = body?.conceptId;
  if ((!contactId && !clientId) || !conceptId) {
    return NextResponse.json({ error: "contactId or clientId, and conceptId, are required" }, { status: 400 });
  }

  const isGym = Boolean(clientId);
  const id = (contactId ?? clientId)!;
  const table = isGym ? "gym_clients" : "adults_contacts";
  const ownerColumn = isGym ? "trainer_id" : "caregiver_id";

  const { data: row } = await auth.supabase
    .from(table)
    .select("dismissed_share_card_ids")
    .eq("id", id)
    .eq(ownerColumn, auth.user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next = Array.from(new Set([...(row.dismissed_share_card_ids ?? []), conceptId]));
  const { error } = await auth.supabase
    .from(table)
    .update({ dismissed_share_card_ids: next })
    .eq("id", id)
    .eq(ownerColumn, auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const contactId: string | undefined = body?.contactId;
  const clientId: string | undefined = body?.clientId;
  const feedback: RecommendationFeedback | undefined = body?.feedback;
  const foodIds: string[] = Array.isArray(body?.foodIds) ? body.foodIds : [];

  if ((!contactId && !clientId) || !feedback) {
    return NextResponse.json({ error: "contactId or clientId, and feedback, are required" }, { status: 400 });
  }

  const isGym = Boolean(clientId);
  const id = (contactId ?? clientId)!;
  const table = isGym ? "gym_clients" : "adults_contacts";
  const ownerColumn = isGym ? "trainer_id" : "caregiver_id";

  const { data: row, error: readError } = await auth.supabase
    .from(table)
    .select("dietary_profile")
    .eq("id", id)
    .eq(ownerColumn, auth.user.id)
    .maybeSingle();
  if (readError || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentProfile = { ...DEFAULT_DIETARY_PROFILE, ...(row.dietary_profile ?? {}) };
  const nextProfile = applyRecommendationFeedback(currentProfile, feedback, foodIds);

  const { error: writeError } = await auth.supabase
    .from(table)
    .update({ dietary_profile: nextProfile })
    .eq("id", id)
    .eq(ownerColumn, auth.user.id);
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
