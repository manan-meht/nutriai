export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import { END_USER_DASHBOARD_ENABLED } from "@/lib/billing/feature-flags";
import { getEndUserSession } from "@/lib/end-user/session";
import { getEndUserDashboard } from "@/lib/end-user/dashboard-service";
import { MyProgressDashboardClient } from "@/components/end-user/MyProgressDashboardClient";

export default async function MyProgressDashboardPage() {
  if (!END_USER_DASHBOARD_ENABLED) redirect("/");

  const session = await getEndUserSession();
  if (!session) redirect("/my-progress");

  const dashboard = await getEndUserDashboard(session.contactId, session.contactType);

  return <MyProgressDashboardClient dashboard={dashboard} />;
}
