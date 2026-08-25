import fs from "fs";
import path from "path";
import {
  FOUNDING_FREE_BOOKINGS,
  STRIPE_PERCENT,
  STRIPE_FIXED_CENTS,
  stripeProcessingCents,
  foundingFreeRemaining,
  resolveBookingFee,
} from "@/lib/club/founding-offer";

const src = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf-8");

/** Minimal PostgREST stand-in: enough chaining for the two queries the
 * module makes, with no network. */
function fakeDb(opts: { allowance: number | null; used: number; countError?: boolean; profileError?: boolean }) {
  return {
    from(table: string) {
      if (table === "coach_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                opts.profileError
                  ? { data: null, error: { message: "boom" } }
                  : { data: opts.allowance === null ? null : { founding_free_bookings: opts.allowance }, error: null },
            }),
          }),
        };
      }
      if (table === "club_platform_fees") {
        // getPlatformFeePercent's chain, for the non-offer path.
        return {
          select: () => ({
            lte: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: { fee_percent: 10 }, error: null }) }),
              }),
            }),
          }),
        };
      }
      // club_payments
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: async () =>
                opts.countError ? { count: null, error: { message: "boom" } } : { count: opts.used, error: null },
            }),
          }),
        }),
      };
    },
  } as never;
}

describe("what Stripe takes on a free booking", () => {
  it("is the card cost, not zero", () => {
    // Destination charges: application_fee_amount is the platform's whole
    // take and Stripe's fee comes out of it. Zero would mean Tistra pays the
    // card cost on every free booking rather than merely earning nothing.
    expect(stripeProcessingCents(16000)).toBe(Math.ceil((16000 * STRIPE_PERCENT) / 100) + STRIPE_FIXED_CENTS);
    expect(stripeProcessingCents(16000)).toBeGreaterThan(0);
  });

  it("rounds up, so fractions never come out of the platform", () => {
    // 3.4% of 3333 = 113.32 -> 114, plus the fixed 50.
    expect(stripeProcessingCents(3333)).toBe(164);
  });

  it("never exceeds the amount charged", () => {
    // destinationChargeParams throws if the fee is larger than the charge,
    // which a very small booking could otherwise trigger via the fixed part.
    expect(stripeProcessingCents(10)).toBeLessThanOrEqual(10);
    expect(stripeProcessingCents(1)).toBeLessThanOrEqual(1);
  });
});

describe("how much allowance is left", () => {
  it("is the grant minus what actually settled", async () => {
    expect(await foundingFreeRemaining(fakeDb({ allowance: 10, used: 3 }), "c1")).toBe(7);
  });

  it("is zero once the allowance is spent", async () => {
    expect(await foundingFreeRemaining(fakeDb({ allowance: 10, used: 10 }), "c1")).toBe(0);
  });

  it("never goes negative", async () => {
    // Concurrency can over-grant by one; that must not become a credit.
    expect(await foundingFreeRemaining(fakeDb({ allowance: 10, used: 12 }), "c1")).toBe(0);
  });

  it("is zero for a coach with no grant", async () => {
    expect(await foundingFreeRemaining(fakeDb({ allowance: 0, used: 0 }), "c1")).toBe(0);
  });

  it("fails closed when the coach cannot be read", async () => {
    // Charging the standard fee when a free booking was owed is a refund.
    // Charging nothing when it was not owed is money we never see again.
    expect(await foundingFreeRemaining(fakeDb({ allowance: null, used: 0 }), "c1")).toBe(0);
    expect(await foundingFreeRemaining(fakeDb({ allowance: 10, used: 0, profileError: true }), "c1")).toBe(0);
  });

  it("fails closed when the count query errors", async () => {
    expect(await foundingFreeRemaining(fakeDb({ allowance: 10, used: 0, countError: true }), "c1")).toBe(0);
  });
});

describe("resolving one booking's fee", () => {
  it("takes no commission while allowance remains", async () => {
    const fee = await resolveBookingFee(fakeDb({ allowance: 10, used: 0 }), "c1", 16000);
    expect(fee.foundingFree).toBe(true);
    expect(fee.feePercent).toBe(0);
    // The application fee is Stripe's cost, so the platform nets ~nothing.
    expect(fee.platformFeeCents).toBe(stripeProcessingCents(16000));
  });

  it("still leaves the coach the large majority on a free booking", async () => {
    const fee = await resolveBookingFee(fakeDb({ allowance: 10, used: 0 }), "c1", 16000);
    // ~96% of S$160 rather than the 90% the standard rate would leave.
    expect(fee.coachAmountCents).toBeGreaterThan(15000);
    expect(fee.platformFeeCents + fee.coachAmountCents).toBe(16000);
  });

  it("charges the standard rate once the allowance is gone", async () => {
    const fee = await resolveBookingFee(fakeDb({ allowance: 10, used: 10 }), "c1", 16000);
    expect(fee.foundingFree).toBe(false);
    expect(fee.feePercent).toBeGreaterThan(0);
    expect(fee.platformFeeCents).toBeGreaterThan(stripeProcessingCents(16000));
  });

  it("always splits the gross exactly", async () => {
    for (const gross of [1000, 7000, 8050, 16000, 33333]) {
      for (const used of [0, 10]) {
        const fee = await resolveBookingFee(fakeDb({ allowance: 10, used }), "c1", gross);
        expect(fee.platformFeeCents + fee.coachAmountCents).toBe(gross);
      }
    }
  });
});

describe("the offer is one number, everywhere", () => {
  it("the landing page does not restate it", () => {
    // Marketing copy and the money must not be able to disagree.
    expect(FOUNDING_FREE_BOOKINGS).toBe(10);
    const landing = src("components/landing/coach/CoachLanding.tsx");
    expect(landing).toMatch(/FOUNDING_FREE_BOOKINGS/);
  });

  it("new coaches receive the offer without anyone granting it", () => {
    const migration = src("../supabase/migrations/0065_founding_coach_free_bookings.sql");
    expect(migration).toMatch(/founding_free_bookings integer not null default 10/);
  });

  it("the ledger records the percentage actually applied", () => {
    // Hardcoding the standing rate here would have made every free booking
    // look like a full-price one in the accounts.
    expect(src("lib/club/payments.ts")).toMatch(/platform_fee_percent: input\.feePercent \?\?/);
    expect(src("lib/club/payments.ts")).toMatch(/founding_free: input\.foundingFree/);
  });

  it("tells coaches the card charge is not Tistra's", () => {
    const landing = src("components/landing/coach/CoachLanding.tsx");
    expect(landing).toMatch(/set by the payment provider, not by Tistra/);
  });
});
