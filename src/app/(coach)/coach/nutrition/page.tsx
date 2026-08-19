import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreateWorkspace, getClients, getRemovedClients } from "@/app/(gym)/gym/dashboard/actions";
import { getCoachProfile } from "@/lib/club/coach-queries";
import { CoachShell } from "@/components/coach/CoachShell";
import { GymDashboardClient } from "@/components/gym/GymDashboardClient";
import { getEntitlementSnapshot, requiresCardBeforeFirstTrial } from "@/lib/entitlements/entitlements";
import { isBillingWhitelisted } from "@/lib/billing/feature-flags";
import { getIpCountry, resolveBillingMarket } from "@/lib/billing/market";
import { getConfirmedBillingCountry } from "@/lib/billing/country-cookie";
import { getPrice, formatMinorUnits } from "@/lib/billing/pricing";
import { syncCheckoutCompletion } from "@/app/actions/subscription-management";

// Nutrition tracking, housed inside Coach OS.
//
// This is the former standalone gym dashboard. Coach OS is the overarching
// system and is free — dashboard, calendar, clients, payments and the
// public marketplace profile all cost nothing. Nutrition tracking is the
// one paid feature, so the entitlement check lives HERE and nowhere else
// in the (coach) route group.
//
// Two identities meet on this page, both derived from the signed-in user
// so neither is passed in or guessable:
//
//   - coach_profiles  → who they are in the marketplace (the shell)
//   - workspaces      → what they own for billing and nutrition clients
//
// They aren't merged yet. Unifying the client records (booking clients live
// in coach_client_relationships, nutrition clients in gym_clients keyed by
// WhatsApp number) is its own piece of work; keeping both keyed off the
// user id means this page works today without a data migration.

export const dynamic = "force-dynamic";

export default async function CoachNutritionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = (await searchParams) ?? {};
  const justCheckedOut = params.checkout === "success";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=gym&next=%2Fcoach%2Fnutrition");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const admin = createServiceClient();
  const [coachProfile, workspace] = await Promise.all([
    getCoachProfile(admin, user.id),
    getOrCreateWorkspace(user.id, profileRow?.full_name ?? undefined),
  ]);

  // Straight back from a Checkout redirect — sync now rather than waiting
  // on the webhook, which can lag in production and can't reach local dev.
  if (justCheckedOut) {
    await syncCheckoutCompletion("gym").catch(() => {});
  }

  const [clients, removedClients, entitlement] = await Promise.all([
    getClients(workspace.id),
    getRemovedClients(workspace.id),
    getEntitlementSnapshot(workspace.id, "gym", user.email),
  ]);

  const headerStore = await headers();
  const { market } = resolveBillingMarket({
    confirmedCountry: await getConfirmedBillingCountry(),
    ipCountry: getIpCountry(headerStore),
  });
  const monthly = getPrice(market, "gym", "monthly");
  const annual = getPrice(market, "gym", "annual");

  return (
    <CoachShell
      active="nutrition"
      coachName={coachProfile?.displayName ?? profileRow?.full_name ?? "Coach"}
      photoUrl={coachProfile?.photoUrl}
    >
      <GymDashboardClient
        coachName={profileRow?.full_name ?? ""}
        coachEmail={user.email ?? ""}
        workspaceId={workspace.id}
        clients={clients}
        removedClients={removedClients}
        extraCapacity={workspace.extraCapacity}
        entitlement={entitlement}
        pricing={{
          monthlyLabel: formatMinorUnits(monthly.amountMinorUnits, monthly.currency),
          annualLabel: formatMinorUnits(annual.amountMinorUnits, annual.currency),
        }}
        requiresCardBeforeTrial={requiresCardBeforeFirstTrial({
          workspaceCreatedAt: workspace.createdAt,
          entitlementStatus: entitlement.status,
          ownerEmail: user.email,
        })}
        autoOpenAddModal={justCheckedOut && entitlement.status === "trialing"}
        isBillingWhitelisted={isBillingWhitelisted(user.email)}
      />
    </CoachShell>
  );
}
