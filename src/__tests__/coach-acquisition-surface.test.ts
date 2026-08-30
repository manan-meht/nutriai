import fs from "fs";
import path from "path";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/club/config";

// The public coach acquisition surface: coach.tistra.club's landing page
// and signup.
//
// Two things it kept getting wrong. It quoted "a small percentage", which a
// coach deciding whether to join cannot act on. And it inherited Tistra
// Health's identity — branding, and a medical disclaimer — onto what is a
// business onboarding flow, telling a coach they were signing up for a
// nutrition product.
//
// The product family is: Tistra Club (consumer marketplace), Tistra Coach
// (the coach's operating system), Tistra Health (an optional nutrition
// integration), under Tistra. Coach is not a feature of Health.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
/** Comments state the rules being tested and would satisfy the negative
 * assertions on their own — strip them so the checks read the code. */
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const LANDING = "components/landing/coach/CoachLanding.tsx";
const SIGNUP = "app/(public)/signup/page.tsx";
const AUTH_FORM = "components/auth/AuthForm.tsx";

describe("the commercial model is explicit", () => {
  it("states the fee as a number, not a feeling", () => {
    const landing = code(LANDING);
    expect(landing).toMatch(/Free to set up\. No monthly fee\. We take \$\{DEFAULT_PLATFORM_FEE_PERCENT\}% only when you get paid/);
    expect(landing).toMatch(/card processing included/);
  });

  it("has no vague fee wording left anywhere on the coach surface", () => {
    for (const f of [LANDING, SIGNUP]) {
      const t = code(f);
      expect(t).not.toMatch(/small percentage/i);
      expect(t).not.toMatch(/small commission/i);
      expect(t).not.toMatch(/low fee/i);
      expect(t).not.toMatch(/minimal percentage/i);
      // The 10% absorbs Stripe's cut; implying a second deduction is the
      // opposite of what the offer is.
      expect(t).not.toMatch(/payment fees extra/i);
    }
  });

  it("takes the number from the same constant the marketplace charges with", () => {
    // Hardcoding 10% in the copy is how a page ends up advertising one
    // number while checkout takes another.
    expect(code(LANDING)).toMatch(/DEFAULT_PLATFORM_FEE_PERCENT/);
    expect(DEFAULT_PLATFORM_FEE_PERCENT).toBe(10);
  });

  it("says it once, from one constant, so the two placements cannot drift", () => {
    const landing = code(LANDING);
    expect(landing.match(/\{PRICING_LINE\}/g)?.length).toBe(2);
  });

  it("tells a coach what it costs without scrolling", () => {
    // The original form of this check required PRICING_LINE itself beside
    // the hero CTA. The page now leads with the Founding Coach offer rather
    // than the commission, so the 10% sits in its own section — but the
    // requirement it was protecting is unchanged and is met more directly:
    // the cost of joining is stated at the point of decision, in the offer
    // card and under the button, above the fold.
    const landing = code(LANDING);
    // The dark redesign replaced the offer card with a hero CTA plus a
    // one-line cost summary, and a full-width 0% commission block further
    // down. The requirement is unchanged and still met above the fold.
    // The hero's copy and CTA live in HeroCopy, shared between the mobile
    // and desktop arrangements so the two cannot drift — on mobile the
    // photograph sits between the headline and this block.
    const heroCopy = landing.slice(landing.indexOf("function HeroCopy"));
    expect(heroCopy).toMatch(/Start coaching/);
    expect(heroCopy).toMatch(/Free to join · No monthly fee · 0% on your first/);
    expect(heroCopy).toMatch(/FOUNDING_FREE_BOOKINGS/);
    // And it is genuinely in the hero, not further down the page.
    const above = landing.slice(0, landing.indexOf("What do you coach"));
    expect(above).toMatch(/<HeroCopy/);
  });
});

describe("coach signup is not a Tistra Health surface", () => {
  it("shows the medical disclaimer only on Tistra Health's own signup", () => {
    expect(code(AUTH_FORM)).toMatch(/mode === "signup" && product === "adults" &&/);
  });

  it("still shows it where it belongs", () => {
    // Narrowing the audience must not delete the notice.
    expect(code(AUTH_FORM)).toMatch(/does not provide medical advice/);
  });

  it("titles the tab with the product being signed up for", () => {
    const signup = code(SIGNUP);
    expect(signup).toMatch(/surface === "gym" \? "Create a Tistra Coach account"/);
  });

  it("uses a coach-appropriate footer, not Tistra Health's", () => {
    const signup = code(SIGNUP);
    expect(signup).toMatch(/A Tistra product\./);
    expect(signup).toMatch(/if \(product === "adults"\) return null;/);
    // Only links that already exist — no invented legal URLs.
    expect(signup).toMatch(/href="\/privacy"/);
    expect(signup).toMatch(/href="\/terms"/);
    expect(signup).not.toMatch(/href="\/support"/);
  });

  it("points coach signup at its own canonical host", () => {
    expect(code(SIGNUP)).toMatch(/canonical: `\$\{COACH_CANONICAL_ORIGIN\}\/signup`/);
  });
});

describe("the product hierarchy in the footer", () => {
  it("does not present Tistra Coach as part of Tistra Health", () => {
    const landing = code(LANDING);
    expect(landing).not.toMatch(/part of Tistra Health/);
    expect(landing).toMatch(/Tistra Coach powers coaches on Tistra Club\./);
    expect(landing).toMatch(/A Tistra product\./);
  });

  it("keeps nutrition framed as an optional integration, not the product", () => {
    // A legitimate Tistra Health mention: the nutrition feature. It must
    // stay opt-in language rather than becoming the identity of the page.
    const landing = src(LANDING);
    expect(landing).toMatch(/powered by Tistra Health/);
    expect(landing).toMatch(/only ever with their explicit permission/);
  });
});

describe("/gym/signup is retired but not broken", () => {
  it("no CTA generates a /gym/ URL any more", () => {
    expect(getSignupUrl({ product: "gym", source: "nav", variant: "standard" })).not.toContain("/gym/");
    expect(getLoginUrl({ product: "gym", source: "nav" })).not.toContain("/gym/");
    expect(code("lib/landing/routes.ts")).not.toMatch(/"\/gym\/signup"/);
    expect(code(AUTH_FORM)).not.toMatch(/"\/gym\/signup"/);
  });

  it("redirects the old path permanently, preserving query params", () => {
    const mw = code("middleware.ts");
    // 308, not the default 307 — the path is retired for good.
    expect(mw).toMatch(/NextResponse\.redirect\(url, 308\)/);
    // The clone carries source/variant through; only pathname is rewritten.
    expect(mw).toMatch(/const url = request\.nextUrl\.clone\(\);\s*url\.pathname = `\/\$\{mode\}`;/);
  });

  it("resolves the coach product from the migrated URL", () => {
    // /signup?product=coach must land on Tistra Coach, or the redirect
    // silently signs coaches up for the wrong product.
    const { resolveProductFromHostname } = require("@/lib/product/resolve-product");
    const params = new URLSearchParams("source=nav&variant=standard&product=coach");
    expect(resolveProductFromHostname("tistrahealth.com", params)).toBe("gym");
  });
});

describe("Tistra Health itself is untouched", () => {
  it("still routes its own signup and login with its own product param", () => {
    expect(getSignupUrl({ product: "adults", source: "nav", variant: "standard" })).toContain("product=adults");
    expect(getLoginUrl({ product: "adults", source: "nav" })).toContain("product=adults");
  });

  it("keeps its disclaimer and its own footer treatment", () => {
    const signup = code(SIGNUP);
    expect(signup).toMatch(/"Create a Tistra Health account"/);
    expect(code(AUTH_FORM)).toMatch(/label: "Tistra Health"/);
  });
});

describe("the homepage satisfies Google's brand review", () => {
  // Google rejected verification twice over this page: "your homepage does
  // not explain the purpose of your app", and the consent-screen app name
  // not matching the name on the homepage. A reviewer has to be able to
  // read what the app IS and why it wants Google data.
  const landing = () => code(LANDING);

  it("states in one sentence what Tistra Coach is", () => {
    expect(landing()).toMatch(/Tistra Coach is the scheduling, payments and client-management app/);
  });

  it("names Google Calendar, not just 'your calendar'", () => {
    // "Connect your calendar" told a reviewer nothing about which calendar
    // or what is read from it.
    const t = landing();
    expect(t).toMatch(/Connect your Google Calendar/);
    expect(t).toMatch(/reads only your free\/busy times/);
  });

  it("says the integration is optional and scope-limited", () => {
    const t = landing();
    expect(t).toMatch(/Optional\./);
    expect(t).toMatch(/never your event titles, guests, locations or notes/);
  });

  it("presents Tistra Coach as the product name on its own homepage", () => {
    // The consent screen must be configured with this same name.
    const t = landing();
    expect(t).toMatch(/Tistra <span[^>]*>Coach<\/span>|Tistra Coach/);
  });

  it("keeps the homepage claim true to the requested scope", () => {
    const cal = src("lib/club/calendar.ts");
    expect(cal).toContain('"https://www.googleapis.com/auth/calendar.freebusy"');
  });
});
