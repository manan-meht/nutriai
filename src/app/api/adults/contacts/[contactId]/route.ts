import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  updateContact,
  getContactDetails,
  getOrCreateFamilyInvite,
  regenerateFamilyInvite,
  revokeFamilyInvite,
  markFamilyInviteLinkOpened,
} from "@/app/(adults)/adults/dashboard/actions";
import { FOOD_BALANCE_SCORE_ENABLED } from "@/lib/billing/feature-flags";
import { mapMealLogToFoodBalanceInput, mapRowToFoodBalanceProfile } from "@/lib/food-balance/adapter";
import { calculateFoodBalanceScore } from "@nutriai/health-scoring";

export const runtime = "edge";

// Plain HTTP route instead of a Server Action — Server Actions on this
// deployment (Cloudflare Pages via @cloudflare/next-on-pages) intermittently
// fail with "Server Action ... was not found on the server" because
// different edge instances serving the same deployment can disagree on the
// action's encryption key/manifest. A regular fetch-based route sidesteps
// that mechanism entirely.
//
// Used to also update a separate adults_contact_goals row via a nested
// `body.goal` (upsertContactGoal) — that table's replaced entirely by the
// Food Balance Score's primary_nutrition_goal + profile fields, which are
// now just plain columns on the contact itself, so updateContact alone
// covers it.
//
// The family-invite endpoints (previously /api/adults/invites/family/[contactId])
// are folded into this file via a `?resource=invite` query param — the same
// Cloudflare Worker bundle-size reasoning as the GET handler below. This app
// was still over Cloudflare's 25MB limit even after the first round of
// route consolidation, so invite management moved in here too.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;

  if (new URL(request.url).searchParams.get("resource") === "invite") {
    const result = await regenerateFamilyInvite(contactId);
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const contactRes = await updateContact(contactId, body);
    if (contactRes.error) return NextResponse.json(contactRes, { status: 400 });

    return NextResponse.json({});
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong. Please try again." },
      { status: 401 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await revokeFamilyInvite(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await markFamilyInviteLinkOpened(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

// GET returns this contact's Food Balance Score — folded into this
// existing route file rather than a separate /api/v1/food-balance-score
// endpoint. Each additional route file costs ~550-650KB of near-fixed
// framework overhead in the compiled Cloudflare Worker (same lesson as the
// PATCH handler's own comment above), and that standalone route was
// exactly what pushed this app's Worker bundle over Cloudflare's 25 MiB
// limit and failed a deploy — see git history for the fix.
//
// With `?resource=invite`, returns/creates the family invite instead
// (folded in from the deleted /api/adults/invites/family/[contactId] route).
export async function GET(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  if (new URL(request.url).searchParams.get("resource") === "invite") {
    const result = await getOrCreateFamilyInvite(contactId);
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }

  if (!FOOD_BALANCE_SCORE_ENABLED) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
