import fs from "fs";
import path from "path";
import { SG_COACH_MARKET, IN_COACH_MARKET, COACH_MARKET, cityForMarket, displayCity } from "@/lib/landing/coach-market";
import { spotsFrom } from "@/lib/landing/founding-spots";

/** coach.tistra.club/ is the live Google Ads destination for Singapore.
 * India must not be able to change it.
 *
 * The guarantee is structural, not a promise: India is its own route and
 * its own component, and CoachLanding imports nothing India-shaped. These
 * assertions fail the moment someone "helpfully" refactors the two
 * together.
 */
const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SG_PAGE = "components/landing/coach/CoachLanding.tsx";
const IN_PAGE = "components/landing/coach/IndiaCoachLanding.tsx";

describe("the Singapore ads page is isolated from India", () => {
  const sg = code(SG_PAGE);

  it("names no India market", () => {
    expect(sg).not.toMatch(/IN_COACH_MARKET|IndiaCoachLanding|India/);
  });

  it("still resolves COACH_MARKET to Singapore", () => {
    // The default export name and value are unchanged, so every existing
    // import keeps pointing at Singapore.
    expect(COACH_MARKET).toBe(SG_COACH_MARKET);
    expect(COACH_MARKET.name).toBe("Singapore");
    expect(COACH_MARKET.currency).toBe("SGD");
    expect(COACH_MARKET.foundingCoachLimit).toBe(20);
  });

  it("keeps the Singapore eyebrow and skills exactly as shipped", () => {
    expect(SG_COACH_MARKET.eyebrow).toBe("For independent coaches in Singapore");
    expect(SG_COACH_MARKET.skillExamples).toEqual([
      "strength training", "handstands", "swimming", "mobility",
    ]);
  });

  it("does not personalise Singapore by city", () => {
    // Singapore is one city. A city headline there would be noise, and the
    // ads page must not start varying per request.
    expect(SG_COACH_MARKET.cities).toEqual([]);
    expect(cityForMarket(SG_COACH_MARKET, "Singapore")).toBeNull();
    expect(sg).not.toMatch(/visitorCity|cf\.city/);
  });

  it("is reached by a route that India cannot render", () => {
    const indiaRoute = code("app/(public)/india/page.tsx");
    expect(indiaRoute).toMatch(/IndiaCoachLanding/);
    expect(indiaRoute).not.toMatch(/[^a-zA-Z]CoachLanding/);
  });
});

describe("India", () => {
  const inPage = code(IN_PAGE);

  it("uses its own market, currency and allocation", () => {
    expect(IN_COACH_MARKET.name).toBe("India");
    expect(IN_COACH_MARKET.currency).toBe("INR");
    expect(IN_COACH_MARKET.currencySymbol).toBe("₹");
    expect(IN_COACH_MARKET.foundingCoachLimit).toBe(25);
  });

  it("does not count Singapore's coaches as its own", () => {
    // coach_profiles has no country column yet, so India reports its full
    // allocation rather than the global count.
    expect(spotsFrom(0, IN_COACH_MARKET.foundingCoachLimit)).toMatchObject({
      total: 25, joined: 0, remaining: 25,
    });
  });

  it("says plainly that bookings are not live there", () => {
    // The honest part. Payments run on Stripe Connect and Razorpay Route is
    // not built, so nobody can book and pay in India today.
    expect(inPage).toMatch(/Clients cannot book and pay/);
    expect(inPage).toMatch(/Bookings and payments are not yet available/);
    expect(inPage).toMatch(/Is Tistra live in India yet\?/);
  });

  it("frames the commission as conditional on launch, never as available now", () => {
    expect(inPage).toMatch(/once bookings open in India/);
  });

  it("guarantees nothing", () => {
    for (const m of inPage.matchAll(/guarantee/gi)) {
      const ctx = inPage.slice(Math.max(0, m.index! - 40), m.index! + 10);
      expect(ctx).toMatch(/\b(not|no|cannot|never|Am I)\b/i);
    }
  });

  it("shows no Singapore coaches", () => {
    // coachPreview is global; rendering it here would advertise Singapore
    // coaches as India's marketplace.
    expect(inPage).not.toMatch(/coachPreview|MarketplacePreview/);
  });
});

describe("city detection", () => {
  it("recognises the cities the market serves", () => {
    expect(cityForMarket(IN_COACH_MARKET, "Mumbai")).toBe("Mumbai");
    expect(cityForMarket(IN_COACH_MARKET, "pune")).toBe("Pune");
  });

  it("normalises the aliases Cloudflare and people disagree about", () => {
    expect(cityForMarket(IN_COACH_MARKET, "Bangalore")).toBe("Bengaluru");
    expect(cityForMarket(IN_COACH_MARKET, "Gurgaon")).toBe("Gurugram");
    expect(cityForMarket(IN_COACH_MARKET, "New Delhi")).toBe("Delhi");
  });

  it("drops a city it does not serve rather than guessing", () => {
    // City-level IP geolocation is 60-80% accurate and Indian mobile
    // networks resolve to circle gateways. A wrong city in a headline is
    // worse than no city.
    for (const bad of ["Reykjavik", "", "   ", null, undefined]) {
      expect(cityForMarket(IN_COACH_MARKET, bad)).toBeNull();
    }
  });

  it("title-cases whatever casing the edge returns", () => {
    expect(displayCity("MUMBAI")).toBe("Mumbai");
    expect(displayCity("new delhi")).toBe("New Delhi");
  });

  it("prefers an explicit override to inference", () => {
    // An override that loses to geolocation is not an override — and it is
    // how the page is tested without a Worker.
    const src = code("lib/landing/visitor-city.ts");
    const overrideIdx = src.indexOf("x-tistra-city");
    const cfIdx = src.indexOf("getCloudflareContext");
    expect(overrideIdx).toBeGreaterThan(-1);
    expect(cfIdx).toBeGreaterThan(overrideIdx);
  });

  it("never lets a geolocation failure break the page", () => {
    const src = code("lib/landing/visitor-city.ts");
    expect(src).toMatch(/try \{/);
    expect(src).toMatch(/catch \{/);
  });
});
