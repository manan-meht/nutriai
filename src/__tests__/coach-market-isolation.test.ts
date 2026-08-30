import fs from "fs";
import path from "path";
import {
  SG_COACH_MARKET,
  IN_COACH_MARKET,
  COACH_MARKET,
  cityForMarket,
  displayCity,
  coachMarketForCountry,
} from "@/lib/landing/coach-market";
import { spotsFrom } from "@/lib/landing/founding-spots";

/** Singapore and India are one page now, differing only by a market object.
 *
 * They were two components. That guaranteed isolation but produced two
 * design systems on the same URL — Indian visitors got the old light page
 * while everyone else got the dark one. Merging trades a structural
 * guarantee for a configuration one, so these assertions carry the weight
 * the separation used to: Singapore is the live Google Ads destination and
 * must stay correct, and India must never imply a client can pay us there.
 */
const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LANDING = "components/landing/coach/CoachLanding.tsx";

describe("the market object carries every difference", () => {
  const landing = code(LANDING);

  it("hardcodes no market name in the page", () => {
    expect(landing).not.toMatch(/["'>]Singapore/);
    expect(landing).not.toMatch(/["'>]India/);
    expect(landing).toMatch(/\$\{market\.name\}/);
  });

  it("takes imagery, copy, disciplines and attribution from the market", () => {
    for (const key of [
      "market.images.hero",
      "market.images.closing",
      "market.heroSupport",
      "market.signupSource",
      "market.skillExamples",
    ]) {
      expect(landing).toContain(key);
    }
    expect(landing).toMatch(/<CategoryCards market=\{market\}/);
    expect(landing).toMatch(/<CoachFaq market=\{market\}/);
  });

  it("defaults to Singapore when no market is passed", () => {
    // So an accidental <CoachLanding /> can never render India.
    expect(landing).toMatch(/market = COACH_MARKET/);
    expect(COACH_MARKET).toBe(SG_COACH_MARKET);
  });
});

describe("Singapore, the ads destination", () => {
  it("keeps its identity, allocation and disciplines", () => {
    expect(SG_COACH_MARKET.name).toBe("Singapore");
    expect(SG_COACH_MARKET.currency).toBe("SGD");
    expect(SG_COACH_MARKET.foundingCoachLimit).toBe(20);
    expect(SG_COACH_MARKET.live).toBe(true);
    expect(SG_COACH_MARKET.signupSource).toBe("coach_landing");
    expect(SG_COACH_MARKET.featured).toHaveLength(4);
  });

  it("is not personalised by city", () => {
    // Singapore is one city; a city headline there would be noise, and the
    // ads landing page must not start varying per request.
    expect(SG_COACH_MARKET.cities).toEqual([]);
    expect(cityForMarket(SG_COACH_MARKET, "Singapore")).toBeNull();
  });
});

describe("India never implies bookings work there", () => {
  const landing = code(LANDING);

  it("is flagged as not live", () => {
    expect(IN_COACH_MARKET.live).toBe(false);
    expect(IN_COACH_MARKET.currency).toBe("INR");
    expect(IN_COACH_MARKET.foundingCoachLimit).toBe(25);
  });

  it("gates the 'not live' notice on exactly that flag", () => {
    expect(landing).toMatch(/\{!market\.live && \(/);
    expect(landing).toMatch(/Clients cannot book and\s+pay through Tistra in \{market\.name\} yet/);
  });

  it("makes the commission conditional on launch there", () => {
    expect(landing).toMatch(/market\.live \? "" : " once bookings open in " \+ market\.name/);
  });

  it("does not count Singapore's coaches as India's", () => {
    // coach_profiles has no country column yet, so India reports its full
    // allocation rather than the global count.
    expect(spotsFrom(0, IN_COACH_MARKET.foundingCoachLimit)).toMatchObject({
      total: 25,
      joined: 0,
      remaining: 25,
    });
  });

  it("prices the hero example in rupees, not Singapore dollars", () => {
    // It rendered S$120 on the India page until the example moved into
    // the market config.
    expect(IN_COACH_MARKET.exampleSession.price).toBe("₹1,500");
    expect(SG_COACH_MARKET.exampleSession.price).toBe("S$120");
    expect(code(LANDING)).not.toMatch(/S\$120/);
    expect(code(LANDING)).toMatch(/market\.exampleSession\.price/);
  });

  it("labels the Singapore storefront it shows", () => {
    // India has no published coaches; a fabricated Indian one would be the
    // invented social proof the rest of the page avoids.
    expect(landing).toMatch(/This is Tistra Club running in Singapore today/);
  });

  it("gets its own FAQ answers, not Singapore's", () => {
    const faq = code("components/landing/coach/CoachFaq.tsx");
    expect(faq).toMatch(/market\.live \? FAQ : IN_FAQ/);
    expect(read("components/landing/coach/CoachFaq.tsx")).toMatch(/Is Tistra live in India yet\?/);
  });
});

describe("the coach root picks the market from the edge", () => {
  const root = code("app/(public)/page.tsx");

  it("resolves IN to India and everything else to Singapore", () => {
    expect(coachMarketForCountry("IN").id).toBe("in");
    expect(coachMarketForCountry("in").id).toBe("in");
    for (const c of ["SG", "US", "GB", "", null, undefined, "XX"]) {
      expect(coachMarketForCountry(c).id).toBe("sg");
    }
  });

  it("branches the render on the country header, at the same URL", () => {
    expect(root).toMatch(/coachMarketForCountry\(headerStore\.get\("cf-ipcountry"\)\)/);
    expect(root).toMatch(/<CoachLanding market=\{coachMarket\} city=\{await visitorCity\(\)\} \/>/);
    // No redirect: coach.tistra.club keeps working from anywhere.
    expect(root).not.toMatch(/redirect\(["'`]\/india/);
  });

  it("keeps the Google tag on both variants", () => {
    const gym = root.slice(root.indexOf("coachMarketForCountry"));
    expect((gym.match(/<GoogleAdsTag \/>/g) ?? []).length).toBe(2);
  });

  it("gives India its own metadata and canonical", () => {
    expect(root).toMatch(/Tistra Coach India \| Get more coaching clients/);
    expect(root).toMatch(/canonical: "https:\/\/coach\.tistra\.club\/india"/);
  });

  it("still serves /india as its own indexable URL", () => {
    const india = code("app/(public)/india/page.tsx");
    expect(india).toMatch(/<CoachLanding market=\{IN_COACH_MARKET\}/);
  });
});

describe("the two markets share no photography", () => {
  /** The India set is real Indian coaching photography and is for India
   * only; Singapore keeps its own. A leak in either direction puts the
   * wrong country's gym on the page. */
  it("India points only at /marketing/india", () => {
    expect(IN_COACH_MARKET.images.hero).toMatch(/^\/marketing\/india\//);
    expect(IN_COACH_MARKET.images.closing).toMatch(/^\/marketing\/india\//);
    for (const c of IN_COACH_MARKET.featured) expect(c.image).toMatch(/^\/marketing\/india\//);
  });

  it("Singapore points nowhere near it", () => {
    expect(SG_COACH_MARKET.images.hero).not.toMatch(/\/india\//);
    expect(SG_COACH_MARKET.images.closing).not.toMatch(/\/india\//);
    for (const c of SG_COACH_MARKET.featured) expect(c.image).not.toMatch(/\/india\//);
  });

  it("every referenced file exists", () => {
    // A typo'd path renders an alt-text box on a cinematic landing page.
    for (const m of [SG_COACH_MARKET, IN_COACH_MARKET]) {
      for (const rel of [m.images.hero, m.images.closing, ...m.featured.map((c) => c.image)]) {
        expect(fs.existsSync(path.join(SRC, "..", "public", rel))).toBe(true);
      }
    }
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
    const src = code("lib/landing/visitor-city.ts");
    expect(src.indexOf("getCloudflareContext")).toBeGreaterThan(src.indexOf("x-tistra-city"));
  });
});

describe("the storefront shown is pinned, not whichever published last", () => {
  const preview = code("lib/landing/coach-preview.ts");

  it("pins by id", () => {
    expect(preview).toMatch(/SHOWCASE_COACH_ID = "a9b347bd-5bd3-4c56-99fc-c5ce6629063b"/);
    expect(preview).toMatch(/coaches\.find\(\(c\) => c\.id === SHOWCASE_COACH_ID\)/);
  });

  it("falls back rather than breaking if that profile is unpublished", () => {
    expect(preview).toMatch(/\?\? coaches\[0\] \?\? null/);
  });

  it("costs no extra query — it reads the same cached list", () => {
    expect(preview).toMatch(/const coaches = await coachPreview\(12\)/);
  });

  it("is used by the one landing, for both markets", () => {
    expect(code(LANDING)).toMatch(/showcaseCoach\(\)/);
  });
});
