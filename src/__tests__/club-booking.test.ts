import {
  canTransition,
  assertTransition,
  calculateRefund,
  isTerminal,
  holdsSlot,
  type BookingStatus,
} from "@/lib/club/booking-state";
import { rankCoaches, profileQualityScore, publishBlockers, type RankableCoach } from "@/lib/club/ranking";
import { splitAmount, formatMoney } from "@/lib/club/config";
import { createHold, convertHoldToBooking, releaseHold } from "@/lib/club/holds";

// These cover the parts of the marketplace where a bug either moves money
// incorrectly, double-books a coach, or lets someone act on a booking they
// shouldn't. Availability itself is covered in club-availability.test.ts.

describe("booking state machine", () => {
  it("confirms only from verified system/admin action, never by the client", () => {
    // A client-side "payment success" page must never be able to confirm.
    expect(canTransition("PAYMENT_PENDING", "CONFIRMED", "system")).toBe(true);
    expect(canTransition("PAYMENT_PENDING", "CONFIRMED", "client")).toBe(false);
    expect(canTransition("PAYMENT_PENDING", "CONFIRMED", "coach")).toBe(false);
  });

  it("lets only the coach complete a session", () => {
    expect(canTransition("CONFIRMED", "COMPLETED", "coach")).toBe(true);
    expect(canTransition("CONFIRMED", "COMPLETED", "client")).toBe(false);
  });

  it("keeps no-show reporting pointed at the other party", () => {
    // The coach reports a client no-show; the client reports the coach's.
    expect(canTransition("CONFIRMED", "NO_SHOW_CLIENT", "coach")).toBe(true);
    expect(canTransition("CONFIRMED", "NO_SHOW_CLIENT", "client")).toBe(false);
    expect(canTransition("CONFIRMED", "NO_SHOW_COACH", "client")).toBe(true);
    expect(canTransition("CONFIRMED", "NO_SHOW_COACH", "coach")).toBe(false);
  });

  it("refuses transitions out of a fully refunded booking", () => {
    const targets: BookingStatus[] = ["CONFIRMED", "COMPLETED", "REFUND_PENDING"];
    for (const to of targets) {
      expect(canTransition("REFUNDED", to, "admin")).toBe(false);
    }
  });

  it("cannot skip payment and jump straight to completed", () => {
    expect(canTransition("PAYMENT_PENDING", "COMPLETED", "coach")).toBe(false);
    expect(canTransition("PAYMENT_PENDING", "COMPLETED", "admin")).toBe(false);
  });

  it("throws with both states named when an illegal transition is attempted", () => {
    expect(() => assertTransition("COMPLETED", "CONFIRMED", "coach")).toThrow(/COMPLETED -> CONFIRMED by coach/);
  });

  it("classifies which states still occupy the coach's calendar", () => {
    expect(holdsSlot("CONFIRMED")).toBe(true);
    expect(holdsSlot("PAYMENT_PENDING")).toBe(true);
    expect(holdsSlot("CANCELLED_BY_CLIENT")).toBe(false);
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("PAYMENT_PENDING")).toBe(false);
  });
});

describe("refund calculation", () => {
  const policy = { fullRefundHours: 24, partialRefundPercent: 50 };
  const start = new Date("2026-09-01T10:00:00Z");
  const paidCents = 7000; // S$70

  it("refunds in full outside the cancellation window", () => {
    const r = calculateRefund({
      status: "CANCELLED_BY_CLIENT",
      paidCents,
      sessionStartsAt: start,
      cancelledAt: new Date("2026-08-30T10:00:00Z"), // 48h before
      policy,
    });
    expect(r).toEqual({ amountCents: 7000, policyApplied: "full_refund_within_window" });
  });

  it("treats the threshold itself as still-full-refund", () => {
    const r = calculateRefund({
      status: "CANCELLED_BY_CLIENT",
      paidCents,
      sessionStartsAt: start,
      cancelledAt: new Date("2026-08-31T10:00:00Z"), // exactly 24h
      policy,
    });
    expect(r.policyApplied).toBe("full_refund_within_window");
  });

  it("applies the partial percentage inside the window, rounding down", () => {
    const r = calculateRefund({
      status: "CANCELLED_BY_CLIENT",
      paidCents: 7001,
      sessionStartsAt: start,
      cancelledAt: new Date("2026-09-01T08:00:00Z"), // 2h before
      policy,
    });
    // 7001 * 50% = 3500.5 -> never refund more than promised.
    expect(r).toEqual({ amountCents: 3500, policyApplied: "partial_refund_after_window" });
  });

  it("never charges the client when the coach cancels or no-shows", () => {
    for (const status of ["CANCELLED_BY_COACH", "NO_SHOW_COACH"] as const) {
      const r = calculateRefund({
        status,
        paidCents,
        sessionStartsAt: start,
        cancelledAt: new Date("2026-09-01T09:59:00Z"), // one minute before
        policy,
      });
      expect(r.amountCents).toBe(paidCents);
    }
  });

  it("does not refund a client no-show — the coach turned up", () => {
    const r = calculateRefund({
      status: "NO_SHOW_CLIENT",
      paidCents,
      sessionStartsAt: start,
      cancelledAt: start,
      policy,
    });
    expect(r).toEqual({ amountCents: 0, policyApplied: "client_no_show_no_refund" });
  });

  it("honours a zero-percent policy as no refund", () => {
    const r = calculateRefund({
      status: "CANCELLED_BY_CLIENT",
      paidCents,
      sessionStartsAt: start,
      cancelledAt: new Date("2026-09-01T09:00:00Z"),
      policy: { fullRefundHours: 24, partialRefundPercent: 0 },
    });
    expect(r).toEqual({ amountCents: 0, policyApplied: "no_refund_after_window" });
  });
});

describe("money handling", () => {
  it("splits gross into fee and coach share that sum exactly", () => {
    const { platformFeeCents, coachAmountCents } = splitAmount(7000, 15);
    expect(platformFeeCents).toBe(1050);
    expect(coachAmountCents).toBe(5950);
    expect(platformFeeCents + coachAmountCents).toBe(7000);
  });

  it("rounds the platform fee down so cents never go missing", () => {
    // 3333 * 15% = 499.95 — the stray cent must land with the coach.
    const { platformFeeCents, coachAmountCents } = splitAmount(3333, 15);
    expect(platformFeeCents).toBe(499);
    expect(platformFeeCents + coachAmountCents).toBe(3333);
  });

  it("formats SGD with the currency symbol, hiding trailing zero cents", () => {
    const whole = formatMoney(7000);
    expect(whole).toMatch(/\$\s?70$/); // "S$70" / "$70" depending on ICU data
    expect(whole).not.toContain(".00");
    expect(formatMoney(7050)).toContain("70.50");
  });
});

describe("discovery ranking", () => {
  const base: RankableCoach = {
    coachProfileId: "a",
    hoursUntilNextSlot: 24,
    ratingAverage: 4.5,
    reviewCount: 20,
    distanceKm: 3,
    repeatBookingRate: 0.4,
    profileQuality: 0.9,
  };

  it("ranks a sooner-available coach above an otherwise identical one", () => {
    const [first] = rankCoaches([
      { ...base, coachProfileId: "later", hoursUntilNextSlot: 120 },
      { ...base, coachProfileId: "sooner", hoursUntilNextSlot: 4 },
    ]);
    expect(first.coachProfileId).toBe("sooner");
  });

  it("gives an unbookable coach no availability credit", () => {
    const [ranked] = rankCoaches([{ ...base, hoursUntilNextSlot: null }]);
    expect(ranked.contributions.availabilitySoon).toBe(0);
  });

  it("keeps unrated newcomers discoverable rather than bottom-ranked", () => {
    const [unrated] = rankCoaches([{ ...base, ratingAverage: null, reviewCount: 0 }]);
    const [poor] = rankCoaches([{ ...base, ratingAverage: 3.0, reviewCount: 0 }]);
    expect(unrated.contributions.rating).toBeGreaterThan(poor.contributions.rating);
  });

  it("orders deterministically when scores tie", () => {
    const ranked = rankCoaches([
      { ...base, coachProfileId: "zzz" },
      { ...base, coachProfileId: "aaa" },
    ]);
    expect(ranked.map((r) => r.coachProfileId)).toEqual(["aaa", "zzz"]);
  });

  it("explains each coach's score by signal", () => {
    const [ranked] = rankCoaches([base]);
    const summed = Object.values(ranked.contributions).reduce((a, b) => a + b, 0);
    expect(ranked.score).toBeCloseTo(summed, 10);
  });
});

describe("publish gating", () => {
  const complete = {
    hasPhoto: true, hasBio: true, serviceCount: 1, skillCount: 1,
    hasLocation: true, hasAvailability: true, payoutsEnabled: true,
  };

  it("allows publishing only when the profile is bookable", () => {
    expect(publishBlockers(complete)).toEqual([]);
  });

  it("blocks a profile with no availability or no service", () => {
    expect(publishBlockers({ ...complete, hasAvailability: false })).toContain("Set your weekly availability");
    expect(publishBlockers({ ...complete, serviceCount: 0 })).toContain("Add at least one service or class");
  });

  it("blocks publishing before payouts are set up", () => {
    expect(publishBlockers({ ...complete, payoutsEnabled: false })).toContain(
      "Finish payout setup to accept bookings"
    );
  });

  it("scores profile quality as a fraction of completeness", () => {
    expect(profileQualityScore({
      hasPhoto: true, hasBio: true, hasCoverMedia: true, serviceCount: 2,
      skillCount: 3, hasLocation: true, hasAvailability: true,
    })).toBe(1);
    expect(profileQualityScore({
      hasPhoto: false, hasBio: false, hasCoverMedia: false, serviceCount: 0,
      skillCount: 0, hasLocation: false, hasAvailability: false,
    })).toBe(0);
  });
});

// ---- Hold / double-booking behaviour ---------------------------------
//
// The real guarantee lives in Postgres (a gist exclusion constraint), which
// unit tests can't exercise. What IS testable here is that the service
// reacts correctly to the constraint firing — the second checkout must be
// told "slot taken", not handed an error or, worse, a booking.

const EXCLUSION_VIOLATION = "23P01";

/** Minimal Supabase stub: per-table insert/update/delete/select behaviour. */
function stubDb(handlers: Record<string, any>) {
  return {
    from(table: string) {
      const h = handlers[table] ?? {};
      const chain: any = {
        insert: (payload: any) => {
          const result = h.insert ? h.insert(payload) : { data: { id: `${table}-1` }, error: null };
          return {
            select: () => ({ single: async () => result, maybeSingle: async () => result }),
            then: (res: any) => res(result),
          };
        },
        update: () => chain,
        delete: () => chain,
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        lt: () => chain,
        limit: () => chain,
        single: async () => (h.single ? h.single() : { data: null, error: null }),
        maybeSingle: async () => (h.maybeSingle ? h.maybeSingle() : { data: null, error: null }),
        then: (res: any) => res({ data: h.rows ?? null, error: null }),
      };
      return chain;
    },
  } as any;
}

describe("booking holds", () => {
  const req = {
    coachProfileId: "coach-1",
    clientProfileId: "client-1",
    startsAt: new Date("2026-09-01T09:30:00Z"),
    endsAt: new Date("2026-09-01T10:30:00Z"),
  };

  it("reserves the slot when the lock insert succeeds", async () => {
    const db = stubDb({
      booking_holds: { insert: () => ({ data: { id: "hold-1" }, error: null }) },
      booking_slot_locks: { insert: () => ({ data: { id: "lock-1" }, error: null }) },
    });
    const result = await createHold(db, req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.holdId).toBe("hold-1");
  });

  it("reports 'slot taken' when the exclusion constraint rejects the lock", async () => {
    // This is the concurrent-checkout case: the DB, not our code, decided.
    const db = stubDb({
      booking_holds: { insert: () => ({ data: { id: "hold-2" }, error: null }) },
      booking_slot_locks: {
        insert: () => ({ data: null, error: { code: EXCLUSION_VIOLATION, message: "conflicting key" } }),
      },
    });
    const result = await createHold(db, req);
    expect(result).toEqual({ ok: false, reason: "slot_taken" });
  });

  it("does not leave an orphan hold behind when locking fails", async () => {
    const deleted: string[] = [];
    const db: any = {
      from(table: string) {
        if (table === "booking_holds") {
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: "hold-3" }, error: null }) }) }),
            delete: () => ({ eq: (_c: string, id: string) => { deleted.push(id); return Promise.resolve({ error: null }); } }),
          };
        }
        return {
          insert: () => ({
            select: () => ({ single: async () => ({ data: null, error: { code: EXCLUSION_VIOLATION } }) }),
            then: (res: any) => res({ data: null, error: { code: EXCLUSION_VIOLATION } }),
          }),
        };
      },
    };
    await createHold(db, req);
    expect(deleted).toEqual(["hold-3"]);
  });

  it("is idempotent when a webhook retries an already-converted hold", async () => {
    // Stripe retries webhooks; converting twice must not create two bookings.
    const db = stubDb({
      booking_holds: {
        single: () => ({
          data: {
            id: "hold-4", coach_profile_id: "coach-1", client_profile_id: "client-1",
            service_id: null, starts_at: req.startsAt.toISOString(), ends_at: req.endsAt.toISOString(),
            booking_id: "booking-existing", released_at: null, expires_at: req.startsAt.toISOString(),
          },
          error: null,
        }),
      },
    });
    const result = await convertHoldToBooking(db, "hold-4", {
      priceCents: 7000, currency: "SGD", timezone: "Asia/Singapore",
      cancellationPolicySnapshot: {},
    });
    expect(result).toEqual({ ok: true, bookingId: "booking-existing", alreadyExisted: true });
  });

  it("refuses to convert a hold that no longer exists", async () => {
    const db = stubDb({ booking_holds: { single: () => ({ data: null, error: { message: "not found" } }) } });
    const result = await convertHoldToBooking(db, "missing", {
      priceCents: 7000, currency: "SGD", timezone: "Asia/Singapore",
      cancellationPolicySnapshot: {},
    });
    expect(result).toEqual({ ok: false, message: "Hold not found" });
  });

  it("releasing a hold is safe to call twice", async () => {
    const db = stubDb({});
    await expect(releaseHold(db, "hold-5")).resolves.toBeUndefined();
    await expect(releaseHold(db, "hold-5")).resolves.toBeUndefined();
  });
});
