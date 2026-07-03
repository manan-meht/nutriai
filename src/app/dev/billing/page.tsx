export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { DevBillingClient } from "@/components/dev/DevBillingClient";

// Manual testing harness for every entitlement state in spec §22. Never
// available in production — this check runs at request time regardless of
// how the route is reached (build-time inclusion of this page in a
// production bundle is harmless as long as this guard fires first).
export default async function DevBillingPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ getOrCreateAdultsWorkspace }, { getOrCreateWorkspace }] = await Promise.all([
    import("@/app/(adults)/adults/dashboard/actions"),
    import("@/app/(gym)/gym/dashboard/actions"),
  ]);

  const [familyWorkspace, coachingWorkspace] = await Promise.all([
    getOrCreateAdultsWorkspace(user.id),
    getOrCreateWorkspace(user.id),
  ]);

  const [familyEntitlement, coachingEntitlement] = await Promise.all([
    getEntitlementSnapshot(familyWorkspace.id, "adults"),
    getEntitlementSnapshot(coachingWorkspace.id, "gym"),
  ]);

  return (
    <DevBillingClient
      familyEntitlement={familyEntitlement}
      coachingEntitlement={coachingEntitlement}
    />
  );
}
