import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken, calendarTokenKeyConfigured } from "./calendar-crypto";
import type { TimeRange } from "./availability";

// Google Calendar, read-only free/busy.
//
// What this asks for and why it matters: the scope is
// calendar.readonly.freebusy — Google returns nothing but start/end pairs
// for blocks marked busy. No titles, no attendees, no descriptions,
// no locations. That is not a courtesy, it is the spec's hard rule: a
// client browsing availability must never be able to infer anything about
// a coach's other commitments, and the safest way to guarantee that is to
// never receive the data in the first place.
//
// Write-back (putting confirmed Tistra sessions INTO the coach's calendar)
// is deliberately not built here. It needs a broader scope, and reading is
// the half that fixes double-booking — the actual problem a coach has.
//
// Raw fetch, matching every other integration in this repo; no googleapis
// SDK, which drags in Node built-ins a Worker doesn't have.

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const FREEBUSY = "https://www.googleapis.com/calendar/v3/freeBusy";
const USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

/** Free/busy only. Deliberately the narrowest scope that answers "when is
 * this coach unavailable". */
const SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

export function calendarConfigured(): boolean {
  return (
    !!process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    !!process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    calendarTokenKeyConfigured()
  );
}

/** Where Google sends the coach back. Must match a redirect URI registered
 * on the OAuth client exactly. */
export function calendarRedirectUri(origin: string): string {
  return `${origin}/api/coach/calendar/callback`;
}

export function buildConsentUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    redirect_uri: calendarRedirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    // offline + consent so a refresh token is actually issued; without
    // both, a returning coach gets an access token that expires in an hour
    // and the connection silently dies.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_AUTH}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      ...body,
    }).toString(),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json?.error_description ?? json?.error ?? "Google rejected the token request");
  return json as TokenResponse;
}

/** Completes the OAuth exchange and stores the connection. */
export async function connectCalendar(
  admin: SupabaseClient,
  coachProfileId: string,
  code: string,
  origin: string
): Promise<{ email: string | null }> {
  const tokens = await postToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: calendarRedirectUri(origin),
  });

  // Best-effort: knowing WHICH account is connected lets a coach spot that
  // they linked the wrong Google login, which is otherwise invisible.
  let email: string | null = null;
  try {
    const who = await fetch(USERINFO, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (who.ok) email = (await who.json())?.email ?? null;
  } catch {
    // Not worth failing a working connection over.
  }

  await admin.from("calendar_connections").upsert(
    {
      coach_profile_id: coachProfileId,
      provider: "google",
      provider_account_email: email,
      access_token_encrypted: await encryptToken(tokens.access_token),
      // Google only returns a refresh token on first consent; keep the
      // existing one when it doesn't, or reconnecting would downgrade a
      // working connection to a one-hour one.
      ...(tokens.refresh_token
        ? { refresh_token_encrypted: await encryptToken(tokens.refresh_token) }
        : {}),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      calendar_id: "primary",
      sync_status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "coach_profile_id,provider" }
  );

  return { email };
}

export async function disconnectCalendar(admin: SupabaseClient, coachProfileId: string): Promise<void> {
  // Row deleted rather than flagged: keeping encrypted tokens for a
  // connection a coach has explicitly ended is not something to defend.
  await admin
    .from("calendar_connections")
    .delete()
    .eq("coach_profile_id", coachProfileId)
    .eq("provider", "google");
}

/** A usable access token, refreshing if the stored one has expired.
 * Returns null when the coach needs to reconnect, and records that. */
async function accessTokenFor(admin: SupabaseClient, coachProfileId: string): Promise<string | null> {
  const { data: row } = await admin
    .from("calendar_connections")
    .select("access_token_encrypted, refresh_token_encrypted, token_expires_at, sync_status")
    .eq("coach_profile_id", coachProfileId)
    .eq("provider", "google")
    .maybeSingle();
  if (!row) return null;

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  // 60s of slack so a token doesn't expire mid-request.
  if (expiresAt > Date.now() + 60_000) {
    const token = await decryptToken(row.access_token_encrypted);
    if (token) return token;
  }

  const refresh = await decryptToken(row.refresh_token_encrypted);
  if (!refresh) {
    await markNeedsReauth(admin, coachProfileId, "Stored credentials could not be read");
    return null;
  }

  try {
    const tokens = await postToken({ refresh_token: refresh, grant_type: "refresh_token" });
    await admin
      .from("calendar_connections")
      .update({
        access_token_encrypted: await encryptToken(tokens.access_token),
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        sync_status: "connected",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("coach_profile_id", coachProfileId)
      .eq("provider", "google");
    return tokens.access_token;
  } catch (err) {
    // A revoked grant lands here. Say so rather than reporting an empty
    // calendar, which would silently open up slots the coach is busy in.
    await markNeedsReauth(admin, coachProfileId, err instanceof Error ? err.message : "Refresh failed");
    return null;
  }
}

async function markNeedsReauth(admin: SupabaseClient, coachProfileId: string, reason: string): Promise<void> {
  await admin
    .from("calendar_connections")
    .update({ sync_status: "needs_reauth", last_error: reason.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("coach_profile_id", coachProfileId)
    .eq("provider", "google");
}

/**
 * Busy blocks for a coach, or null when there is no usable connection.
 *
 * null and [] mean different things and callers must not conflate them:
 * [] is "connected, and genuinely free", null is "we don't know". Treating
 * unknown as free is how a coach ends up double-booked, which is the exact
 * failure this integration exists to prevent.
 */
export async function fetchBusyBlocks(
  admin: SupabaseClient,
  coachProfileId: string,
  from: Date,
  to: Date
): Promise<TimeRange[] | null> {
  if (!calendarConfigured()) return null;

  const token = await accessTokenFor(admin, coachProfileId);
  if (!token) return null;

  try {
    const res = await fetch(FREEBUSY, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: "primary" }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const busy: Array<{ start: string; end: string }> = json?.calendars?.primary?.busy ?? [];

    await admin
      .from("calendar_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("coach_profile_id", coachProfileId)
      .eq("provider", "google");

    return busy.map((b) => ({ startsAt: new Date(b.start), endsAt: new Date(b.end) }));
  } catch {
    return null;
  }
}

export interface CalendarConnectionState {
  connected: boolean;
  email: string | null;
  status: "connected" | "needs_reauth" | "revoked" | "error" | "not_connected";
  lastSyncedAt: string | null;
  configured: boolean;
}

export async function getCalendarState(
  admin: SupabaseClient,
  coachProfileId: string
): Promise<CalendarConnectionState> {
  const configured = calendarConfigured();
  const { data } = await admin
    .from("calendar_connections")
    .select("provider_account_email, sync_status, last_synced_at")
    .eq("coach_profile_id", coachProfileId)
    .eq("provider", "google")
    .maybeSingle();

  if (!data) return { connected: false, email: null, status: "not_connected", lastSyncedAt: null, configured };
  return {
    connected: data.sync_status === "connected",
    email: data.provider_account_email,
    status: data.sync_status,
    lastSyncedAt: data.last_synced_at,
    configured,
  };
}
