import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContactDetails } from "@/app/(adults)/adults/dashboard/actions";
import { getClientDetails } from "@/app/(gym)/gym/dashboard/actions";
import { FOOD_BALANCE_SCORE_ENABLED } from "@/lib/billing/feature-flags";
import { mapMealLogToFoodBalanceInput, mapRowToFoodBalanceProfile } from "@/lib/food-balance/adapter";
import { calculateFoodBalanceScore } from "@nutriai/health-scoring";

export const runtime = "edge";

// Plain HTTP route (not a Server Action) so it's directly callable by the
// React Native app too, following the same pattern/reasoning as
// src/app/api/adults/contacts/[contactId]/route.ts. Scoped under /api/v1
// per the feature's spec — the first versioned route in this app; existing
// routes are unversioned, so this establishes the convention rather than
// following one that already existed.
//
// Supports both products via mutually exclusive query params —
// ?contactId= (adults, ownership via caregiver_id) or ?clientId= (gym,
// ownership via trainer_id) — rather than two separate route files, per
// the "do not create a second endpoint" guidance and the existing
// mobile-api Cloudflare Worker size lesson (each extra route file has real
// fixed overhead).
export async function GET(request: NextRequest) {
  if (!FOOD_BALANCE_SCORE_ENABLED) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const contactId = request.nextUrl.searchParams.get("contactId");
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!contactId && !clientId) {
    return NextResponse.json({ error: "contactId or clientId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const isGym = Boolean(clientId);
  const id = (contactId ?? clientId)!;
  const table = isGym ? "gym_clients" : "adults_contacts";
  const ownerColumn = isGym ? "trainer_id" : "caregiver_id";
  const contactType = isGym ? "gym_client" : "adults_contact";

  // getContactDetails/getClientDetails already scope their query to the
  // owning caregiver_id/trainer_id, so a mismatched id simply returns null
  // here rather than another user's data ever being reachable.
  const details = isGym ? await getClientDetails(id) : await getContactDetails(id);
  if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: profileRow } = await supabase
    .from(table)
    .select(
      "date_of_birth, age, weight_kg, height_cm, gender, metabolic_equation_sex, activity_level, resistance_training_status, preferred_units, primary_nutrition_goal, target_weight_kg"
    )
    .eq("id", id)
    .eq(ownerColumn, user.id)
    .single();

  const { data: previousSnapshot } = await supabase
    .from("food_balance_score_snapshots")
    .select("displayed_score")
    .eq("contact_id", id)
    .eq("contact_type", contactType)
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

  if (result.calculatedAt) {
    await supabase.from("food_balance_score_snapshots").insert({
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
