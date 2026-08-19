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

describe("the 10% platform fee, inclusive of processing", () => {
  it("splits an 80 SGD session into 8 and 72", () => {
    const { platformFeeCents, coachAmountCents } = splitAmount(8_000, 10);
    expect(platformFeeCents).toBe(800);
    expect(coachAmountCents).toBe(7_200);
  });

  it("gives the coach exactly 90%, whatever a card costs to process", () => {
    // The 10% is all-in: Stripe's fee comes out of Tistra's share, not the
    // coach's. If processing were ever deducted from the coach instead,
    // their payout would vary by card type and the quoted number would be
    // a lie.
    for (const gross of [5_000, 8_000, 12_000, 25_000]) {
      const { coachAmountCents } = splitAmount(gross, 10);
      expect(coachAmountCents).toBe(gross * 0.9);
    }
  });

  it("never loses a cent to rounding", () => {
    for (const gross of [1, 99, 333, 4_567, 8_500, 12_345]) {
      const { platformFeeCents, coachAmountCents } = splitAmount(gross, 10);
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
    const ui = src("components/coach/PayoutsSection.tsx");
    expect(ui).toMatch(/Tistra keeps/);
    // And that the rate is all-in — otherwise a coach reasonably expects
    // processing to come off the top as well.
    expect(ui).toMatch(/covers card\s*\n?\s*processing/);
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

describe("the charge structure behind the 90%", () => {
  const { destinationChargeParams } = require("@/lib/club/stripe-connect");

  const params = destinationChargeParams({
    grossAmountCents: 8_000,
    applicationFeeCents: 800,
    currency: "SGD",
    connectedAccountId: "acct_123",
    metadata: { booking_id: "b1" },
  });

  it("is a destination charge to the coach's account", () => {
    expect(params.transfer_data).toEqual({ destination: "acct_123" });
    expect(params.amount).toBe(8_000);
    expect(params.application_fee_amount).toBe(800);
  });

  it("does not set on_behalf_of", () => {
    // Setting it makes the connected account the settlement merchant, and
    // Stripe's processing fee then comes out of the COACH's balance — their
    // payout would vary by card type and the flat 90% would stop being true.
    expect("on_behalf_of" in params).toBe(false);
  });

  it("refuses a fee larger than the amount charged", () => {
    expect(() =>
      destinationChargeParams({
        grossAmountCents: 1_000,
        applicationFeeCents: 2_000,
        currency: "SGD",
        connectedAccountId: "acct_123",
      })
    ).toThrow(/cannot exceed/);
  });

  it("sends the currency in the form Stripe expects", () => {
    expect(params.currency).toBe("sgd");
  });
});

describe("a coach can find payout setup", () => {
  it("the payments page offers real setup, not a disabled placeholder", () => {
    const payments = src("components/coach/CoachPayments.tsx");
    expect(payments).toMatch(/PayoutsSection/);
    // The dead button that started this was disabled and labelled as
    // unavailable long after it shipped. Checked against code with
    // comments stripped, since the comment there explains the history.
    const code = payments.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/coming soon/i);
    expect(code).not.toMatch(/cursor-not-allowed/);
  });

  it("the dashboard checklist links each blocker to where it's done", () => {
    const dash = src("components/coach/CoachDashboard.tsx");
    expect(dash).toMatch(/blockerHref/);
    // Payouts live on their own screen, not in settings.
    expect(dash).toMatch(/\/payout\/i\.test\(blocker\) \? "\/payments"/);
  });
});
