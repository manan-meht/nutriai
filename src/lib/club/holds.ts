import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_HOLD_MINUTES } from "./config";
import { holdsSlot, isTerminal, type BookingStatus } from "./booking-state";

// Booking holds and the double-booking guarantee (ADR-006).
//
// The correctness argument, because it's easy to get wrong: checking "is
// this slot free?" and then inserting is a read-then-write race — two
// concurrent checkouts both read "free" and both insert. No amount of
// application-level care fixes that; only the database can serialize it.
//
// So every live hold and every slot-holding booking inserts a row into
// booking_slot_locks, which carries a gist EXCLUDE constraint over
// (coach_profile_id, tstzrange). The second writer's INSERT fails with
// 23P01 (exclusion_violation). We surface that as "slot taken" rather than
// an error, because that's exactly what it means.
//
// Locks are removed when a hold expires or releases and when a booking
// reaches a terminal state — that, not a background job, is what frees a
// slot. A sweep exists only to tidy rows whose holds expired unobserved.

/** Postgres exclusion_violation — the slot was taken by a concurrent writer. */
const EXCLUSION_VIOLATION = "23P01";

export interface HoldRequest {
  coachProfileId: string;
  clientProfileId: string;
  serviceId?: string | null;
  startsAt: Date;
  endsAt: Date;
}

export type HoldResult =
  | { ok: true; holdId: string; expiresAt: Date }
  | { ok: false; reason: "slot_taken" | "error"; message?: string };

function rangeLiteral(startsAt: Date, endsAt: Date): string {
  // Half-open: a session ending at 15:00 and one starting at 15:00 don't
  // conflict, which matches the availability engine's edge semantics.
  return `[${startsAt.toISOString()},${endsAt.toISOString()})`;
}

/**
 * Places a hold on a slot. The lock insert is what actually reserves it —
 * if that fails on the exclusion constraint, someone else got there first.
 */
export async function createHold(admin: SupabaseClient, req: HoldRequest): Promise<HoldResult> {
  const expiresAt = new Date(Date.now() + BOOKING_HOLD_MINUTES * 60_000);

  const { data: hold, error: holdError } = await admin
    .from("booking_holds")
    .insert({
      coach_profile_id: req.coachProfileId,
      client_profile_id: req.clientProfileId,
      service_id: req.serviceId ?? null,
      starts_at: req.startsAt.toISOString(),
      ends_at: req.endsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (holdError || !hold) {
    return { ok: false, reason: "error", message: holdError?.message };
  }

  const { error: lockError } = await admin.from("booking_slot_locks").insert({
    coach_profile_id: req.coachProfileId,
    slot: rangeLiteral(req.startsAt, req.endsAt),
    hold_id: hold.id,
  });

  if (lockError) {
    // Roll back the orphan hold so it can't confuse the checkout UI or a
    // later webhook lookup. The lock is the source of truth, not the hold.
    await admin.from("booking_holds").delete().eq("id", hold.id);
    if (lockError.code === EXCLUSION_VIOLATION) return { ok: false, reason: "slot_taken" };
    return { ok: false, reason: "error", message: lockError.message };
  }

  return { ok: true, holdId: hold.id, expiresAt };
}

/** Releases a hold and frees its slot — on checkout abandonment, payment
 * failure, or expiry. Idempotent. */
export async function releaseHold(admin: SupabaseClient, holdId: string): Promise<void> {
  await admin.from("booking_slot_locks").delete().eq("hold_id", holdId);
  await admin
    .from("booking_holds")
    .update({ released_at: new Date().toISOString() })
    .eq("id", holdId)
    .is("released_at", null);
}

/**
 * Converts a paid hold into a CONFIRMED booking, moving the slot lock from
 * the hold to the booking so the slot stays continuously reserved — there
 * is never an instant where the slot looks free and another checkout could
 * slip in.
 *
 * Called only from verified webhook state (spec), never a client callback.
 * Idempotent: Stripe retries webhooks, so a hold already converted returns
 * the existing booking instead of creating a second one.
 */
export async function convertHoldToBooking(
  admin: SupabaseClient,
  holdId: string,
  booking: {
    serviceId?: string | null;
    skillId?: string | null;
    priceCents: number;
    travelFeeCents?: number;
    currency: string;
    timezone: string;
    cancellationPolicySnapshot: Record<string, unknown>;
    clientNote?: string | null;
  }
): Promise<{ ok: true; bookingId: string; alreadyExisted: boolean } | { ok: false; message: string }> {
  const { data: hold, error: holdError } = await admin
    .from("booking_holds")
    .select("id, coach_profile_id, client_profile_id, service_id, starts_at, ends_at, booking_id, released_at, expires_at")
    .eq("id", holdId)
    .single();

  if (holdError || !hold) return { ok: false, message: "Hold not found" };

  // Webhook retry for a hold we already converted.
  if (hold.booking_id) return { ok: true, bookingId: hold.booking_id, alreadyExisted: true };

  // A released hold means checkout was abandoned or expired before the
  // webhook arrived. The slot lock is gone, so re-inserting the booking
  // lock below is what re-checks availability — it will fail if someone
  // else took the slot in the meantime, which is the correct outcome.
  const { data: created, error: bookingError } = await admin
    .from("bookings")
    .insert({
      coach_profile_id: hold.coach_profile_id,
      client_profile_id: hold.client_profile_id,
      service_id: booking.serviceId ?? hold.service_id,
      skill_id: booking.skillId ?? null,
      starts_at: hold.starts_at,
      ends_at: hold.ends_at,
      timezone: booking.timezone,
      status: "CONFIRMED",
      price_cents: booking.priceCents,
      travel_fee_cents: booking.travelFeeCents ?? 0,
      currency: booking.currency,
      cancellation_policy_snapshot: booking.cancellationPolicySnapshot,
      client_note: booking.clientNote ?? null,
    })
    .select("id")
    .single();

  if (bookingError || !created) {
    return { ok: false, message: bookingError?.message ?? "Could not create booking" };
  }

  // Move the lock: point the existing hold lock at the booking if it's
  // still there, otherwise insert a fresh one (re-validating the slot).
  const { data: existingLock } = await admin
    .from("booking_slot_locks")
    .select("id")
    .eq("hold_id", holdId)
    .maybeSingle();

  if (existingLock) {
    await admin
      .from("booking_slot_locks")
      .update({ hold_id: null, booking_id: created.id })
      .eq("id", existingLock.id);
  } else {
    const { error: relockError } = await admin.from("booking_slot_locks").insert({
      coach_profile_id: hold.coach_profile_id,
      slot: rangeLiteral(new Date(hold.starts_at), new Date(hold.ends_at)),
      booking_id: created.id,
    });
    if (relockError) {
      // Someone else took the slot while this payment was in flight. The
      // booking row is rolled back and the caller must refund — better a
      // refund than two people at one session.
      await admin.from("bookings").delete().eq("id", created.id);
      return {
        ok: false,
        message: relockError.code === EXCLUSION_VIOLATION
          ? "Slot was taken while payment was processing"
          : relockError.message,
      };
    }
  }

  await admin.from("booking_holds").update({ booking_id: created.id }).eq("id", holdId);
  await admin.from("booking_status_history").insert({
    booking_id: created.id,
    from_status: "PAYMENT_PENDING",
    to_status: "CONFIRMED",
    actor_kind: "system",
    reason: "Payment confirmed via webhook",
  });

  return { ok: true, bookingId: created.id, alreadyExisted: false };
}

/** Frees the slot when a booking reaches a terminal state. Safe to call on
 * any transition; it only acts when the new status no longer holds a slot. */
export async function syncBookingLock(
  admin: SupabaseClient,
  bookingId: string,
  newStatus: BookingStatus
): Promise<void> {
  if (holdsSlot(newStatus)) return;
  if (!isTerminal(newStatus)) return;
  await admin.from("booking_slot_locks").delete().eq("booking_id", bookingId);
}

/**
 * Tidies locks belonging to holds that expired without anyone observing it
 * (abandoned checkout, closed tab). Not the primary mechanism — expiry is
 * enforced by `expires_at` on read — but it keeps the lock table from
 * accumulating dead rows that would block genuine bookings.
 */
export async function sweepExpiredHolds(admin: SupabaseClient): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: expired } = await admin
    .from("booking_holds")
    .select("id")
    .is("booking_id", null)
    .is("released_at", null)
    .lt("expires_at", nowIso)
    .limit(500);

  const ids = (expired ?? []).map((h: { id: string }) => h.id);
  if (ids.length === 0) return 0;

  await admin.from("booking_slot_locks").delete().in("hold_id", ids);
  await admin.from("booking_holds").update({ released_at: nowIso }).in("id", ids);
  return ids.length;
}
