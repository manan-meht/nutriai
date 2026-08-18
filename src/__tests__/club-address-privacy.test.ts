import { resolveBookingAddress } from "@/lib/club/locations";
import type { BookingStatus } from "@/lib/club/booking-state";

// The address rule, tested directly: a coach's exact location is released
// to a client only once their booking is CONFIRMED, and goes back to
// neighbourhood-only if it is cancelled. This is the rule most likely to be
// quietly broken by a future page reading booking_locations itself, so it
// is tested against the one function pages are supposed to call.

const LOCATION_ROW = {
  location_type: "COACH_LOCATION",
  address_line: null,
  neighbourhood: "Tiong Bahru",
  postal_code: null,
  online_join_url: "https://example.test/join",
  coach_locations: {
    address_line: "12 Eng Hoon Street, #03-04",
    neighbourhood: "Tiong Bahru",
    postal_code: "169772",
  },
};

/** Minimal stand-in for the PostgREST builder chain the function uses. */
function fakeAdmin(row: unknown) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: row }),
  };
  return { from: () => builder } as any;
}

const RELEASED: BookingStatus[] = ["CONFIRMED", "COMPLETED"];
const WITHHELD: BookingStatus[] = [
  "PAYMENT_PENDING",
  "CANCELLED_BY_CLIENT",
  "CANCELLED_BY_COACH",
  "NO_SHOW_CLIENT",
  "NO_SHOW_COACH",
  "REFUND_PENDING",
  "REFUNDED",
];

describe("resolveBookingAddress", () => {
  it.each(RELEASED)("releases the exact address when %s", async (status) => {
    const place = await resolveBookingAddress(fakeAdmin(LOCATION_ROW), "b1", status);
    expect(place.visibility).toBe("exact");
    expect(place.addressLine).toBe("12 Eng Hoon Street, #03-04");
    expect(place.postalCode).toBe("169772");
  });

  it.each(WITHHELD)("withholds the exact address when %s", async (status) => {
    const place = await resolveBookingAddress(fakeAdmin(LOCATION_ROW), "b1", status);
    expect(place.visibility).toBe("neighbourhood_only");
    expect(place.addressLine).toBeNull();
    expect(place.postalCode).toBeNull();
    // The neighbourhood is public — that much is allowed, and is what
    // discovery already showed.
    expect(place.neighbourhood).toBe("Tiong Bahru");
  });

  it("withholds the join link until the booking is confirmed", async () => {
    const pending = await resolveBookingAddress(fakeAdmin(LOCATION_ROW), "b1", "PAYMENT_PENDING");
    expect(pending.onlineJoinUrl).toBeNull();
    const confirmed = await resolveBookingAddress(fakeAdmin(LOCATION_ROW), "b1", "CONFIRMED");
    expect(confirmed.onlineJoinUrl).toBe("https://example.test/join");
  });

  it("returns nothing rather than guessing when no location row exists", async () => {
    const place = await resolveBookingAddress(fakeAdmin(null), "b1", "CONFIRMED");
    expect(place).toMatchObject({ visibility: "neighbourhood_only", addressLine: null, neighbourhood: null });
  });

  it("never returns an address a cancelled booking once saw", async () => {
    const before = await resolveBookingAddress(fakeAdmin(LOCATION_ROW), "b1", "CONFIRMED");
    const after = await resolveBookingAddress(fakeAdmin(LOCATION_ROW), "b1", "CANCELLED_BY_CLIENT");
    expect(before.addressLine).not.toBeNull();
    expect(after.addressLine).toBeNull();
  });
});
