import fs from "fs";
import path from "path";

// Real payments for bookings, via Stripe Checkout and a destination charge.
//
// The properties worth guarding are the ones where being wrong means money
// moves incorrectly and nobody notices until a coach complains.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

describe("payment is never taken on trust", () => {
  const complete = src("app/(club)/club/checkout/[holdId]/complete/page.tsx");
  const session = src("lib/club/checkout-session.ts");

  it("reads the session back from Stripe on return", () => {
    // A success_url can be visited directly, so arriving there is not
    // proof of payment.
    expect(complete).toMatch(/settleFromCheckoutSession/);
    expect(session).toMatch(/payment_status === "paid"/);
  });

  it("settles from both the return and the webhook", () => {
    // Instant confirmation for the client who waits, correctness for the
    // one who closes the tab.
    expect(src("app/api/webhooks/stripe/route.ts")).toMatch(/settleFromCheckoutSession/);
  });

  it("verifies the webhook signature before settling", () => {
    const hook = src("app/api/webhooks/stripe/route.ts");
    const fn = hook.slice(hook.indexOf("async function handleClubBookingEvent"));
    expect(fn).toMatch(/verifyWebhookSignature/);
    expect(fn.indexOf("verifyWebhookSignature")).toBeLessThan(fn.indexOf("settleFromCheckoutSession"));
  });

  it("double settlement is a no-op, not a second booking", () => {
    const payments = src("lib/club/payments.ts");
    const fn = payments.slice(payments.indexOf("export async function settleFromCheckoutSession"));
    expect(fn).toMatch(/if \(hold\.booking_id\)/);
  });
});

describe("the money is split the way the coach was told", () => {
  const session = src("lib/club/checkout-session.ts");

  it("is a destination charge with an application fee", () => {
    expect(session).toMatch(/application_fee_amount: platformFeeCents/);
    expect(session).toMatch(/transfer_data: \{ destination: req\.connectedAccountId \}/);
  });

  it("does not set on_behalf_of", () => {
    // It would move Stripe's processing fee onto the coach, so their payout
    // would vary by card type and the flat 90% would stop being true.
    const code = session.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/on_behalf_of/);
  });

  it("uses the amount actually charged, not the price at hold time", () => {
    const payments = src("lib/club/payments.ts");
    expect(payments).toMatch(/outcome\.amountTotal \?\? service\.price_cents/);
  });

  it("reads the live fee rather than a constant", () => {
    // The rate now resolves through resolveBookingFee, which applies the
    // founding offer and otherwise falls through to getPlatformFeePercent.
    // The rule this protects is unchanged: never a hardcoded percentage.
    expect(session).toMatch(/resolveBookingFee\(admin, req\.coachProfileId, req\.priceCents\)/);
    expect(src("lib/club/founding-offer.ts")).toMatch(/getPlatformFeePercent\(admin\)/);
    expect(session).not.toMatch(/DEFAULT_PLATFORM_FEE_PERCENT/);
  });

  it("carries the founding-offer decision on the session, not a recount", () => {
    // Another booking can take the coach's last free slot between checkout
    // opening and settling. Recomputing at settlement would make the ledger
    // disagree with the application_fee_amount Stripe actually took.
    expect(session).toMatch(/founding_free: fee\.foundingFree \? "1" : "0"/);
    expect(src("lib/club/payments.ts")).toMatch(/const foundingFree = outcome\.foundingFree/);
  });

  it("still charges the coach for card processing on a free booking", () => {
    // These are destination charges: application_fee_amount is the platform's
    // whole take and Stripe's cost comes out of it, so a literal zero would
    // mean Tistra PAYS the card fee on every free booking.
    const offer = src("lib/club/founding-offer.ts");
    expect(offer).toMatch(/stripeProcessingCents/);
    expect(offer).not.toMatch(/platformFeeCents: 0,/);
  });
});

describe("refusing to take money we cannot forward", () => {
  const actions = src("app/(club)/club/actions.ts");

  it("blocks checkout when the coach has no payouts", () => {
    // Otherwise the client is charged, the coach is unpaid, and the
    // booking looks confirmed.
    const fn = actions.slice(actions.indexOf("export async function startBookingCheckout"));
    expect(fn).toMatch(/!coach\.stripe_account_id \|\| !coach\.stripe_payouts_enabled/);
    expect(fn).toMatch(/can't take payments yet/);
  });

  it("refuses an expired or released hold before charging", () => {
    const fn = actions.slice(actions.indexOf("export async function startBookingCheckout"));
    expect(fn).toMatch(/hold\.released_at \|\| new Date\(hold\.expires_at\) <= new Date\(\)/);
  });

  it("expires the Stripe session so it cannot outlive the hold", () => {
    expect(src("lib/club/checkout-session.ts")).toMatch(/expires_at:/);
  });
});

describe("the mock is never mistaken for a live payment", () => {
  it("labels test mode in the UI", () => {
    const page = src("app/(club)/club/checkout/[holdId]/page.tsx");
    expect(page).toMatch(/Pay \(test mode\)/);
    expect(page).toMatch(/No card will be charged/);
  });

  it("only goes live with a key and a payable coach", () => {
    expect(src("app/(club)/club/checkout/[holdId]/page.tsx")).toMatch(
      /stripeCheckoutConfigured\(\) && !!coach\.stripe_account_id && coach\.stripe_payouts_enabled/
    );
  });
});

describe("return URLs use the request's scheme", () => {
  const page = src("app/(club)/club/checkout/[holdId]/page.tsx");

  it("does not hardcode https", () => {
    // Hardcoding it sent Stripe's return URL to https://localhost:3001,
    // which has no TLS: the card was charged and the client landed on a
    // browser error with no booking. Found by paying for real.
    expect(page).not.toMatch(/`https:\/\/\$\{/);
  });

  it("derives the scheme from the proxy header, falling back by host", () => {
    expect(page).toMatch(/x-forwarded-proto/);
    expect(page).toMatch(/isLocalDevHost\(host\) \? "http" : "https"/);
  });
});
