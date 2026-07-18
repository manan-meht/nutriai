import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateClient, getClientDetails } from "@/app/(gym)/gym/dashboard/actions";
import { FOOD_BALANCE_SCORE_ENABLED } from "@/lib/billing/feature-flags";
import { mapMealLogToFoodBalanceInput, mapRowToFoodBalanceProfile } from "@/lib/food-balance/adapter";
import { personalizeFoodBalanceRecommendations } from "@/lib/food-balance/personalize";
import { DEFAULT_DIETARY_PROFILE } from "@/lib/dietary-profile";
import { calculateFoodBalanceScore } from "@nutriai/health-scoring";
import { getEarnedCards, type ShareCardComponentScores } from "@/lib/share-cards/triggers";
import { SHARE_CARD_CONCEPTS } from "@/lib/share-cards/concepts";

export const runtime = "edge";

// Plain HTTP route instead of a Server Action — same reasoning as
// src/app/api/adults/contacts/[contactId]/route.ts (Server Actions on this
// Cloudflare Pages deployment intermittently fail with "Server Action ...
// was not found on the server"). First edit path for a gym client — it
// previously only supported add.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  // "Don't show this one again" for a share card — see the identical
  // handler in src/app/api/adults/contacts/[contactId]/route.ts.
  if (new URL(request.url).searchParams.get("resource") === "share-card-dismiss") {
    const body = await request.json().catch(() => null);
    const conceptId: string | undefined = body?.conceptId;
    if (!conceptId) return NextResponse.json({ error: "conceptId is required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: row } = await supabase
      .from("gym_clients")
      .select("dismissed_share_card_ids")
      .eq("id", clientId)
      .eq("trainer_id", user.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const next = Array.from(new Set([...(row.dismissed_share_card_ids ?? []), conceptId]));
    const { error } = await supabase
      .from("gym_clients")
      .update({ dismissed_share_card_ids: next })
      .eq("id", clientId)
      .eq("trainer_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const result = await updateClient(clientId, body);
    if (result.error) return NextResponse.json(result, { status: 400 });

    return NextResponse.json({});
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong. Please try again." },
      { status: 401 }
    );
  }
}

// GET returns this client's Food Balance Score — folded into this route
// file rather than a separate /api/v1/food-balance-score endpoint. Each
// additional route file costs ~550-650KB of near-fixed framework overhead
// in the compiled Cloudflare Worker, and that standalone route was exactly
// what pushed this app's Worker bundle over Cloudflare's 25 MiB limit and
// failed a deploy — see git history for the fix.
export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!FOOD_BALANCE_SCORE_ENABLED) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const details = await getClientDetails(clientId);
  if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: profileRow } = await supabase
    .from("gym_clients")
    .select(
      "date_of_birth, age, weight_kg, height_cm, gender, metabolic_equation_sex, activity_level, resistance_training_status, preferred_units, primary_nutrition_goal, target_weight_kg, dietary_profile, dismissed_share_card_ids"
    )
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .single();

  const { data: previousSnapshot } = await supabase
    .from("food_balance_score_snapshots")
    .select("displayed_score")
    .eq("contact_id", clientId)
    .eq("contact_type", "gym_client")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // See src/app/api/adults/contacts/[contactId]/route.ts's identical
  // comment — approximates "last week's" component scores for the
  // improvement share-card concepts without a dedicated weekly-digest job.
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const { data: priorWeekSnapshot } = await supabase
    .from("food_balance_score_snapshots")
    .select("component_scores_json")
    .eq("contact_id", clientId)
    .eq("contact_type", "gym_client")
    .lte("calculated_at", fiveDaysAgo.toISOString())
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const meals = details.meals.map((m) => mapMealLogToFoodBalanceInput(m));
  const profile = profileRow ? mapRowToFoodBalanceProfile(profileRow) : undefined;

  const result = calculateFoodBalanceScore({
    allMeals: meals,
    profile,
    previousDisplayedScore: previousSnapshot?.displayed_score ?? null,
  });

  const dietaryProfile = { ...DEFAULT_DIETARY_PROFILE, ...(profileRow?.dietary_profile ?? {}) };
  result.recommendations = personalizeFoodBalanceRecommendations(result.recommendations, dietaryProfile, {
    goal: profileRow?.primary_nutrition_goal ?? undefined,
  });

  if (result.calculatedAt) {
    await supabase.from("food_balance_score_snapshots").insert({
      contact_id: clientId,
      contact_type: "gym_client",
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

  // Share cards ("Your wins") — see the identical block in
  // src/app/api/adults/contacts/[contactId]/route.ts for the full
  // rationale (folded in rather than a new route).
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
    meals: details.meals.map((m) => ({
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

  return NextResponse.json({ ...result, earnedShareCards });
}
