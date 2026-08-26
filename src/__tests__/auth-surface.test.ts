import { resolveAuthSurface } from "@/lib/auth";

/** https://tistrahealth.com/signup rendered "Create a Tistra Coach account".
 *
 * resolveProductFromHostname falls back to NEXT_PUBLIC_PRODUCT when a host
 * matches no dedicated domain, and that value is "gym" at build time. So a
 * neutral Health host with no ?product= resolved to the coach product: the
 * wrong title, the wrong favicon, and the coach product's Google tag
 * rendering on the Health domain.
 *
 * Tistra Health is adults — self and family. Coach signup keeps working
 * from the coach host and from an explicit ?product=.
 */
const P = (qs = "") => new URLSearchParams(qs);

describe("Tistra Health hosts are adults", () => {
  it.each(["tistrahealth.com", "www.tistrahealth.com"])("%s with no override", (host) => {
    expect(resolveAuthSurface(host, P())).toBe("adults");
  });

  it("covers both the self and family flows", () => {
    expect(resolveAuthSurface("tistrahealth.com", P("product=me"))).toBe("adults");
    expect(resolveAuthSurface("tistrahealth.com", P("product=family"))).toBe("adults");
    expect(resolveAuthSurface("family.tistrahealth.com", P())).toBe("adults");
  });

  it("does not inherit NEXT_PUBLIC_PRODUCT", () => {
    // The regression itself. This must hold whatever the env says.
    process.env.NEXT_PUBLIC_PRODUCT = "gym";
    expect(resolveAuthSurface("tistrahealth.com", P())).toBe("adults");
  });
});

describe("coaches can still sign up from the coach host", () => {
  it.each(["coach.tistra.club", "coach.tistrahealth.com"])("%s is a coach signup", (host) => {
    expect(resolveAuthSurface(host, P())).toBe("gym");
  });

  it("an explicit product= still reaches coach signup from anywhere", () => {
    expect(resolveAuthSurface("tistrahealth.com", P("product=coach"))).toBe("gym");
    expect(resolveAuthSurface("tistrahealth.com", P("product=gym"))).toBe("gym");
  });

  it("the host wins over a stale query param", () => {
    // A coach following a link with ?product=me must not land in a Health
    // signup on the coach host.
    expect(resolveAuthSurface("coach.tistra.club", P("product=me"))).toBe("gym");
  });
});

describe("club", () => {
  it.each(["tistra.club", "www.tistra.club"])("%s is a club signup", (host) => {
    expect(resolveAuthSurface(host, P())).toBe("club");
  });

  it("is reachable by param from a neutral host", () => {
    expect(resolveAuthSurface("tistrahealth.com", P("product=club"))).toBe("club");
  });
});

describe("the Google tag follows the surface", () => {
  const fs = require("fs");
  const path = require("path");
  const read = (p: string) =>
    fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

  it.each(["app/(public)/signup/page.tsx", "app/(public)/login/page.tsx"])(
    "%s renders the tag only for the coach surface",
    (f) => {
      // Health resolving to "gym" is what put the coach product's Ads tag —
      // and now GA4 — on tistrahealth.com/signup.
      expect(read(f)).toMatch(/product === "gym" && <GoogleAdsTag \/>/);
    }
  );

  it.each(["app/(public)/signup/page.tsx", "app/(public)/login/page.tsx"])(
    "%s uses the shared resolver rather than its own copy",
    (f) => {
      const src = read(f);
      expect(src).toMatch(/import \{ resolveAuthSurface/);
      expect(src).not.toMatch(/function resolveAuthSurface/);
    }
  );
});
