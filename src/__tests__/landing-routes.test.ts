import { getLoginUrl, getSignupUrl } from "@/lib/landing/routes";

// Regression test: the adults product has no dedicated /login or /signup
// route group — it shares "/login" and "/signup" with gym, and those shared
// routes resolve which product to show from ?product= (falling back to
// NEXT_PUBLIC_PRODUCT otherwise). Omitting ?product=adults meant clicking
// "Sign in" from the adults landing page silently fell back to whatever
// NEXT_PUBLIC_PRODUCT happened to be set to (e.g. "gym"), sending users to
// the wrong dashboard after login.
describe("getLoginUrl", () => {
  it("includes ?product=adults for the adults product (shared /login route)", () => {
    const url = getLoginUrl({ product: "adults", source: "nav" });
    expect(url).toContain("/login");
    expect(url).toContain("product=adults");
  });

  it("sends the coach product to the shared /login, never /gym/login", () => {
    // /gym/* is retired: the coach product is not gym-specific, and the
    // URL a coach lands on shouldn't tell them it is.
    const url = getLoginUrl({ product: "gym", source: "nav" });
    expect(url).toBe("/login?source=nav&product=coach");
    expect(url).not.toContain("/gym/");
  });

  it("still works when no source is given", () => {
    const url = getLoginUrl({ product: "adults" });
    expect(url).toContain("product=adults");
  });
});

describe("getSignupUrl", () => {
  it("includes ?product=adults for the adults product (shared /signup route)", () => {
    const url = getSignupUrl({ product: "adults", source: "nav", variant: "immersive" });
    expect(url).toContain("/signup");
    expect(url).toContain("product=adults");
  });

  it("sends the coach product to the shared /signup, never /gym/signup", () => {
    const url = getSignupUrl({ product: "gym", source: "nav", variant: "immersive" });
    expect(url).toBe("/signup?source=nav&variant=immersive&product=coach");
    expect(url).not.toContain("/gym/");
  });

  it("keeps attribution intact on the migrated route", () => {
    // source and variant are what the signup funnel is measured by; the
    // route change must not cost them.
    const url = getSignupUrl({ product: "gym", source: "coach_landing", variant: "standard" });
    expect(url).toContain("source=coach_landing");
    expect(url).toContain("variant=standard");
  });
});
