import { resolveProductFromHostname, getCrossProductSwitchUrl } from "@/lib/product/resolve-product";

describe("resolveProductFromHostname", () => {
  it("resolves gym from gym.localhost", () => {
    expect(resolveProductFromHostname("gym.localhost:3000")).toBe("gym");
  });

  it("resolves gym from brand-gym.com", () => {
    expect(resolveProductFromHostname("brand-gym.com")).toBe("gym");
  });

  it("resolves adults from adults.localhost", () => {
    expect(resolveProductFromHostname("adults.localhost:3000")).toBe("adults");
  });

  it("resolves adults from brand-adults.com", () => {
    expect(resolveProductFromHostname("brand-adults.com")).toBe("adults");
  });

  it("resolves adults from family.* prefix", () => {
    expect(resolveProductFromHostname("family.nutritionplatform.com")).toBe("adults");
  });

  it("falls back to env var if set", () => {
    process.env.NEXT_PUBLIC_PRODUCT = "gym";
    expect(resolveProductFromHostname("unknown.localhost")).toBe("gym");
    delete process.env.NEXT_PUBLIC_PRODUCT;
  });

  it("returns null for unknown hostname without env var", () => {
    delete process.env.NEXT_PUBLIC_PRODUCT;
    expect(resolveProductFromHostname("unknown.hostname")).toBeNull();
  });
});

describe("getCrossProductSwitchUrl", () => {
  it("switches from gym to adults", () => {
    const url = getCrossProductSwitchUrl("gym");
    expect(url).toContain("family.nutritionplatform.com");
  });

  it("switches from adults to gym", () => {
    const url = getCrossProductSwitchUrl("adults");
    expect(url).toContain("gym.nutritionplatform.com");
  });
});
