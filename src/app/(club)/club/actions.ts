"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createHold, releaseHold, syncBookingLock } from "@/lib/club/holds";
import { getBookableSlots } from "@/lib/club/discovery";
import { checkout } from "@/lib/club/payments";
import { calculateRefund, type CancellationPolicySnapshot } from "@/lib/club/booking-state";

// Consumer booking actions.
//
// Authorization pattern mirrors the coach actions: the client profile id
// always comes from the signed-in session, never from the form. A hold or
// booking id in a form is only ever used to look a row up — every action
// then checks that row belongs to the caller before doing anything.

async function currentProfileId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Places a hold and sends the client to checkout. The slot is re-validated
 * server-side first: the picker page may be minutes stale, and the browser's
 * copy of "what's free" is never authoritative. */
export async function holdSlotAction(formData: FormData) {
  const coachProfileId = String(formData.get("coachProfileId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");

  const profileId = await currentProfileId();
  if (!profileId) {
    redirect(`/login?product=club&next=${encodeURIComponent(`/coaches/${coachProfileId}/book?service=${serviceId}`)}`);
  }

  const admin = createServiceClient();
  const startsAt = new Date(startsAtRaw);
  const slots = await getBookableSlots(admin, coachProfileId, serviceId);
  const match = slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
  if (!match) {
    redirect(`/coaches/${coachProfileId}/book?service=${serviceId}&error=gone`);
  }

  const held = await createHold(admin, {
    coachProfileId,
    clientProfileId: profileId,
    serviceId,
    startsAt: match.startsAt,
    endsAt: match.endsAt,
  });

  if (!held.ok) {
    const reason = held.reason === "slot_taken" ? "gone" : "failed";
    redirect(`/coaches/${coachProfileId}/book?service=${serviceId}&error=${reason}`);
  }

  redirect(`/checkout/${held.holdId}`);
}

/** Pays for a held slot and confirms the booking. */
export async function payAction(formData: FormData) {
  const holdId = String(formData.get("holdId") ?? "");
  const clientNote = String(formData.get("clientNote") ?? "").trim() || null;

  const profileId = await currentProfileId();
  if (!profileId) redirect("/login?product=club");

  const admin = createServiceClient();
  const { data: hold } = await admin
    .from("booking_holds")
    .select("id, coach_profile_id, client_profile_id, service_id")
    .eq("id", holdId)
    .maybeSingle();
  // A hold belonging to someone else is treated as missing, not as a
  // permission error — no probing another client's checkout.
  if (!hold || hold.client_profile_id !== profileId) redirect("/");

  const [{ data: service }, { data: coach }] = await Promise.all([
    admin.from("coach_services").select("price_cents, currency, skill_id").eq("id", hold.service_id).maybeSingle(),
    admin.from("coach_profiles").select("cancellation_full_refund_hours, cancellation_partial_refund_percent").eq("id", hold.coach_profile_id).maybeSingle(),
  ]);
  if (!service || !coach) redirect(`/checkout/${holdId}?error=failed`);

  const result = await checkout(admin, {
    holdId,
    serviceId: hold.service_id,
    skillId: service.skill_id,
    priceCents: service.price_cents,
    currency: service.currency,
    clientNote,
    // The policy is frozen onto the booking at purchase: if the coach
    // later loosens or tightens their terms, this client keeps the terms
    // they actually agreed to.
    cancellationPolicySnapshot: {
      fullRefundHours: coach.cancellation_full_refund_hours,
      partialRefundPercent: coach.cancellation_partial_refund_percent,
    } satisfies CancellationPolicySnapshot,
  });

  if (!result.ok) redirect(`/checkout/${holdId}?error=${encodeURIComponent(result.message)}`);

  revalidatePath("/bookings");
  redirect(`/bookings/${result.bookingId}?new=1`);
}

/** Abandons checkout, freeing the slot immediately rather than waiting for
 * the hold to expire. */
export async function releaseHoldAction(formData: FormData) {
  const holdId = String(formData.get("holdId") ?? "");
  const profileId = await currentProfileId();
  if (!profileId) redirect("/");

  const admin = createServiceClient();
  const { data: hold } = await admin.from("booking_holds").select("client_profile_id").eq("id", holdId).maybeSingle();
  if (hold?.client_profile_id === profileId) await releaseHold(admin, holdId);
  redirect("/");
}

/** Client-initiated cancellation. The refund is computed from the policy
 * snapshot frozen on the booking, not from the coach's current settings. */
export async function cancelBookingAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId") ?? "");
  const profileId = await currentProfileId();
  if (!profileId) redirect("/");

  const admin = createServiceClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, client_profile_id, status, starts_at, price_cents, travel_fee_cents, cancellation_policy_snapshot")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.client_profile_id !== profileId) redirect("/bookings");
  if (booking.status !== "CONFIRMED") redirect(`/bookings/${bookingId}`);

  const paidCents = booking.price_cents + (booking.travel_fee_cents ?? 0);
  const refund = calculateRefund({
    status: "CANCELLED_BY_CLIENT",
    paidCents,
    sessionStartsAt: new Date(booking.starts_at),
    cancelledAt: new Date(),
    policy: booking.cancellation_policy_snapshot as CancellationPolicySnapshot,
  });

  await admin.from("bookings").update({ status: "CANCELLED_BY_CLIENT", cancelled_at: new Date().toISOString() }).eq("id", bookingId);
  await admin.from("booking_status_history").insert({
    booking_id: bookingId,
    from_status: booking.status,
    to_status: "CANCELLED_BY_CLIENT",
    actor_kind: "client",
    actor_profile_id: profileId,
    reason: refund.policyApplied,
  });
  // Frees the slot so it returns to the coach's availability.
  await syncBookingLock(admin, bookingId, "CANCELLED_BY_CLIENT");

  if (refund.amountCents > 0) {
    const { data: payment } = await admin.from("club_payments").select("id").eq("booking_id", bookingId).maybeSingle();
    if (payment) {
      await admin.from("club_refunds").insert({
        payment_id: payment.id,
        booking_id: bookingId,
        amount_cents: refund.amountCents,
        reason: "requested_by_customer",
        policy_applied: refund.policyApplied,
        status: "pending",
      });
    }
  }

  revalidatePath("/bookings");
  redirect(`/bookings/${bookingId}`);
}
