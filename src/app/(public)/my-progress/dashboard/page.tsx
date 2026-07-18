export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import { END_USER_DASHBOARD_ENABLED, PARENT_DASHBOARD_ACCESS_ENABLED } from "@/lib/billing/feature-flags";
import { getEndUserSession } from "@/lib/end-user/session";
import { getEndUserDashboard, hasAcceptedConsent, getInviter } from "@/lib/end-user/dashboard-service";
import { MyProgressDashboardClient } from "@/components/end-user/MyProgressDashboardClient";
import { ConsentForm } from "@/components/end-user/ConsentForm";

// The consent screen ("Review your Tistra Health access") renders inline
// here rather than as its own /my-progress/consent route — a standalone
// page route costs ~1.5MB of near-fixed Worker bundle overhead in this
// app's Cloudflare Pages build (see git history: this previously pushed
// the Worker bundle over the 25 MiB limit and failed a deploy), which a
// one-screen consent gate doesn't justify. Same session/dashboard-gating
// logic either way, just one fewer route file.
export default async function MyProgressDashboardPage() {
  if (!END_USER_DASHBOARD_ENABLED && !PARENT_DASHBOARD_ACCESS_ENABLED) redirect("/");

  const session = await getEndUserSession();
  if (!session) redirect("/my-progress");

  if (!(await hasAcceptedConsent(session.contactId))) {
    const inviter = await getInviter(session.contactId, session.contactType);
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-neutral-900 text-center mb-4">
            Review your Tistra Health access
          </h1>
          <ConsentForm inviterName={inviter?.name ?? null} inviterRole={inviter?.role ?? "family_owner"} />
        </div>
      </main>
    );
  }

  const dashboard = await getEndUserDashboard(session.contactId, session.contactType);

  return <MyProgressDashboardClient dashboard={dashboard} />;
}
