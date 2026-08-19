import type { SupabaseClient } from "@supabase/supabase-js";
import { convertHoldToBooking } from "./holds";
import { splitAmount, DEFAULT_PLATFORM_FEE_PERCENT, CLUB_MARKET } from "./config";
import { attachCoachLocationToBooking } from "./locations";
import { getPlatformFeePercent } from "./platform-fee";
import { readCheckoutSession } from "./checkout-session";

// Marketplace payments.
//
// Two things this file is careful about:
//
//  1. Card data never reaches us. A provider returns an opaque reference;
//     that reference is all we store. There is no code path here that
//     accepts a card number, and there must never be one.
//  2. Money is integer cents end to end. splitAmount() does the fee maths
//     and gives the rounding remainder to the coach, so gross always equals
//     platform_fee + coach_amount exactly.
//
// The provider is behind an interface because Stripe Connect onboarding is
// not live yet. The mock provider settles immediately; Stripe settles via
// webhook. Both call settlePayment() — so the code path that actually turns
// a hold into a booking is identical in both, and the webhook wiring later
// is a provider swap, not a rewrite of the booking logic.

export interface PaymentIntent {
  /** Opaque provider reference. Never a card number. */
  providerRef: string;
  /** Present only for providers with a client-side confirmation step. */
  clientSecret?: string;
  /** True when the provider settled synchronously (mock/test only). */
  settledImmediately: boolean;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: {
    amountCents: number;
    currency: string;
    connectedAccountId: string | null;
    platformFeeCents: number;
    metadata: Record<string, string>;
  }): Promise<PaymentIntent>;
}

/** Development/staging provider. Settles instantly and holds no card data —
 * it exists so the full booking chain is exercisable before Stripe Connect
 * onboarding is live. */
const mockProvider: PaymentProvider = {
  name: "mock",
  async createIntent() {
    return {
      providerRef: `mock_pi_${crypto.randomUUID()}`,
      settledImmediately: true,
    };
  },
};

export function getPaymentProvider(): PaymentProvider {
  // Stripe is added here once Connect onboarding exists; until then an
  // explicit "stripe" setting would silently do nothing, so we don't
  // pretend to support it.
  return mockProvider;
}

export interface CheckoutRequest {
  holdId: string;
  serviceId: string | null;
  skillId?: string | null;
  priceCents: number;
  travelFeeCents?: number;
  currency?: string;
  clientNote?: string | null;
  cancellationPolicySnapshot: Record<string, unknown>;
  connectedAccountId?: string | null;
}

export type CheckoutResult =
  | { ok: true; bookingId: string; paymentId: string }
  | { ok: false; message: string };

/**
 * Charges for a held slot and, on settlement, converts the hold into a
 * confirmed booking.
 *
 * Ordering matters: the payment intent is created first, but the booking is
 * only written after settlement. If the slot was lost while payment was in
 * flight, convertHoldToBooking fails and the payment is marked for refund
 * rather than leaving two clients on one session.
 */
export async function checkout(admin: SupabaseClient, req: CheckoutRequest): Promise<CheckoutResult> {
  const currency = req.currency ?? CLUB_MARKET.currency;
  const gross = req.priceCents + (req.travelFeeCents ?? 0);
  const { platformFeeCents, coachAmountCents } = splitAmount(gross, DEFAULT_PLATFORM_FEE_PERCENT);

  const { data: hold } = await admin
    .from("booking_holds")
    .select("id, coach_profile_id, client_profile_id, expires_at, released_at, booking_id")
    .eq("id", req.holdId)
    .maybeSingle();
  if (!hold) return { ok: false, message: "This hold no longer exists." };
  if (hold.booking_id) {
    const { data: existing } = await admin.from("club_payments").select("id").eq("booking_id", hold.booking_id).maybeSingle();
    return { ok: true, bookingId: hold.booking_id, paymentId: existing?.id ?? "" };
  }
  if (hold.released_at || new Date(hold.expires_at) <= new Date()) {
    return { ok: false, message: "Your hold expired. Please pick a time again." };
  }

  const provider = getPaymentProvider();
  let intent: PaymentIntent;
  try {
    intent = await provider.createIntent({
      amountCents: gross,
      currency,
      connectedAccountId: req.connectedAccountId ?? null,
      platformFeeCents,
      metadata: { hold_id: req.holdId, coach_profile_id: hold.coach_profile_id },
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Payment could not be started." };
  }

  if (!intent.settledImmediately) {
    // Real providers confirm out of band; the booking is created by
    // settlePayment() when the webhook arrives, not here.
    return { ok: false, message: "Awaiting payment confirmation." };
  }

  return settlePayment(admin, {
    holdId: req.holdId,
    providerRef: intent.providerRef,
    grossAmountCents: gross,
    platformFeeCents,
    coachAmountCents,
    currency,
    serviceId: req.serviceId,
    skillId: req.skillId ?? null,
    priceCents: req.priceCents,
    travelFeeCents: req.travelFeeCents ?? 0,
    clientNote: req.clientNote ?? null,
    cancellationPolicySnapshot: req.cancellationPolicySnapshot,
  });
}

/**
 * The settlement path. Called by the mock provider synchronously and (once
 * live) by the Stripe webhook — never directly by a browser callback, since
 * a client cannot be trusted to assert that payment succeeded.
 */
export async function settlePayment(
  admin: SupabaseClient,
  input: {
    holdId: string;
    providerRef: string;
    grossAmountCents: number;
    platformFeeCents: number;
    coachAmountCents: number;
    currency: string;
    serviceId: string | null;
    skillId: string | null;
    priceCents: number;
    travelFeeCents: number;
    clientNote: string | null;
    cancellationPolicySnapshot: Record<string, unknown>;
  }
): Promise<CheckoutResult> {
  const converted = await convertHoldToBooking(admin, input.holdId, {
    serviceId: input.serviceId,
    skillId: input.skillId,
    priceCents: input.priceCents,
    travelFeeCents: input.travelFeeCents,
    currency: input.currency,
    timezone: CLUB_MARKET.timezone,
    cancellationPolicySnapshot: input.cancellationPolicySnapshot,
    clientNote: input.clientNote,
  });

  if (!converted.ok) {
    // Payment succeeded but the slot did not survive. Surfacing this as a
    // failure is correct: the caller refunds rather than double-booking.
    return { ok: false, message: converted.message };
  }
  if (converted.alreadyExisted) {
    const { data: existing } = await admin.from("club_payments").select("id").eq("booking_id", converted.bookingId).maybeSingle();
    return { ok: true, bookingId: converted.bookingId, paymentId: existing?.id ?? "" };
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("coach_profile_id, client_profile_id")
    .eq("id", converted.bookingId)
    .single();

  // Gives the confirmed booking a location to release (see
  // resolveBookingAddress); the address itself stays behind the join.
  await attachCoachLocationToBooking(admin, converted.bookingId, booking!.coach_profile_id);

  const { data: payment } = await admin
    .from("club_payments")
    .insert({
      booking_id: converted.bookingId,
      coach_profile_id: booking!.coach_profile_id,
      client_profile_id: booking!.client_profile_id,
      gross_amount_cents: input.grossAmountCents,
      platform_fee_cents: input.platformFeeCents,
      coach_amount_cents: input.coachAmountCents,
      currency: input.currency,
      platform_fee_percent: DEFAULT_PLATFORM_FEE_PERCENT,
      stripe_payment_intent_id: input.providerRef,
      status: "succeeded",
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return { ok: true, bookingId: converted.bookingId, paymentId: payment?.id ?? "" };
}

/**
 * Settles a booking from a completed Stripe Checkout session.
 *
 * Called from two places on purpose — the client's return from Stripe, and
 * the checkout.session.completed webhook. The first gives instant
 * confirmation; the second covers the client who closes the tab. Both read
 * the session from Stripe rather than trusting the caller, and
 * convertHoldToBooking is idempotent, so whichever runs second is a no-op
 * instead of a second booking.
 */
export async function settleFromCheckoutSession(
  admin: SupabaseClient,
  sessionId: string
): Promise<CheckoutResult> {
  const outcome = await readCheckoutSession(sessionId);
  if (!outcome.paid) return { ok: false, message: "Payment hasn't completed." };
  if (!outcome.holdId) return { ok: false, message: "That payment isn't linked to a booking." };

  const { data: hold } = await admin
    .from("booking_holds")
    .select("id, coach_profile_id, service_id, booking_id")
    .eq("id", outcome.holdId)
    .maybeSingle();
  if (!hold) return { ok: false, message: "This hold no longer exists." };

  // Already settled by whichever path got here first.
  if (hold.booking_id) {
    const { data: existing } = await admin.from("club_payments").select("id").eq("booking_id", hold.booking_id).maybeSingle();
    return { ok: true, bookingId: hold.booking_id, paymentId: existing?.id ?? "" };
  }

  const [{ data: service }, { data: coach }] = await Promise.all([
    admin.from("coach_services").select("price_cents, currency, skill_id").eq("id", hold.service_id).maybeSingle(),
    admin
      .from("coach_profiles")
      .select("cancellation_full_refund_hours, cancellation_partial_refund_percent")
      .eq("id", hold.coach_profile_id)
      .maybeSingle(),
  ]);
  if (!service || !coach) return { ok: false, message: "This session is no longer available." };

  // The amount actually charged is authoritative — a price edited between
  // hold and payment must not change what the ledger records.
  const gross = outcome.amountTotal ?? service.price_cents;
  const feePercent = await getPlatformFeePercent(admin);
  const { platformFeeCents, coachAmountCents } = splitAmount(gross, feePercent);

  return settlePayment(admin, {
    holdId: outcome.holdId,
    providerRef: outcome.paymentIntentId ?? sessionId,
    grossAmountCents: gross,
    platformFeeCents,
    coachAmountCents,
    currency: (outcome.currency ?? service.currency).toUpperCase(),
    serviceId: hold.service_id,
    skillId: service.skill_id,
    priceCents: gross,
    travelFeeCents: 0,
    clientNote: null,
    cancellationPolicySnapshot: {
      fullRefundHours: coach.cancellation_full_refund_hours,
      partialRefundPercent: coach.cancellation_partial_refund_percent,
    },
  });
}
