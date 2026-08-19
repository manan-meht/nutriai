import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformFeePercent } from "./platform-fee";
import { splitAmount } from "./config";

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
  const feePercent = await getPlatformFeePercent(admin);
  const { platformFeeCents } = splitAmount(req.priceCents, feePercent);

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
      metadata: { hold_id: req.holdId, coach_profile_id: req.coachProfileId },
    },
    // Also on the session: the webhook reads it from here, since the
    // session is what checkout.session.completed carries.
    metadata: { hold_id: req.holdId, coach_profile_id: req.coachProfileId },
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
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
}

/** Reads a session back. Used on return from Stripe and by the webhook, so
 * neither has to trust what the browser says about payment. */
export async function readCheckoutSession(sessionId: string): Promise<SessionOutcome> {
  const s = await stripe<any>("GET", `/checkout/sessions/${sessionId}`);
  return {
    paid: s.payment_status === "paid",
    holdId: s.metadata?.hold_id ?? null,
    paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
    amountTotal: s.amount_total ?? null,
    currency: s.currency ?? null,
  };
}
