import type { SupabaseClient } from "@supabase/supabase-js";
import { splitAmount } from "./config";
import { getPlatformFeePercent } from "./platform-fee";

/** Bookings a founding coach keeps in full.
 *
 * Single source of truth: the landing page imports this rather than stating
 * its own number, so the marketing copy and the money cannot disagree. The
 * per-coach grant lives in coach_profiles.founding_free_bookings — this is
 * only the number a new founding coach is given.
 */
export const FOUNDING_FREE_BOOKINGS = 10;

/** Stripe's cut of a card payment, which the coach pays even under the
 * founding offer.
 *
 * This is NOT Tistra's margin. These are destination charges, so Stripe's
 * processing fee is taken out of the platform's balance and
 * `application_fee_amount` is the platform's whole take (see
 * stripe-connect.ts). Setting the application fee to a literal zero would
 * therefore mean Tistra PAYS the card cost on every free booking — roughly
 * S$5.94 on a S$160 session — rather than merely earning nothing on it.
 *
 * So a "free" booking sets the application fee to Stripe's own cost. Tistra
 * nets approximately zero and the coach bears card processing, which is the
 * intended offer: no commission, not free money.
 *
 * Tistra's actual Stripe Singapore pricing:
 *
 *   Domestic cards (issued in SG)          3.4% + S$0.50
 *   International cards (settled in SGD)   3.9% + S$0.50   (3.4% + 0.5% surcharge)
 *   USD-settled                            3.4% + US$0.50
 *
 * We charge the DOMESTIC rate, deliberately, and absorb the surcharge when a
 * client pays with a foreign card.
 *
 * The reason is a hard constraint rather than a preference:
 * `application_fee_amount` has to be fixed when the Checkout Session is
 * created, which is before the customer has entered a card — so the card's
 * country is genuinely unknowable at the only moment we can set the fee.
 *
 * Given that, the choice is which way to be wrong. Charging 3.9% would have
 * Tistra keeping about 0.5% on every domestic booking while advertising zero
 * commission, which is a small untruth on the majority of transactions.
 * Charging 3.4% costs Tistra about S$0.80 on a S$160 international booking
 * and keeps the promise intact on all of them. The error should land on the
 * platform, not on the coach we made the promise to.
 *
 * Settlement is SGD (CLUB_MARKET.currency), so the S$0.50 fixed component is
 * the right one; the USD-settled row above does not apply unless that
 * changes.
 */
export const STRIPE_PERCENT = Number(process.env.STRIPE_PROCESSING_PERCENT ?? "3.4");
export const STRIPE_FIXED_CENTS = Number(process.env.STRIPE_PROCESSING_FIXED_CENTS ?? "50");

/** The extra Stripe charges on a foreign-issued card, for reference and for
 * working out what the offer costs. Not added to the application fee — see
 * the note above on why the domestic rate is used. */
export const STRIPE_INTERNATIONAL_SURCHARGE_PERCENT = 0.5;

/** What Stripe will take from a charge of this size, in cents.
 *
 * Rounds UP. A rounding loss of one cent per booking is invisible to a
 * coach and keeps the platform from slowly funding the promotion out of
 * fractions. */
export function stripeProcessingCents(grossCents: number): number {
  const raw = (grossCents * STRIPE_PERCENT) / 100 + STRIPE_FIXED_CENTS;
  // Never more than the charge itself — destinationChargeParams throws if the
  // application fee exceeds gross, and a tiny booking could otherwise trip it.
  return Math.min(grossCents, Math.ceil(raw));
}

/** How many commission-free bookings this coach still has.
 *
 * Derived, not stored. Allowance minus the payments that actually settled
 * against it, so a refunded booking returns the benefit rather than
 * silently consuming it.
 *
 * Returns 0 on any error. Failing closed matters here: charging the standard
 * fee when a free booking was owed is a support conversation and a refund,
 * while charging nothing when it was not owed is money the platform never
 * sees again and cannot detect afterwards.
 */
export async function foundingFreeRemaining(
  admin: SupabaseClient,
  coachProfileId: string
): Promise<number> {
  const { data: coach, error } = await admin
    .from("coach_profiles")
    .select("founding_free_bookings")
    .eq("id", coachProfileId)
    .maybeSingle();
  if (error || !coach) return 0;

  const allowance = Number((coach as { founding_free_bookings: number }).founding_free_bookings ?? 0);
  if (!Number.isFinite(allowance) || allowance <= 0) return 0;

  const { count, error: countError } = await admin
    .from("club_payments")
    .select("id", { count: "exact", head: true })
    .eq("coach_profile_id", coachProfileId)
    .eq("founding_free", true)
    .eq("status", "succeeded");
  if (countError) return 0;

  return Math.max(0, allowance - (count ?? 0));
}

export interface ResolvedFee {
  /** What Stripe is told to hold back as the application fee. Under the
   * offer this is Stripe's own processing cost, not platform margin. */
  platformFeeCents: number;
  coachAmountCents: number;
  /** The percentage recorded on the payment. 0 under the offer — the
   * ledger should say Tistra took no commission, because it did not. */
  feePercent: number;
  foundingFree: boolean;
}

/**
 * The fee for one booking, with the founding offer applied if it is owed.
 *
 * Concurrency: two checkouts completing at once on the coach's last free
 * booking will both be free. That is deliberate. The alternative is holding
 * allowance open at checkout, which loses it to every abandoned cart — and
 * over-granting one booking on a promotion is a far cheaper mistake than
 * charging a founding coach we told we would not.
 */
export async function resolveBookingFee(
  admin: SupabaseClient,
  coachProfileId: string,
  grossCents: number
): Promise<ResolvedFee> {
  const remaining = await foundingFreeRemaining(admin, coachProfileId);
  if (remaining > 0) {
    const processing = stripeProcessingCents(grossCents);
    return {
      platformFeeCents: processing,
      coachAmountCents: grossCents - processing,
      feePercent: 0,
      foundingFree: true,
    };
  }
  const feePercent = await getPlatformFeePercent(admin);
  const { platformFeeCents, coachAmountCents } = splitAmount(grossCents, feePercent);
  return { platformFeeCents, coachAmountCents, feePercent, foundingFree: false };
}
