import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingStatus } from "./booking-state";

// Where a session happens, and who is allowed to know exactly where.
//
// The privacy rule from the spec is absolute: a coach's private or
// residential address is never public. Discovery and profiles show the
// neighbourhood; the precise address is released to the client only once
// their booking is CONFIRMED, and it goes back to neighbourhood-only if the
// booking is cancelled.
//
// That rule lives here and nowhere else. Pages ask this function what to
// render rather than each deciding for themselves — one place to audit, and
// no page can leak an address by forgetting a status check.

/** Statuses that entitle the client to the exact address. */
const ADDRESS_RELEASED: BookingStatus[] = ["CONFIRMED", "COMPLETED"];

export interface ResolvedAddress {
  visibility: "exact" | "neighbourhood_only";
  addressLine: string | null;
  neighbourhood: string | null;
  postalCode: string | null;
  onlineJoinUrl: string | null;
  locationType: string | null;
}

/**
 * Resolves what the client may see for a booking's location.
 *
 * Callers must pass the booking's current status; there is no variant of
 * this function that skips it, so "forgot to check the status" isn't a
 * reachable mistake.
 */
export async function resolveBookingAddress(
  admin: SupabaseClient,
  bookingId: string,
  status: BookingStatus
): Promise<ResolvedAddress> {
  const { data: loc } = await admin
    .from("booking_locations")
    .select("location_type, address_line, neighbourhood, postal_code, online_join_url, coach_locations(address_line, neighbourhood, postal_code)")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!loc) {
    return { visibility: "neighbourhood_only", addressLine: null, neighbourhood: null, postalCode: null, onlineJoinUrl: null, locationType: null };
  }

  const coachLoc: any = Array.isArray(loc.coach_locations) ? loc.coach_locations[0] : loc.coach_locations;
  const neighbourhood = loc.neighbourhood ?? coachLoc?.neighbourhood ?? null;
  const released = ADDRESS_RELEASED.includes(status);

  if (!released) {
    return {
      visibility: "neighbourhood_only",
      addressLine: null,
      neighbourhood,
      postalCode: null,
      // A join link is not an address, but it is still only useful (and
      // only shared) once the session is actually confirmed.
      onlineJoinUrl: null,
      locationType: loc.location_type,
    };
  }

  return {
    visibility: "exact",
    addressLine: loc.address_line ?? coachLoc?.address_line ?? null,
    neighbourhood,
    postalCode: loc.postal_code ?? coachLoc?.postal_code ?? null,
    onlineJoinUrl: loc.online_join_url ?? null,
    locationType: loc.location_type,
  };
}

/** Attaches the coach's primary location to a freshly created booking, so
 * there is something to release once it is confirmed. Bookings at a client's
 * own address are set separately at request time. */
export async function attachCoachLocationToBooking(
  admin: SupabaseClient,
  bookingId: string,
  coachProfileId: string
): Promise<void> {
  const { data: locations } = await admin
    .from("coach_locations")
    .select("id, location_type, neighbourhood, is_primary")
    .eq("coach_profile_id", coachProfileId)
    .eq("is_active", true);

  const primary = (locations ?? []).find((l: any) => l.is_primary) ?? (locations ?? [])[0];
  if (!primary) return;

  await admin.from("booking_locations").upsert(
    {
      booking_id: bookingId,
      location_type: primary.location_type,
      coach_location_id: primary.id,
      // Neighbourhood is copied so it survives the coach later editing or
      // deleting the location; the exact address is deliberately NOT copied
      // and is read through the join only when released.
      neighbourhood: primary.neighbourhood,
    },
    { onConflict: "booking_id" }
  );
}
