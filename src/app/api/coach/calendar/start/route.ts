import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildConsentUrl, calendarConfigured } from "@/lib/club/calendar";

// Sends a coach to Google's consent screen.
//
// `state` carries a random nonce stored against their connection row, so
// the callback can prove the response belongs to a flow this server
// started — without it, anyone could hand a coach a crafted callback URL
// and attach their own calendar to that coach's account.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/gym/login", request.url));
  if (!calendarConfigured()) {
    return NextResponse.redirect(new URL("/settings?calendar=unavailable", request.url));
  }

  const admin = createServiceClient();
  const { data: coach } = await admin
    .from("coach_profiles")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!coach) return NextResponse.redirect(new URL("/settings", request.url));

  const nonce = crypto.randomUUID();
  await admin.from("calendar_connections").upsert(
    {
      coach_profile_id: coach.id,
      provider: "google",
      // Parked in last_error until the exchange completes; the row is
      // rewritten wholesale on success.
      last_error: `pending:${nonce}`,
      sync_status: "error",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "coach_profile_id,provider" }
  );

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(buildConsentUrl(origin, `${coach.id}:${nonce}`));
}
