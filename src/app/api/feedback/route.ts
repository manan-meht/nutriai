import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendFeedbackEmail } from "@/lib/feedback/send-feedback-email";
import { displayEmail } from "@/lib/auth";
import { validateFeedbackSubmission, isSuspiciouslyFast } from "@/lib/feedback/validate";
import type { FeedbackAccountType, FeedbackSubmitRequest } from "@/lib/feedback/types";

export const runtime = "edge";

// Loose but real per-IP/per-user caps — this repo has no shared in-memory
// rate limiter (Cloudflare edge isolates don't share process memory, see
// the encryption-key saga in this app's history for why in-memory state
// can't be trusted here), so this queries feedback_submissions directly.
const IP_LIMIT_PER_HOUR = 5;
const USER_LIMIT_PER_HOUR = 10;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as (FeedbackSubmitRequest & { product?: "gym" | "adults" }) | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  // Honeypot: real users never see or fill this field. Bots that
  // blanket-fill every input in a scraped form do. Return a fake success
  // so scrapers don't learn the honeypot is being checked.
  if (body.website) {
    return NextResponse.json({ ok: true });
  }

  const validation = validateFeedbackSubmission(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const message = body.message.trim();

  // Soft bot check — logged only, never blocks on its own (a slow network
  // or a user who paused before submitting shouldn't be punished), but
  // combined with the honeypot above catches the common case of scripted
  // form fills that submit near-instantly.
  const filledSuspiciouslyFast = isSuspiciouslyFast(body.renderedAt);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createServiceClient();

  // Logged-in submissions always use the session's own email/name/user
  // ID — never whatever the browser sent, which the client can't be
  // trusted to set correctly (or honestly) for an authenticated request.
  let email: string | undefined;
  let fullName: string | undefined;
  let userId: string | undefined;
  let accountType: FeedbackAccountType | undefined;

  if (user) {
    userId = user.id;
    // The adults product's auth email is "+nutriai-adults"-scoped (see
    // scopedEmail in src/lib/auth.ts) — never forward the raw scoped
    // address into the internal notification email.
    email = user.email ? displayEmail(user.email) : undefined;

    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const rawName = profile?.full_name ?? "";
    // profiles.full_name can end up populated from the "+nutriai-adults"
    // email-scoping tag (see scopedEmail in src/lib/auth.ts) rather than a
    // real name — never forward that into an internal email either.
    fullName = rawName && !/[@+]/.test(rawName) ? rawName : undefined;

    if (body.product === "gym") {
      const { data: gymWorkspace } = await admin.from("workspaces").select("id").eq("owner_id", user.id).eq("type", "gym").limit(1).maybeSingle();
      if (gymWorkspace) accountType = "coach";
    } else if (body.product === "adults") {
      const { data: adultsWorkspace } = await admin.from("workspaces").select("plan").eq("owner_id", user.id).eq("type", "adults").limit(1).maybeSingle();
      if (adultsWorkspace) accountType = adultsWorkspace.plan === "self" ? "self" : "family";
    }
  } else if (body.email?.trim()) {
    email = body.email.trim();
  }

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  if (userId) {
    const { count } = await admin
      .from("feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= USER_LIMIT_PER_HOUR) {
      return NextResponse.json({ error: "You've submitted a lot of feedback recently — please try again later." }, { status: 429 });
    }
  } else {
    const { count } = await admin
      .from("feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= IP_LIMIT_PER_HOUR) {
      return NextResponse.json({ error: "Too many submissions from this connection — please try again later." }, { status: 429 });
    }
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;
  const pageUrl = body.pageUrl?.slice(0, 500);
  const submittedAt = new Date();

  // A bot-flagged submission is still recorded (for abuse visibility) but
  // never emailed and always reports success, so scripted submitters get
  // no signal that anything was filtered.
  const { error: insertError } = await admin.from("feedback_submissions").insert({
    feedback_type: body.feedbackType,
    message,
    email: email ?? null,
    full_name: fullName ?? null,
    user_id: userId ?? null,
    account_type: accountType ?? null,
    source: body.source,
    page_url: pageUrl ?? null,
    user_agent: userAgent ?? null,
    ip_address: ip,
  });

  if (insertError) {
    console.error("[feedback] failed to store submission:", insertError.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  if (filledSuspiciouslyFast) {
    return NextResponse.json({ ok: true });
  }

  // Email delivery failing doesn't fail the request — the submission is
  // already durably saved above, so the user shouldn't be told to retry
  // (which would just create a duplicate row); the delivery failure is
  // logged server-side for the team to notice and follow up manually.
  const emailResult = await sendFeedbackEmail({
    feedbackType: body.feedbackType,
    message,
    email,
    fullName,
    userId,
    accountType,
    source: body.source,
    pageUrl,
    userAgent,
    submittedAt,
  });
  if (!emailResult.ok) {
    console.error("[feedback] email delivery failed after successful save:", emailResult.error);
  }

  return NextResponse.json({ ok: true });
}
