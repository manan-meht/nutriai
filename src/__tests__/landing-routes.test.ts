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

  it("does not need ?product= for gym, which has its own /gym/login route", () => {
    const url = getLoginUrl({ product: "gym", source: "nav" });
    expect(url).toBe("/gym/login?source=nav");
    expect(url).not.toContain("product=");
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

  it("does not need ?product= for gym, which has its own /gym/signup route", () => {
    const url = getSignupUrl({ product: "gym", source: "nav", variant: "immersive" });
    expect(url).toBe("/gym/signup?source=nav&variant=immersive");
    expect(url).not.toContain("product=");
  });
});
