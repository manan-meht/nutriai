import { resolveProductFromHostnameOnly } from "@/lib/product/resolve-product";

describe("resolveProductFromHostnameOnly (unified home page gating)", () => {
  it("resolves gym subdomains directly, bypassing the unified home page", () => {
    expect(resolveProductFromHostnameOnly("coach.tistrahealth.com")).toBe("gym");
    expect(resolveProductFromHostnameOnly("gym.localhost:3000")).toBe("gym");
  });

  it("resolves family/adults subdomains directly, bypassing the unified home page", () => {
    expect(resolveProductFromHostnameOnly("family.tistrahealth.com")).toBe("adults");
    expect(resolveProductFromHostnameOnly("adults.localhost:3000")).toBe("adults");
  });

  it("does not resolve a bare/unknown host — this is what falls through to the unified home page", () => {
    expect(resolveProductFromHostnameOnly("tistrahealth.com")).toBeNull();
    expect(resolveProductFromHostnameOnly("localhost:3001")).toBeNull();
  });

  it("ignores env var and query param overrides (host-only resolver)", () => {
    process.env.NEXT_PUBLIC_PRODUCT = "gym";
    expect(resolveProductFromHostnameOnly("localhost:3001")).toBeNull();
    delete process.env.NEXT_PUBLIC_PRODUCT;
  });
});
