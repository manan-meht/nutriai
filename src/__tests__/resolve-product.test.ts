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
  // Domain-based switching only kicks in when separate gym/family domains
  // are actually configured (NEXT_PUBLIC_GYM_DOMAIN !== NEXT_PUBLIC_FAMILY_DOMAIN)
  // — otherwise it falls back to the shared "/" route with a ?product=
  // override, which is what local dev (and this test env, absent these
  // vars) uses. Set them explicitly here to exercise the production path.
  const originalGymDomain = process.env.NEXT_PUBLIC_GYM_DOMAIN;
  const originalFamilyDomain = process.env.NEXT_PUBLIC_FAMILY_DOMAIN;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GYM_DOMAIN = "gym.nutritionplatform.com";
    process.env.NEXT_PUBLIC_FAMILY_DOMAIN = "family.nutritionplatform.com";
  });

  afterEach(() => {
    if (originalGymDomain === undefined) delete process.env.NEXT_PUBLIC_GYM_DOMAIN;
    else process.env.NEXT_PUBLIC_GYM_DOMAIN = originalGymDomain;
    if (originalFamilyDomain === undefined) delete process.env.NEXT_PUBLIC_FAMILY_DOMAIN;
    else process.env.NEXT_PUBLIC_FAMILY_DOMAIN = originalFamilyDomain;
  });

  it("switches from gym to adults using the configured family domain", () => {
    const url = getCrossProductSwitchUrl("gym");
    expect(url).toContain("family.nutritionplatform.com");
  });

  it("switches from adults to gym using the configured gym domain", () => {
    const url = getCrossProductSwitchUrl("adults");
    expect(url).toContain("gym.nutritionplatform.com");
  });

  it("falls back to the shared ?product= route when no separate domains are configured", () => {
    delete process.env.NEXT_PUBLIC_GYM_DOMAIN;
    delete process.env.NEXT_PUBLIC_FAMILY_DOMAIN;
    expect(getCrossProductSwitchUrl("gym")).toBe("/?product=adults");
    expect(getCrossProductSwitchUrl("adults")).toBe("/?product=gym");
  });
});
