import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { connectCalendar } from "@/lib/club/calendar";

// Where Google returns after consent.
//
// Three things are checked before any token is stored: the caller is
// signed in, the state's coach id is THEIR coach profile, and the nonce
// matches the one this server parked when the flow started. Any of those
// missing means the callback wasn't ours to act on.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?calendar=${q}`, request.url));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?product=coach", request.url));

  // The coach declined, or Google refused.
  if (url.searchParams.get("error")) return settings("declined");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const [coachProfileId, nonce] = state.split(":");
  if (!code || !coachProfileId || !nonce) return settings("failed");

  const admin = createServiceClient();
  const { data: coach } = await admin
    .from("coach_profiles")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  // The state names a coach; it must be the signed-in one.
  if (!coach || coach.id !== coachProfileId) return settings("failed");

  const { data: pending } = await admin
    .from("calendar_connections")
    .select("last_error")
    .eq("coach_profile_id", coach.id)
    .eq("provider", "google")
    .maybeSingle();
  if (pending?.last_error !== `pending:${nonce}`) return settings("failed");

  try {
    await connectCalendar(admin, coach.id, code, url.origin);
    return settings("connected");
  } catch {
    // The message can carry Google's error detail; don't put it in a URL.
    return settings("failed");
  }
}
