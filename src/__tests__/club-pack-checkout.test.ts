import fs from "fs";
import path from "path";

// Buying a pack: profile -> Stripe -> credits.
//
// The failure that matters is a charge whose amount came from the browser,
// and a purchase that is credited twice because the webhook and the return
// page both settled it.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
/** Line comments first; never strip lines starting with "*" — that removes
 * a JSDoc's closing marker and swallows real code. */
const code = (p: string) =>
  src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const ACTIONS = "app/(club)/club/actions.ts";
const SESSION = "lib/club/checkout-session.ts";
const WEBHOOK = "app/api/webhooks/stripe/route.ts";
const PROFILE = "app/(club)/club/coaches/[coachId]/page.tsx";

describe("the charge is decided on the server", () => {
  it("takes only the pack id from the form", () => {
    // Price, coach and fee are all read server-side; a tampered amount in
    // the form has nothing to attach to.
    const t = code(ACTIONS);
    const fn = t.slice(t.indexOf("export async function buyPackAction"));
    expect(fn).toMatch(/formData\.get\("packId"\)/);
    expect(fn).not.toMatch(/formData\.get\("price/i);
    expect(fn).not.toMatch(/formData\.get\("amount/i);
  });

  it("prices the purchase from the pack row", () => {
    expect(code("lib/club/pack-purchases.ts")).toMatch(/price_cents: pack\.price_cents/);
  });

  it("refuses a coach who cannot be paid", () => {
    const t = code(ACTIONS);
    const fn = t.slice(t.indexOf("export async function buyPackAction"));
    expect(fn).toMatch(/stripe_payouts_enabled/);
    expect(fn).toMatch(/can't take payments yet/);
  });

  it("builds the return URL from the request, not a hardcoded scheme", () => {
    // A hardcoded https:// once sent a paying client to https://localhost.
    const t = code(ACTIONS);
    const fn = t.slice(t.indexOf("export async function buyPackAction"));
    expect(fn).toMatch(/formData\.get\("origin"\)/);
    expect(code(PROFILE)).toMatch(/x-forwarded-proto/);
  });
});

describe("the pack charge matches a booking charge", () => {
  it("is a destination charge with an inclusive platform fee", () => {
    // Buying ten classes must not be a way to pay a different rate.
    const t = code(SESSION);
    const fn = t.slice(t.indexOf("export async function createPackCheckoutSession"));
    expect(fn).toMatch(/application_fee_amount: req\.platformFeeCents/);
    expect(fn).toMatch(/transfer_data: \{ destination: req\.connectedAccountId \}/);
    expect(fn).not.toMatch(/on_behalf_of:/);
  });

  it("carries the purchase id in the session metadata", () => {
    // This is what tells a pack from a booking in the webhook.
    const t = code(SESSION);
    const fn = t.slice(t.indexOf("export async function createPackCheckoutSession"));
    expect(fn.match(/pack_purchase_id: req\.purchaseId/g)?.length).toBe(2);
  });

  it("does not expire the session, because a pack holds no slot", () => {
    const t = code(SESSION);
    const from = t.indexOf("export async function createPackCheckoutSession");
    const fn = t.slice(from, t.indexOf("export ", from + 10));
    expect(fn).not.toMatch(/expires_at/);
  });
});

describe("settling once", () => {
  it("re-reads the session from Stripe rather than trusting the redirect", () => {
    // A success_url can be visited directly; arriving is not proof of payment.
    expect(code("lib/club/pack-purchases.ts")).toMatch(/readCheckoutSession\(sessionId\)/);
    expect(code("lib/club/pack-purchases.ts")).toMatch(/if \(!outcome\.paid\)/);
  });

  it("is reached from both the webhook and the return page", () => {
    expect(code(WEBHOOK)).toMatch(/settlePackFromCheckoutSession/);
    expect(code("app/(club)/club/packs/complete/page.tsx")).toMatch(/settlePackFromCheckoutSession/);
  });

  it("verifies the webhook signature before crediting", () => {
    const t = code(WEBHOOK);
    const fn = t.slice(t.indexOf("async function handleClubPackEvent"));
    expect(fn).toMatch(/verifyWebhookSignature/);
    expect(fn.indexOf("verifyWebhookSignature")).toBeLessThan(fn.indexOf("settlePackFromCheckoutSession"));
  });

  it("tells a pack event from a booking event", () => {
    const t = code(WEBHOOK);
    const fn = t.slice(t.indexOf("async function handleClubPackEvent"));
    expect(fn).toMatch(/session\?\.metadata\?\.pack_purchase_id/);
    expect(fn).toMatch(/if \(!packPurchaseId/);
  });
});

describe("what the client sees before buying", () => {
  it("shows the per-class price and the saving", () => {
    const t = code(PROFILE);
    expect(t).toMatch(/perClassCents\(p\.priceCents, p\.classCount\)/);
    expect(t).toMatch(/savingPercent\(single, p\.priceCents, p\.classCount\)/);
  });

  it("buys through a form, not a link", () => {
    // Buying creates a pending purchase and a Stripe session; neither
    // belongs behind a GET a browser might prefetch.
    const t = code(PROFILE);
    expect(t).toMatch(/<form action=\{buyPackAction\}/);
  });

  it("hides packs whose class was deactivated", () => {
    expect(code("lib/club/discovery.ts")).toMatch(/A pack whose class was deactivated|p !== null/);
  });

  it("only offers packs still on sale", () => {
    expect(code("lib/club/discovery.ts")).toMatch(/from\("coach_class_packs"\)[\s\S]{0,140}\.eq\("is_active", true\)/);
  });
});
