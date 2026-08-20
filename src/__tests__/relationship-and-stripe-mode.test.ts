import fs from "fs";
import path from "path";
import { isStripeTestMode } from "@/lib/club/stripe-connect";

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
/** Line comments first — a "//" line containing "/*" would otherwise open
 * a block comment that swallows real code. */
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("relationship is answered, not defaulted", () => {
  // Left blank, the add form filed a contact as "family_caregiver" — the
  // value that decides whether the dashboard treats someone as the account
  // holder or as someone to send a WhatsApp invite to. That silent default
  // is how a user was asked to message her own number.
  it("is required on the web add form", () => {
    const modal = code("components/adults/AddContactModal.tsx");
    expect(modal).toMatch(/<Field label="Relationship" required>/);
    expect(modal).toMatch(/<select required value=\{relationship\}/);
  });

  it("blocks submit on the mobile add form", () => {
    const form = code("../apps/mobile/src/components/person-form.tsx");
    expect(form).toMatch(/const missingRelationship =/);
    expect(form).toMatch(/mode === 'add' && !relationship/);
    expect(form).toMatch(/disabled=\{loading \|\| !fullName\.trim\(\) \|\| missingRelationship\}/);
  });

  it("does not block editing a contact that predates the rule", () => {
    // Those contacts exist (one caused this bug). Forcing an answer before
    // an unrelated edit could be saved would be worse than leaving it.
    const form = code("../apps/mobile/src/components/person-form.tsx");
    expect(form).toMatch(/mode === 'add'/);
    const modal = code("components/adults/dashboard/EditContactModal.tsx");
    expect(modal).not.toMatch(/<select required/);
  });

  it("still offers Myself, which is the answer that was being missed", () => {
    expect(code("components/adults/AddContactModal.tsx")).toMatch(/<option value="self">Myself<\/option>/);
  });
});

describe("Stripe test mode is visible to the person who would lose by it", () => {
  const KEY = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    if (KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = KEY;
  });

  it("detects a test key", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    expect(isStripeTestMode()).toBe(true);
  });

  it("does not call a live key test", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    expect(isStripeTestMode()).toBe(false);
  });

  it("does not claim test mode when nothing is configured", () => {
    // A missing key is a different failure, already handled by callers.
    // Reporting "test mode" for it would be its own wrong statement.
    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeTestMode()).toBe(false);
  });

  it("warns in the coach's own payouts panel", () => {
    const section = code("components/coach/PayoutsSection.tsx");
    expect(section).toMatch(/state\.testMode &&/);
    expect(section).toMatch(/Test mode\./);
    expect(section).toMatch(/no\s*\n?\s*real payment can be taken/);
  });

  it("puts the warning above the fee copy and the connect button", () => {
    // Both are meaningless while test mode is on; a coach reading the fee
    // split first would reasonably assume the money is real.
    const section = code("components/coach/PayoutsSection.tsx");
    expect(section.indexOf("state.testMode &&")).toBeLessThan(section.indexOf("Tistra keeps"));
  });

  it("is wired from the server, not guessed in the browser", () => {
    // STRIPE_SECRET_KEY is a server secret; reading it client-side would
    // return undefined and silently report "live" forever.
    const page = code("app/(coach)/coach/settings/page.tsx");
    expect(page).toMatch(/testMode: isStripeTestMode\(\)/);
    expect(code("components/coach/PayoutsSection.tsx")).not.toMatch(/process\.env\.STRIPE_SECRET_KEY/);
  });
});
