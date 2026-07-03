"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { EntitlementModule, EntitlementStatus } from "@/lib/entitlements/entitlements";
import { now } from "@/lib/time/clock";

// Dev/staging-only manual testing harness (spec §22). Never usable in
// production, regardless of how this route/action is reached — the guard
// is in the action itself, not just the page, so it can't be bypassed by
// calling the server action directly.
function assertNonProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev billing testing controls are not available in production.");
  }
}

export type EntitlementPreset =
  | "not_started"
  | "trialing_fresh"
  | "trialing_ending_soon"
  | "trialing_expired"
  | "active_monthly"
  | "active_annual"
  | "past_due"
  | "cancel_at_period_end"
  | "cancelled";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Directly sets an entitlement row to a given preset state, for manually
 * exercising every state listed in spec §22 without needing a real
 * Stripe/Razorpay test payment for each one. Scoped to the caller's own
 * workspace for the given module. */
export async function devSetEntitlementState(module: EntitlementModule, preset: EntitlementPreset): Promise<void> {
  assertNonProduction();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createServiceClient();
  const workspace = await getWorkspaceForModule(module, user.id);
  const at = now();

  if (preset === "not_started") {
    await admin.from("entitlements").delete().eq("workspace_id", workspace.id).eq("module", module);
    return;
  }

  const base = {
    workspace_id: workspace.id,
    owner_id: user.id,
    module,
  };

  const patches: Record<EntitlementPreset, Record<string, unknown>> = {
    not_started: {},
    trialing_fresh: {
      status: "trialing",
      trial_start_at: at.toISOString(),
      trial_end_at: new Date(at.getTime() + 30 * DAY_MS).toISOString(),
    },
    trialing_ending_soon: {
      status: "trialing",
      trial_start_at: new Date(at.getTime() - 29 * DAY_MS).toISOString(),
      trial_end_at: new Date(at.getTime() + 1 * DAY_MS).toISOString(),
    },
    trialing_expired: {
      status: "trialing",
      trial_start_at: new Date(at.getTime() - 31 * DAY_MS).toISOString(),
      trial_end_at: new Date(at.getTime() - 1 * DAY_MS).toISOString(),
    },
    active_monthly: {
      status: "active",
      subscription_start_at: at.toISOString(),
      current_period_start: at.toISOString(),
      current_period_end: new Date(at.getTime() + 30 * DAY_MS).toISOString(),
      cancel_at_period_end: false,
      cancelled_at: null,
      payment_provider: "stripe",
      billing_interval: "monthly",
    },
    active_annual: {
      status: "active",
      subscription_start_at: at.toISOString(),
      current_period_start: at.toISOString(),
      current_period_end: new Date(at.getTime() + 365 * DAY_MS).toISOString(),
      cancel_at_period_end: false,
      cancelled_at: null,
      payment_provider: "stripe",
      billing_interval: "annual",
    },
    past_due: {
      status: "past_due",
      current_period_start: new Date(at.getTime() - 10 * DAY_MS).toISOString(),
      current_period_end: new Date(at.getTime() + 20 * DAY_MS).toISOString(),
      payment_provider: "stripe",
    },
    cancel_at_period_end: {
      status: "cancel_at_period_end",
      current_period_start: at.toISOString(),
      current_period_end: new Date(at.getTime() + 15 * DAY_MS).toISOString(),
      cancel_at_period_end: true,
      payment_provider: "stripe",
    },
    cancelled: {
      status: "cancelled",
      cancelled_at: at.toISOString(),
      current_period_end: new Date(at.getTime() - 1 * DAY_MS).toISOString(),
      payment_provider: "stripe",
    },
  };

  const { error } = await admin
    .from("entitlements")
    .upsert({ ...base, ...patches[preset] }, { onConflict: "workspace_id,module" });
  if (error) throw new Error(`Failed to set dev entitlement state: ${error.message}`);
}

async function getWorkspaceForModule(module: EntitlementModule, userId: string) {
  if (module === "adults") {
    const { getOrCreateAdultsWorkspace } = await import("@/app/(adults)/adults/dashboard/actions");
    return getOrCreateAdultsWorkspace(userId);
  }
  const { getOrCreateWorkspace } = await import("@/app/(gym)/gym/dashboard/actions");
  return getOrCreateWorkspace(userId);
}
