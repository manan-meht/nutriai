import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken } from "@/lib/supabase";
import { getContactDetails } from "@/lib/adults";
import { getClientDetails } from "@/lib/gym";
import { mapMealLogToFoodBalanceInput, mapRowToFoodBalanceProfile } from "@/lib/food-balance";
import { calculateFoodBalanceScore } from "@nutriai/health-scoring";

export const runtime = "edge";

// Mirrors src/app/api/v1/food-balance-score/route.ts in the main web app —
// same mutually-exclusive ?contactId=/?clientId= convention, same
// snapshot persistence. Duplicated rather than shared for now (see
// src/lib/food-balance.ts's own comment).
//
//   GET /food-balance-score?contactId=... or ?clientId=...
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
      "date_of_birth, age, weight_kg, height_cm, metabolic_equation_sex, activity_level, resistance_training_status, preferred_units, primary_nutrition_goal, target_weight_kg"
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

  const meals = details.meals.map((m: any) => mapMealLogToFoodBalanceInput(m));
  const profile = profileRow ? mapRowToFoodBalanceProfile(profileRow) : undefined;

  const result = calculateFoodBalanceScore({
    allMeals: meals,
    profile,
    previousDisplayedScore: previousSnapshot?.displayed_score ?? null,
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

  return NextResponse.json(result);
}
