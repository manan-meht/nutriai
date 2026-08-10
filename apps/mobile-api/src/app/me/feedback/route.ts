import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken, createServiceClient } from "@/lib/supabase";
import {
  validateMobileFeedback,
  sendFeedbackEmail,
  type FeedbackType,
  type FeedbackAccountType,
} from "@/lib/feedback";

export const runtime = "edge";

// POST /me/feedback — in-app feedback from the mobile app. The web
// dashboards have had a "Send Feedback" button since migration 0020; the
// mobile app shipped without any counterpart, which is what this closes.
//
// Mirrors the web app's /api/feedback POST, with three deliberate
// differences:
//
//   * Authentication is required. The web route also serves the public
//     marketing site, so it accepts anonymous submissions with a
//     client-supplied email; every mobile submission comes from a signed-in
//     user, so the email/name/user id are always taken from the session and
//     never trusted from the app.
//   * No honeypot or fill-time bot heuristics. Those exist because the web
//     form is a scrapeable public HTML form; a bearer-token-authenticated
//     JSON endpoint has no equivalent exposure, and the per-user rate limit
//     below is the meaningful control.
//   * source is always "mobile" (see migration 0051), set here rather than
//     accepted from the client, so the platform behind a bug report is
//     knowable without guessing.

const USER_LIMIT_PER_HOUR = 10;

export async function POST(request: NextRequest) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const validation = validateMobileFeedback(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const feedbackType = body.feedbackType as FeedbackType;
  const message = (body.message as string).trim();
  // Free-form platform/version string (e.g. "android 1.0.0 (34)"), capped
  // so a malformed client can't write an unbounded value into the row.
  const client = typeof body.client === "string" ? body.client.slice(0, 200) : undefined;

  const admin = createServiceClient();
  const userId = auth.user.id;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("feedback_submissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= USER_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: "You've submitted a lot of feedback recently — please try again later." },
      { status: 429 }
    );
  }

  // The adults product's auth email is "+nutriai-adults"-scoped (see
  // scopedEmail/displayEmail in the main app's src/lib/auth.ts) — never
  // forward the raw scoped address into the notification email.
  const email = auth.user.email ? auth.user.email.replace(/\+nutriai-[^@]+(?=@)/, "") : undefined;

  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const rawName = profile?.full_name ?? "";
  // profiles.full_name can end up populated from the email-scoping tag
  // rather than a real name — never forward that either.
  const fullName = rawName && !/[@+]/.test(rawName) ? rawName : undefined;

  // Which product this user actually owns, for triage. Adults is checked
  // first and only falls through to gym when there's no adults workspace,
  // matching the web route's product-driven branch (the app doesn't send a
  // product, so this is derived rather than told).
  let accountType: FeedbackAccountType | undefined;
  const { data: adultsWorkspace } = await admin
    .from("workspaces")
    .select("plan")
    .eq("owner_id", userId)
    .eq("type", "adults")
    .limit(1)
    .maybeSingle();
  if (adultsWorkspace) {
    accountType = adultsWorkspace.plan === "self" ? "self" : "family";
  } else {
    const { data: gymWorkspace } = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .eq("type", "gym")
      .limit(1)
      .maybeSingle();
    if (gymWorkspace) accountType = "coach";
  }

  const submittedAt = new Date();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";

  const { error: insertError } = await admin.from("feedback_submissions").insert({
    feedback_type: feedbackType,
    message,
    email: email ?? null,
    full_name: fullName ?? null,
    user_id: userId,
    account_type: accountType ?? null,
    source: "mobile",
    page_url: null,
    user_agent: client ?? null,
    ip_address: ip,
  });

  if (insertError) {
    console.error("[feedback] failed to store submission:", insertError.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // Email delivery failing doesn't fail the request — the submission is
  // already durably saved above, so the user shouldn't be told to retry
  // (which would just create a duplicate row); the failure is logged for
  // the team to follow up manually.
  const emailResult = await sendFeedbackEmail({
    feedbackType,
    message,
    email,
    fullName,
    userId,
    accountType,
    client,
    submittedAt,
  });
  if (!emailResult.ok) {
    console.error("[feedback] email delivery failed after successful save:", emailResult.error);
  }

  return NextResponse.json({ ok: true });
}
