"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { FoundingMemberPlanId } from "@/lib/pricing/founding-member";

// Maps a founding-member plan choice (as shown on /pricing) to the
// workspace `type` it lives under and the `plan` value from migration
// 0010_self_plan_pricing.sql. "family" and "self" are both under the
// "adults" workspace type; "gym" is its own type with plan "coach" — same
// mapping used throughout the adults/gym dashboards.
const PLAN_TO_WORKSPACE: Record<FoundingMemberPlanId, { type: "adults" | "gym"; plan: "self" | "family" | "coach" }> = {
  self: { type: "adults", plan: "self" },
  family: { type: "adults", plan: "family" },
  gym: { type: "gym", plan: "coach" },
};

/**
 * Records the caller's intended plan (workspaces.plan) without creating or
 * changing any paid subscription — entitlements/billing status is untouched.
 * Only ever called from the /pricing page's "Choose this plan" buttons,
 * which are shown to already-signed-in users; logged-out visitors go
 * through signup instead (see PricingSection.tsx).
 */
export async function setIntendedPlan(planId: FoundingMemberPlanId): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Not authenticated" };

  const target = PLAN_TO_WORKSPACE[planId];
  const admin = createServiceClient();

  const { data: workspace } = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .eq("type", target.type)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!workspace) return { ok: false, reason: "Workspace not found" };

  const { error } = await admin.from("workspaces").update({ plan: target.plan }).eq("id", workspace.id);
  if (error) return { ok: false, reason: error.message };

  return { ok: true };
}
