import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken, createServiceClient } from "@/lib/supabase";

export const runtime = "edge";

// POST /me/push-token — registers (or re-registers) this device's Expo push
// token for the authenticated user. Called by the mobile app once on launch
// after a permission grant, and again any time expo-notifications reports a
// token change (reinstalls, Expo Go -> dev client migrations, etc).
//
// Upserts on (profile_id, expo_push_token) — see migration 0028 — so a
// reinstall on the same device just refreshes updated_at rather than
// accumulating duplicate rows, and a caregiver with multiple phones keeps
// one row per device.
export async function POST(request: NextRequest) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const expoPushToken = body?.expoPushToken;
  const platform = body?.platform;

  if (typeof expoPushToken !== "string" || !expoPushToken) {
    return NextResponse.json({ error: "expoPushToken is required" }, { status: 400 });
  }
  if (platform !== "android" && platform !== "ios") {
    return NextResponse.json({ error: "platform must be 'android' or 'ios'" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("push_tokens")
    .upsert(
      {
        profile_id: auth.user.id,
        expo_push_token: expoPushToken,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,expo_push_token" }
    );

  if (error) {
    console.error("[push-token] upsert failed:", error);
    return NextResponse.json({ error: "Failed to register push token" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
