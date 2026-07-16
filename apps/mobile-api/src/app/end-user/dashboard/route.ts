import { NextRequest, NextResponse } from "next/server";
import { getEndUserDashboardData, getAccessList, isSharingPaused } from "@nutriai/end-user-core";
import { createServiceClient } from "@/lib/supabase";
import { getEndUserFromBearerToken } from "@/lib/end-user-auth";

export const runtime = "edge";

// GET /end-user/dashboard — mobile equivalent of the web app's
// getEndUserDashboard (src/lib/end-user/dashboard-service.ts). Auth is the
// end-user session token (see lib/end-user-auth.ts), not a Supabase JWT —
// this is the OTP-verified participant's own view of their tracked
// profile, same data shape the caregiver/coach dashboards use.
export async function GET(request: NextRequest) {
  const session = await getEndUserFromBearerToken(request);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  const [{ profile, meals }, accessList, isPaused] = await Promise.all([
    getEndUserDashboardData(db, session.contactId, session.contactType),
    getAccessList(db, session.contactId, session.contactType),
    isSharingPaused(db, session.contactId),
  ]);

  return NextResponse.json({ profile, meals, accessList, isPaused });
}
