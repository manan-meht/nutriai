import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformFeePercent } from "./platform-fee";
import { resolveBookingFee } from "./founding-offer";

// Stripe Checkout for a session booking.
//
// Hosted Checkout rather than Elements: Stripe collects the card, handles
// 3-D Secure and PayNow, and no card data touches this app. What comes back
// is a session id.
//
// The charge is a DESTINATION charge — see destinationChargeParams in
// stripe-connect.ts for why `on_behalf_of` must stay unset. The coach
// receives the price minus the platform fee; Stripe's processing cost comes
// out of the platform's share.
//
// Settlement happens twice on purpose: once when the client returns from
// Stripe (instant confirmation) and once from the webhook (for the client
// who closes the tab). convertHoldToBooking is idempotent, so whichever
// arrives second is a no-op rather than a second booking.

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

/** True when real payments can be taken. Without it the mock provider runs,
 * which is right for development but must never be mistaken for live. */
export function stripeCheckoutConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export interface SessionRequest {
  holdId: string;
  coachProfileId: string;
  connectedAccountId: string;
  description: string;
  priceCents: number;
  currency: string;
  clientEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

/** Creates the hosted Checkout session and returns its URL. */
export async function createBookingCheckoutSession(
  admin: SupabaseClient,
  req: SessionRequest
): Promise<{ url: string; sessionId: string; platformFeeCents: number }> {
  // Founding offer applied here, at the one place the money is decided.
  const fee = await resolveBookingFee(admin, req.coachProfileId, req.priceCents);
  const platformFeeCents = fee.platformFeeCents;

  const session = await stripe<any>("POST", "/checkout/sessions", {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: req.currency.toLowerCase(),
          unit_amount: req.priceCents,
          product_data: { name: req.description },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: req.connectedAccountId },
      // on_behalf_of is deliberately absent — see stripe-connect.ts.
      // founding_free travels with the payment so settlement records what
      // Stripe was actually told, rather than recomputing an allowance that
      // may have been consumed by another booking in the meantime.
      metadata: {
        hold_id: req.holdId,
        coach_profile_id: req.coachProfileId,
        founding_free: fee.foundingFree ? "1" : "0",
        fee_percent: String(fee.feePercent),
      },
    },
    // Also on the session: the webhook reads it from here, since the
    // session is what checkout.session.completed carries — and so does
    // readCheckoutSession, which is where settlement learns whether this
    // booking consumed a founding-offer free slot.
    metadata: {
      hold_id: req.holdId,
      coach_profile_id: req.coachProfileId,
      founding_free: fee.foundingFree ? "1" : "0",
      fee_percent: String(fee.feePercent),
    },
    customer_email: req.clientEmail,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    // A hold expires in minutes; a Checkout session that outlived it would
    // let someone pay for a slot already released.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  return { url: session.url, sessionId: session.id, platformFeeCents };
}

export interface SessionOutcome {
  paid: boolean;
  holdId: string | null;
  /** Set instead of holdId when the session paid for a class pack. Both
   * the return page and the webhook branch on which one is present. */
  packPurchaseId: string | null;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  /** Whether this payment consumed one of the coach's founding-offer free
   * bookings. Read from the session Stripe holds, never recomputed. */
  foundingFree: boolean;
  /** The commission percentage applied, for the ledger. */
  feePercent: number | null;
}

export interface PackSessionRequest {
  purchaseId: string;
  coachProfileId: string;
  connectedAccountId: string;
  description: string;
  priceCents: number;
  platformFeeCents: number;
  currency: string;
  clientEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

/** Checkout for a class pack.
 *
 * Same destination charge as a single booking — the coach is paid at once
 * and the platform fee is inclusive — so buying ten classes is never a way
 * to pay a different rate than buying them one at a time.
 *
 * The fee is passed in rather than recomputed here: it was already worked
 * out and written to the purchase row, and recomputing risks the charge
 * and the record disagreeing if the platform rate changes mid-checkout.
 *
 * No expires_at. A booking session is capped because it holds a slot that
 * must be released; a pack holds nothing, so an abandoned tab costs
 * nobody anything.
 */
export async function createPackCheckoutSession(
  req: PackSessionRequest
): Promise<{ url: string; sessionId: string }> {
  const session = await stripe<any>("POST", "/checkout/sessions", {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: req.currency.toLowerCase(),
          unit_amount: req.priceCents,
          product_data: { name: req.description },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: req.platformFeeCents,
      transfer_data: { destination: req.connectedAccountId },
      // on_behalf_of is deliberately absent — see stripe-connect.ts.
      metadata: { pack_purchase_id: req.purchaseId, coach_profile_id: req.coachProfileId },
    },
    // Also on the session: checkout.session.completed carries the session,
    // and the webhook reads the id from here to tell a pack from a booking.
    metadata: { pack_purchase_id: req.purchaseId, coach_profile_id: req.coachProfileId },
    customer_email: req.clientEmail,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
  });

  return { url: session.url, sessionId: session.id };
}

/** Reads a session back. Used on return from Stripe and by the webhook, so
 * neither has to trust what the browser says about payment. */
export async function readCheckoutSession(sessionId: string): Promise<SessionOutcome> {
  const s = await stripe<any>("GET", `/checkout/sessions/${sessionId}`);
  return {
    paid: s.payment_status === "paid",
    holdId: s.metadata?.hold_id ?? null,
    packPurchaseId: s.metadata?.pack_purchase_id ?? null,
    paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
    amountTotal: s.amount_total ?? null,
    currency: s.currency ?? null,
    foundingFree: s.metadata?.founding_free === "1",
    feePercent: s.metadata?.fee_percent != null ? Number(s.metadata.fee_percent) : null,
  };
}
