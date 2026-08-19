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
// on the account.updated webhook — a coach who abandons verification
// halfway must not end up marked ready to take money.

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
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error (${res.status})`);
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

  let status: OnboardingStatus;
  if (req.disabled_reason) status = "disabled";
  else if (payoutsEnabled) status = "enabled";
  else if (due.length > 0 || account?.details_submitted === false) status = "pending";
  else status = "restricted";

  return { status, payoutsEnabled, requirements: due };
}

/** Creates the coach's Express account if they don't have one yet. */
export async function ensureConnectAccount(
  admin: SupabaseClient,
  coachProfileId: string,
  email: string | undefined,
  country: string
): Promise<string> {
  const { data: coach } = await admin
    .from("coach_profiles")
    .select("stripe_account_id")
    .eq("id", coachProfileId)
    .maybeSingle();

  if (coach?.stripe_account_id) return coach.stripe_account_id;

  const account = await stripe<any>("POST", "/accounts", {
    type: "express",
    country,
    email,
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    business_type: "individual",
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

/** Re-reads the account from Stripe and stores what it says. */
export async function refreshAccountState(
  admin: SupabaseClient,
  coachProfileId: string,
  accountId: string
): Promise<AccountState> {
  const account = await stripe<any>("GET", `/accounts/${accountId}`);
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
