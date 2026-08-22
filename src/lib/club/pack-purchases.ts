import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformFeePercent } from "./platform-fee";
import { splitAmount } from "./config";
import { packExpiryDate, creditsRemaining, type PackCredits } from "./class-packs";
import { readCheckoutSession } from "./checkout-session";

/**
 * Buying a class pack, and spending the credits it creates.
 *
 * Settlement mirrors bookings exactly (payments.ts): the return page and
 * the webhook both call it, whichever arrives first wins, and the second
 * is a no-op. Anything else double-credits a pack on a slow webhook.
 */

export interface PackPurchaseResult {
  ok: boolean;
  purchaseId?: string;
  message?: string;
}

/** Creates the PENDING row a Checkout session will be attached to.
 *
 * Priced from the pack row rather than anything the client sends: the
 * amount charged has to be the coach's own, and a forged price would
 * otherwise become both the charge and the fee basis. */
export async function createPendingPackPurchase(
  admin: SupabaseClient,
  input: { packId: string; clientProfileId: string }
): Promise<{ purchaseId: string; priceCents: number; currency: string; coachProfileId: string; serviceId: string; classCount: number } | { error: string }> {
  const { data: pack } = await admin
    .from("coach_class_packs")
    .select("id, coach_profile_id, service_id, class_count, price_cents, currency, expires_after_days, is_active")
    .eq("id", input.packId)
    .maybeSingle();
  if (!pack || !pack.is_active) return { error: "That pack is no longer on sale." };

  const feePercent = await getPlatformFeePercent(admin);
  const { platformFeeCents } = splitAmount(pack.price_cents, feePercent);

  const { data, error } = await admin
    .from("club_pack_purchases")
    .insert({
      pack_id: pack.id,
      coach_profile_id: pack.coach_profile_id,
      client_profile_id: input.clientProfileId,
      service_id: pack.service_id,
      classes_total: pack.class_count,
      price_cents: pack.price_cents,
      platform_fee_cents: platformFeeCents,
      currency: pack.currency,
      status: "PENDING",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  return {
    purchaseId: data.id,
    priceCents: pack.price_cents,
    currency: pack.currency,
    coachProfileId: pack.coach_profile_id,
    serviceId: pack.service_id,
    classCount: pack.class_count,
  };
}

/**
 * Turns a paid Checkout session into live credits.
 *
 * Idempotent by the same rule bookings use: a purchase already ACTIVE is
 * returned as-is rather than re-credited. The return page and the webhook
 * both call this, and on a slow webhook they overlap.
 */
export async function activatePackPurchase(
  admin: SupabaseClient,
  input: { purchaseId: string; paymentIntentId?: string | null }
): Promise<PackPurchaseResult> {
  const { data: purchase } = await admin
    .from("club_pack_purchases")
    .select("id, status, pack_id, purchased_at")
    .eq("id", input.purchaseId)
    .maybeSingle();
  if (!purchase) return { ok: false, message: "That purchase no longer exists." };

  // Whichever path got here first has already credited it.
  if (purchase.status === "ACTIVE") return { ok: true, purchaseId: purchase.id };
  if (purchase.status !== "PENDING") {
    return { ok: false, message: `This purchase is ${purchase.status.toLowerCase()}.` };
  }

  // Expiry runs from the moment the credits become usable, not from when
  // the row was created — a checkout abandoned and resumed an hour later
  // must not lose an hour of its year.
  let expiresAfterDays = 365;
  if (purchase.pack_id) {
    const { data: pack } = await admin
      .from("coach_class_packs")
      .select("expires_after_days")
      .eq("id", purchase.pack_id)
      .maybeSingle();
    if (pack?.expires_after_days) expiresAfterDays = pack.expires_after_days;
  }

  const now = new Date();
  const { error } = await admin
    .from("club_pack_purchases")
    .update({
      status: "ACTIVE",
      purchased_at: now.toISOString(),
      expires_at: packExpiryDate(expiresAfterDays, now).toISOString(),
      stripe_payment_intent_id: input.paymentIntentId ?? null,
      updated_at: now.toISOString(),
    })
    .eq("id", purchase.id)
    // Only from PENDING: if the webhook and the return page raced, the
    // loser's update matches nothing instead of resetting the expiry.
    .eq("status", "PENDING");
  if (error) return { ok: false, message: error.message };

  return { ok: true, purchaseId: purchase.id };
}

export interface RedeemableePack {
  id: string;
  classesTotal: number;
  classesUsed: number;
  expiresAt: string | null;
  serviceId: string;
  coachProfileId: string;
}

/** Packs this client can still spend against a given service. */
export async function usablePacks(
  admin: SupabaseClient,
  input: { clientProfileId: string; serviceId: string },
  now: Date = new Date()
): Promise<RedeemableePack[]> {
  const { data, error } = await admin
    .from("club_pack_purchases")
    .select("id, classes_total, classes_used, expires_at, service_id, coach_profile_id")
    .eq("client_profile_id", input.clientProfileId)
    .eq("service_id", input.serviceId)
    .eq("status", "ACTIVE")
    // Oldest first, so the pack closest to expiring is spent before one
    // bought later — otherwise a client loses credits they had paid for
    // while newer ones sat unused.
    .order("expires_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`club_pack_purchases: ${error.message}`);

  return (data ?? [])
    .map((row: any) => ({
      id: row.id,
      classesTotal: row.classes_total,
      classesUsed: row.classes_used,
      expiresAt: row.expires_at,
      serviceId: row.service_id,
      coachProfileId: row.coach_profile_id,
    }))
    .filter((p) =>
      creditsRemaining(
        { classesTotal: p.classesTotal, classesUsed: p.classesUsed, status: "ACTIVE", expiresAt: p.expiresAt } as PackCredits,
        now
      ) > 0
    );
}

/**
 * Spends one credit.
 *
 * Compare-and-swap on classes_used: the update only matches while the row
 * still holds the value that was read, so two tabs booking at once cannot
 * both spend the same credit — the loser matches no rows and is told to
 * retry. A plain increment would let both through and quietly oversell the
 * pack past its own check constraint.
 */
export async function spendPackCredit(
  admin: SupabaseClient,
  input: { purchaseId: string; bookingId: string },
  now: Date = new Date()
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: pack } = await admin
    .from("club_pack_purchases")
    .select("id, classes_total, classes_used, status, expires_at")
    .eq("id", input.purchaseId)
    .maybeSingle();
  if (!pack) return { ok: false, message: "That pack no longer exists." };

  const remaining = creditsRemaining(
    { classesTotal: pack.classes_total, classesUsed: pack.classes_used, status: pack.status, expiresAt: pack.expires_at },
    now
  );
  if (remaining <= 0) return { ok: false, message: "That pack has no classes left." };

  const { data: updated, error } = await admin
    .from("club_pack_purchases")
    .update({ classes_used: pack.classes_used + 1, updated_at: now.toISOString() })
    .eq("id", pack.id)
    .eq("status", "ACTIVE")
    // The compare half of the swap.
    .eq("classes_used", pack.classes_used)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, message: "That class was just booked with this pack. Please try again." };
  }

  await admin.from("bookings").update({ pack_purchase_id: pack.id }).eq("id", input.bookingId);
  return { ok: true };
}

/** Returns a credit when a booking paid for by a pack is cancelled.
 *
 * Guarded by the booking's own link, so a replayed cancellation cannot keep
 * handing credits back. */
export async function refundPackCredit(
  admin: SupabaseClient,
  bookingId: string,
  now: Date = new Date()
): Promise<void> {
  const { data: booking } = await admin
    .from("bookings")
    .select("id, pack_purchase_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking?.pack_purchase_id) return;

  const { data: pack } = await admin
    .from("club_pack_purchases")
    .select("id, classes_used")
    .eq("id", booking.pack_purchase_id)
    .maybeSingle();
  if (!pack || pack.classes_used <= 0) return;

  await admin
    .from("club_pack_purchases")
    .update({ classes_used: pack.classes_used - 1, updated_at: now.toISOString() })
    .eq("id", pack.id)
    .eq("classes_used", pack.classes_used);

  // Unlink first-class: the credit is back, and this booking must not be
  // able to return it twice.
  await admin.from("bookings").update({ pack_purchase_id: null }).eq("id", bookingId);
}


/**
 * Settles a pack purchase from a Checkout session.
 *
 * The session is re-read from Stripe rather than trusted: a success_url can
 * be visited directly, so arriving on the return page is not proof of
 * payment. Called from both the return page and the webhook — whichever
 * arrives first credits the pack, the other is a no-op.
 */
export async function settlePackFromCheckoutSession(
  admin: SupabaseClient,
  sessionId: string
): Promise<PackPurchaseResult> {
  const outcome = await readCheckoutSession(sessionId);
  if (!outcome.paid) return { ok: false, message: "Payment hasn't completed." };
  if (!outcome.packPurchaseId) return { ok: false, message: "That payment isn't linked to a pack." };

  return activatePackPurchase(admin, {
    purchaseId: outcome.packPurchaseId,
    paymentIntentId: outcome.paymentIntentId,
  });
}
