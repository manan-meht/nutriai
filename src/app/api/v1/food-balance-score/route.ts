import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContactDetails } from "@/app/(adults)/adults/dashboard/actions";
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
export async function GET(request: NextRequest) {
  if (!FOOD_BALANCE_SCORE_ENABLED) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const contactId = request.nextUrl.searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // getContactDetails already scopes the query to `caregiver_id = user.id`,
  // so a mismatched contactId simply returns null here rather than another
  // user's data ever being reachable.
  const details = await getContactDetails(contactId);
  if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: profileRow } = await supabase
    .from("adults_contacts")
    .select(
      "date_of_birth, age, weight_kg, height_cm, gender, metabolic_equation_sex, activity_level, resistance_training_status, preferred_units, primary_nutrition_goal, target_weight_kg"
    )
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();

  const { data: previousSnapshot } = await supabase
    .from("food_balance_score_snapshots")
    .select("displayed_score")
    .eq("contact_id", contactId)
    .eq("contact_type", "adults_contact")
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
      contact_id: contactId,
      contact_type: "adults_contact",
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
