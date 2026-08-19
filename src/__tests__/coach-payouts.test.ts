import fs from "fs";
import path from "path";
import { readAccountState } from "@/lib/club/stripe-connect";
import { splitAmount } from "@/lib/club/config";

// Payouts via Stripe Connect Express, and the platform's 1% cut.
//
// The status a coach sees must always be Stripe's, never our optimism: a
// coach who abandons verification halfway is redirected back exactly like
// one who finished, so "they returned" cannot mean "they're ready".

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

describe("account status mirrors Stripe", () => {
  it("is ready only when charges AND payouts are both enabled", () => {
    expect(readAccountState({ charges_enabled: true, payouts_enabled: true, requirements: {} }).status).toBe("enabled");
    // Stripe can leave charges on while refusing to pay out.
    expect(readAccountState({ charges_enabled: true, payouts_enabled: false, requirements: {} }).payoutsEnabled).toBe(false);
  });

  it("treats a disabled_reason as disabled whatever the other flags say", () => {
    const state = readAccountState({
      charges_enabled: true,
      payouts_enabled: true,
      requirements: { disabled_reason: "requirements.past_due" },
    });
    expect(state.status).toBe("disabled");
  });

  it("is pending while Stripe still wants something", () => {
    const state = readAccountState({
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      requirements: { currently_due: ["individual.id_number"] },
    });
    expect(state.status).toBe("pending");
    expect(state.requirements).toContain("individual.id_number");
  });

  it("is pending for an account that never submitted details", () => {
    expect(readAccountState({ details_submitted: false, requirements: {} }).status).toBe("pending");
  });

  it("surfaces past_due alongside currently_due", () => {
    const state = readAccountState({
      requirements: { currently_due: ["a"], past_due: ["b"] },
      details_submitted: true,
    });
    expect(state.requirements).toEqual(["a", "b"]);
  });
});

describe("the 1% platform fee", () => {
  it("takes 1% and gives the coach the rest", () => {
    const { platformFeeCents, coachAmountCents } = splitAmount(10_000, 1);
    expect(platformFeeCents).toBe(100);
    expect(coachAmountCents).toBe(9_900);
  });

  it("never loses a cent to rounding", () => {
    for (const gross of [1, 99, 333, 4_567, 8_500, 12_345]) {
      const { platformFeeCents, coachAmountCents } = splitAmount(gross, 1);
      expect(platformFeeCents + coachAmountCents).toBe(gross);
    }
  });

  it("reads the live rate from the table, not a constant", () => {
    // The fee is a commercial decision that should be dated and
    // explainable later, not an env var nobody can reconstruct.
    const fee = src("lib/club/platform-fee.ts");
    expect(fee).toMatch(/from\("club_platform_fees"\)/);
    expect(fee).toMatch(/order\("effective_from", \{ ascending: false \}\)/);
  });

  it("falls back rather than refusing a payment if the lookup fails", () => {
    expect(src("lib/club/platform-fee.ts")).toMatch(/return DEFAULT_PLATFORM_FEE_PERCENT/);
  });

  it("tells the coach what they keep, before they connect a bank", () => {
    expect(src("components/coach/PayoutsSection.tsx")).toMatch(/Tistra keeps/);
  });
});

describe("we never hold bank details", () => {
  it("uses Stripe's hosted onboarding", () => {
    const connect = src("lib/club/stripe-connect.ts");
    expect(connect).toMatch(/type: "express"/);
    expect(connect).toMatch(/account_onboarding/);
  });

  it("stores only the account id and Stripe's own verdict", () => {
    const connect = src("lib/club/stripe-connect.ts");
    for (const f of ["routing_number", "account_number", "iban", "ssn"]) {
      expect([f, connect.includes(f)]).toEqual([f, false]);
    }
  });

  it("re-reads the account on return instead of assuming success", () => {
    const ret = src("app/(coach)/coach/payouts/return/page.tsx");
    expect(ret).toMatch(/refreshAccountState/);
  });
});
