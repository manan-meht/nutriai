import type { SupabaseClient } from "@supabase/supabase-js";

// Stripe Connect: how a coach gets paid.
//
// Express accounts, so Stripe owns identity verification, bank details and
// tax forms. We never see or store a coach's bank account — the only thing
// kept here is the account id and whether Stripe says payouts are enabled.
//
// Raw fetch rather than the Stripe SDK, matching
// lib/billing/providers/stripe-provider.ts: the SDK pulls in Node built-ins
// that don't belong in a Worker, and this app already talks to Stripe this
// way for subscriptions.
//
// `stripe_payouts_enabled` is never set from our own optimism. It mirrors
// what Stripe reports, refreshed when a coach returns from onboarding and
// each time the coach returns from onboarding or opens their payouts page
// — a coach who abandons verification halfway must not end up marked ready
// to take money. NOTE: account.updated is not currently subscribed, so a
// verification that clears asynchronously is only picked up on their next
// visit, not pushed.

const STRIPE_API = "https://api.stripe.com/v1";

function apiKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return key;
}

function toForm(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const walk = (value: unknown, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}[${i}]`));
    else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${key}[${k}]`);
    } else params.append(key, String(value));
  };
  for (const [k, v] of Object.entries(input)) walk(v, k);
  return params;
}

/** A Stripe API failure, carrying the machine-readable code so callers can
 * branch on WHICH failure rather than pattern-matching a message. */
export class StripeApiError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly status: number) {
    super(message);
    this.name = "StripeApiError";
  }
}

/** True when Stripe says the object simply isn't there.
 *
 * The case that matters: Connect accounts are scoped to a mode, so an
 * acct_ created in test mode does not exist under a live key. Switching
 * the platform to live turns every stored account id into a dangling
 * reference, and treating that as a hard error strands the coach — they
 * cannot onboard, because the code believes they already did. */
function isMissingResource(error: unknown): boolean {
  return error instanceof StripeApiError && (error.code === "resource_missing" || error.status === 404);
}

async function stripe<T = any>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const url = method === "GET" && body ? `${STRIPE_API}${path}?${toForm(body)}` : `${STRIPE_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" && body ? toForm(body).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new StripeApiError(
      json?.error?.message ?? `Stripe error (${res.status})`,
      json?.error?.code,
      res.status
    );
  }
  return json as T;
}

export type OnboardingStatus = "not_started" | "pending" | "restricted" | "enabled" | "disabled";

export interface AccountState {
  accountId: string;
  status: OnboardingStatus;
  payoutsEnabled: boolean;
  /** What Stripe is still waiting for, shown to the coach verbatim-ish. */
  requirements: string[];
}

/** Maps a Stripe account object onto our status enum.
 *
 * `charges_enabled && payouts_enabled` is the only state that counts as
 * ready. Anything with `disabled_reason` set is disabled regardless of the
 * other flags — Stripe can leave charges enabled on an account it has
 * decided to stop paying out. */
export function readAccountState(account: any): Omit<AccountState, "accountId"> {
  const req = account?.requirements ?? {};
  const due: string[] = [...(req.currently_due ?? []), ...(req.past_due ?? [])];
  const payoutsEnabled = account?.payouts_enabled === true && account?.charges_enabled === true;

  // Order matters. A disabled_reason outranks the flags — Stripe can leave
  // charges_enabled and payouts_enabled true on an account it has decided
  // to stop paying out — except for pending_verification, which is a
  // review in progress rather than a decision.
  let status: OnboardingStatus;
  if (req.disabled_reason === "requirements.pending_verification") {
    // Stripe is checking documents the coach already submitted. Reporting
    // this as "disabled" told a coach their payouts had been paused when
    // nothing was wrong and nothing was owed by them — it clears on its
    // own. It is a review, not a rejection.
    status = "restricted";
  } else if (req.disabled_reason) {
    status = "disabled";
  } else if (payoutsEnabled) {
    status = "enabled";
  } else if (due.length > 0 || account?.details_submitted === false) {
    status = "pending";
  } else {
    status = "restricted";
  }

  return { status, payoutsEnabled, requirements: due };
}

/** Creates the coach's Express account if they don't have one yet. */
export async function ensureConnectAccount(
  admin: SupabaseClient,
  coachProfileId: string,
  email: string | undefined,
  country: string,
  clubOrigin: string
): Promise<string> {
  const { data: coach } = await admin
    .from("coach_profiles")
    .select("stripe_account_id, display_name, headline, status")
    .eq("id", coachProfileId)
    .maybeSingle();

  if (coach?.stripe_account_id) {
    // Confirm it exists under the CURRENT key before handing it back. A
    // stored id from the other mode (or a deleted account) would otherwise
    // be returned here and blow up in createOnboardingLink, leaving the
    // coach with no route to getting paid.
    try {
      await stripe<any>("GET", `/accounts/${coach.stripe_account_id}`);
      return coach.stripe_account_id;
    } catch (error) {
      if (!isMissingResource(error)) throw error;
      console.warn(
        `[connect] ${coach.stripe_account_id} is not present under the current Stripe key; re-onboarding coach ${coachProfileId}`
      );
      await clearConnectAccount(admin, coachProfileId);
    }
  }

  // Stripe asks every account for a business website, which a
  // self-employed coach almost never has — and being unable to answer is
  // where onboarding stalls. Their Tistra Club profile IS their web
  // presence: public, showing what they teach and what it costs, which is
  // exactly what Stripe is looking for. Pre-filling it means the question
  // is never put to them.
  //
  // An unpublished profile 404s, so the club homepage stands in until they
  // go live rather than sending Stripe to a dead link during review.
  const profileUrl =
    coach?.status === "published" ? `${clubOrigin}/coaches/${coachProfileId}` : clubOrigin;

  const account = await stripe<any>("POST", "/accounts", {
    type: "express",
    country,
    email,
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    business_type: "individual",
    business_profile: {
      name: coach?.display_name || undefined,
      url: profileUrl,
      // 7997: membership clubs, sports and recreation — what an in-person
      // coaching session is, and it saves the coach guessing at a category.
      mcc: "7997",
      product_description:
        coach?.headline?.trim() ||
        "One-to-one and small-group coaching sessions booked through Tistra Club",
    },
    metadata: { coach_profile_id: coachProfileId },
  });

  await admin
    .from("coach_profiles")
    .update({ stripe_account_id: account.id, stripe_onboarding_status: "pending" })
    .eq("id", coachProfileId);

  return account.id;
}

/** A single-use link into Stripe's hosted onboarding. These expire in
 * minutes, so one is minted per click rather than stored. */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const link = await stripe<any>("POST", "/account_links", {
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

/** A link to Stripe's Express dashboard, where a coach manages their bank
 * details and sees their payouts. */
export async function createDashboardLink(accountId: string): Promise<string> {
  const link = await stripe<any>("POST", `/accounts/${accountId}/login_links`);
  return link.url;
}

/** Forgets a Connect account that no longer resolves, so the coach is
 * offered onboarding again instead of being told they are already set up.
 * Never called for a real failure — only for a confirmed missing account. */
async function clearConnectAccount(admin: SupabaseClient, coachProfileId: string): Promise<void> {
  await admin
    .from("coach_profiles")
    .update({
      stripe_account_id: null,
      stripe_onboarding_status: "not_started",
      // The critical field: leaving this true would let checkout attempt a
      // destination charge to an account that isn't there.
      stripe_payouts_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", coachProfileId);
}

/** Re-reads the account from Stripe and stores what it says. */
export async function refreshAccountState(
  admin: SupabaseClient,
  coachProfileId: string,
  accountId: string
): Promise<AccountState> {
  let account: any;
  try {
    account = await stripe<any>("GET", `/accounts/${accountId}`);
  } catch (error) {
    if (!isMissingResource(error)) throw error;
    // Same mode-switch case as ensureConnectAccount. Reporting
    // "not_started" is both true and actionable; throwing would only
    // surface a Stripe error on the coach's payouts page.
    await clearConnectAccount(admin, coachProfileId);
    return { accountId, status: "not_started", payoutsEnabled: false, requirements: [] };
  }
  const state = readAccountState(account);

  await admin
    .from("coach_profiles")
    .update({
      stripe_onboarding_status: state.status,
      stripe_payouts_enabled: state.payoutsEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", coachProfileId);

  return { accountId, ...state };
}

/**
 * PaymentIntent parameters for a session payment.
 *
 * This is a DESTINATION charge: the charge is created on the Tistra
 * account and Stripe transfers the coach's share to their connected
 * account. That structure is what makes "the coach receives 90%" true.
 *
 * Two things must not change without understanding the consequence:
 *
 *  1. `on_behalf_of` is deliberately NOT set to the connected account.
 *     Setting it makes the connected account the settlement merchant, and
 *     Stripe's processing fee is then deducted from THEIR balance. The
 *     coach's payout would vary with card type and country, and the flat
 *     90% quoted on their settings page would quietly stop being true.
 *
 *  2. `application_fee_amount` is the platform's whole take, out of which
 *     Stripe's processing fee is paid. It is not "our margin on top" —
 *     the fee is inclusive, so the platform nets the application fee minus
 *     whatever the card cost.
 *
 * The coach's amount is never sent to Stripe directly; it is whatever
 * remains after the application fee, which is why splitAmount's guarantee
 * that the two halves sum exactly to the gross matters here.
 */
export function destinationChargeParams(input: {
  grossAmountCents: number;
  applicationFeeCents: number;
  currency: string;
  connectedAccountId: string;
  metadata?: Record<string, string>;
}): Record<string, unknown> {
  if (input.applicationFeeCents > input.grossAmountCents) {
    throw new Error("Application fee cannot exceed the amount charged");
  }
  return {
    amount: input.grossAmountCents,
    currency: input.currency.toLowerCase(),
    application_fee_amount: input.applicationFeeCents,
    transfer_data: { destination: input.connectedAccountId },
    automatic_payment_methods: { enabled: true },
    metadata: input.metadata ?? {},
  };
}
