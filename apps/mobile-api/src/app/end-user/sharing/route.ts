import { NextRequest, NextResponse } from "next/server";
import { setSharingPaused } from "@nutriai/end-user-core";
import { createServiceClient } from "@/lib/supabase";
import { getEndUserFromBearerToken } from "@/lib/end-user-auth";

export const runtime = "edge";

// POST /end-user/sharing — mobile equivalent of the web app's
// pauseSharingAction. Body: { paused: boolean }.
export async function POST(request: NextRequest) {
  const session = await getEndUserFromBearerToken(request);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (typeof body?.paused !== "boolean") {
    return NextResponse.json({ error: "paused (boolean) is required" }, { status: 400 });
  }

  await setSharingPaused(createServiceClient(), session.contactId, session.contactType, body.paused);
  return NextResponse.json({ ok: true });
}
