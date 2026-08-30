import fs from "fs";
import path from "path";
import { spotsFrom, TOTAL_FOUNDING_COACH_SPOTS } from "@/lib/landing/founding-spots";
import { COACH_MARKET } from "@/lib/landing/coach-market";
import { FOUNDING_FREE_BOOKINGS } from "@/lib/club/founding-offer";

const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LANDING = "components/landing/coach/CoachLanding.tsx";
const SPOTS = "components/landing/coach/FoundingSpots.tsx";
const FAQ = "components/landing/coach/CoachFaq.tsx";

describe("founding spots are counted, not invented", () => {
  it("computes remaining from a real joined count", () => {
    expect(spotsFrom(4, 20)).toMatchObject({ total: 20, joined: 4, remaining: 16, available: true });
  });

  it("never goes negative or over-subscribed", () => {
    expect(spotsFrom(25, 20)).toMatchObject({ joined: 20, remaining: 0, available: false });
    expect(spotsFrom(-3, 20)).toMatchObject({ joined: 0, remaining: 20 });
  });

  it("stops advertising places once they are gone", () => {
    expect(spotsFrom(20, 20).available).toBe(false);
  });

  it("has no countdown timer anywhere on the page", () => {
    // Scarcity here is a real limit on how many coaches we can personally
    // onboard. A fake deadline is the fastest way to lose a professional.
    for (const f of [LANDING, SPOTS]) {
      const t = code(f);
      expect(t).not.toMatch(/setInterval|countdown|Date\.now\(\)|expires/i);
    }
  });

  it("reads the limit from the market config", () => {
    expect(TOTAL_FOUNDING_COACH_SPOTS).toBe(COACH_MARKET.foundingCoachLimit);
  });
});

describe("the page leads with clients, not with software", () => {
  const landing = code(LANDING);

  it("promises more clients in the h1", () => {
    // Approved Stitch headline: "Teach your skill. / Get more clients."
    expect(landing).toMatch(/<h1[\s\S]{0,600}?Teach your skill\./);
    expect(landing).toMatch(/<h1[\s\S]{0,600}?Get more clients\./);
  });

  it("says who it is for before anything else", () => {
    // The brief's five-second test: a coach must recognise themselves.
    expect(landing).toMatch(/For personal trainers, sports &amp; skill coaches/);
  });

  it("states the promotion commitment in the first sections", () => {
    // It sits in its own band under the hero now rather than inside it —
    // the redesign leads with the headline and the photograph. Still well
    // inside the first two viewport heights.
    const top = landing.slice(0, landing.indexOf("See what clients see"));
    expect(top).toMatch(/actively promote relevant coaches using Tistra/);
  });

  it("puts practice management below the marketplace story", () => {
    // Scheduling and payments are real, but they answer a question a coach
    // asks only once their calendar is full.
    const promote = landing.indexOf("You coach.");
    const discover = landing.indexOf("This is where clients discover you");
    const features = landing.indexOf("helps you run the rest");
    expect(promote).toBeGreaterThan(-1);
    expect(features).toBeGreaterThan(promote);
    expect(features).toBeGreaterThan(discover === -1 ? 0 : discover);
  });

  it("uses the market config rather than scattering the market name", () => {
    // One object to edit when Bengaluru opens. The eyebrow is now
    // audience-based rather than market-based ("For personal trainers,
    // sports & skill coaches"), so the config is read for the skill
    // examples and for the market name in image alt text instead.
    // One component, two markets: nothing market-specific is hardcoded.
    expect(landing).toMatch(/market\.skillExamples/);
    expect(landing).toMatch(/\$\{market\.name\}/);
    expect(landing).toMatch(/market\.images\.hero/);
    expect(landing).toMatch(/market\.live/);
    expect(landing).not.toMatch(/["'>]Singapore/);
  });
});

describe("nothing on the page guarantees an outcome", () => {
  const surfaces = [LANDING, FAQ, "components/landing/coach/ProfileShowcase.tsx"];

  it.each(surfaces)("%s promises no clients, bookings or income", (f) => {
    const t = code(f);
    // Every mention of a guarantee must be a denial of one. Checking for
    // the word alone flagged "does not guarantee enquiries", which is
    // exactly the sentence we want present.
    for (const m of t.matchAll(/guarantee/gi)) {
      const context = t.slice(Math.max(0, m.index! - 40), m.index! + 10);
      expect(context).toMatch(/\b(not|no|cannot|never|Am I)\b/i);
    }
    expect(t).not.toMatch(/\brevolutionary\b/i);
    expect(t).not.toMatch(/we('ll| will) (get|find) you \d* ?(clients|bookings)/i);
  });

  it("says plainly that promotion is not a guarantee", () => {
    expect(code(LANDING)).toMatch(/Promotion does not guarantee enquiries or bookings/);
  });

  it("answers the guarantee question honestly in the FAQ", () => {
    const faq = read(FAQ);
    expect(faq).toMatch(/Am I guaranteed clients\?/);
    expect(faq).toMatch(/Tistra does not guarantee enquiries or bookings/);
  });

  it("claims no ranking advantage anywhere", () => {
    // The badge section and its component were removed when Singapore and
    // India merged onto one page — it competed with the 0% commission
    // block for the same attention. Nothing may reintroduce a claim that
    // being a Founding Coach changes placement.
    expect(code(LANDING)).not.toMatch(/rank(s|ed|ing)? (higher|first|above)/i);
    expect(code(LANDING)).not.toMatch(/featured (placement|listing)|priority (placement|listing)/i);
  });
});

describe("the offer survives the click into signup", () => {
  it("signup shows the Founding Coach banner for coach landing traffic", () => {
    const signup = code("app/(public)/signup/page.tsx");
    expect(signup).toMatch(/FoundingCoachBanner/);
    expect(signup).toMatch(/params\.source === "coach_landing"/);
  });

  it("the banner restates the offer rather than just naming it", () => {
    const banner = read("components/landing/coach/FoundingCoachBanner.tsx");
    expect(banner).toMatch(/You&rsquo;re joining as a Founding Coach/);
    expect(banner).toMatch(/0% commission on your first \{FREE_BOOKINGS\} bookings/);
  });

  it("carries utm and click ids through to signup", () => {
    const cta = code("components/landing/coach/TrackedCta.tsx");
    expect(cta).toMatch(/startsWith\("utm_"\)/);
    expect(cta).toMatch(/gclid/);
    expect(cta).toMatch(/fbclid/);
  });

  it("records a request for setup help where someone can act on it", () => {
    expect(code("components/auth/AuthForm.tsx")).toMatch(/needs_onboarding_help: true/);
    expect(code("app/(admin)/admin/coaches/data.ts")).toMatch(/needs_onboarding_help/);
    expect(code("app/(admin)/admin/coaches/page.tsx")).toMatch(/wants setup help/);
  });
});

describe("the funnel is instrumented end to end", () => {
  const union = (() => {
    const t = read("lib/landing/track.ts");
    const i = t.indexOf("export type LandingEvent =");
    return t.slice(i, t.indexOf(";", i));
  })();

  it.each([
    "coach_landing_view",
    "founding_offer_view",
    "marketplace_preview_view",
    "pricing_section_view",
    "faq_view",
    "founding_cta_click",
    "navbar_signup_click",
    "onboarding_help_click",
    "signup_started",
    "signup_completed",
  ])("declares %s", (event) => {
    expect(union).toContain(`"${event}"`);
  });

  it("attaches campaign and device to every event centrally", () => {
    // At the sink, so a new event cannot ship without them.
    const t = code("lib/landing/track.ts");
    expect(t).toMatch(/\.\.\.campaignParams\(\)/);
    expect(t).toMatch(/device: deviceClass\(\)/);
  });

  it("reports how scarce the offer looked when a CTA was pressed", () => {
    expect(code(LANDING)).toMatch(/foundingSpotsRemaining: spots\.remaining/);
  });

  it("uses the existing gtag layer rather than a second analytics provider", () => {
    const t = read("lib/landing/track.ts");
    expect(t).toMatch(/window\.gtag/);
    for (const bad of ["posthog", "mixpanel", "segment", "amplitude"]) {
      expect(t.toLowerCase()).not.toContain(bad);
    }
  });
});

describe("the offer is one number", () => {
  it("the page and the FAQ both read it from the engine", () => {
    // Never restated as a literal: the copy and the money must not drift.
    expect(FOUNDING_FREE_BOOKINGS).toBe(10);
    expect(code(LANDING)).toMatch(/FOUNDING_FREE_BOOKINGS/);
    expect(code(FAQ)).toMatch(/FREE_BOOKINGS/);
    expect(code(LANDING)).not.toMatch(/first 10 bookings/);
  });
});

describe("connecting Google Calendar is optional", () => {
  const cal = read("components/coach/CalendarSection.tsx");
  const dash = read("components/coach/CoachDashboard.tsx");

  it("is labelled Optional on the setup page", () => {
    expect(cal).toMatch(/Optional/);
    expect(cal).toMatch(/You can publish your profile and take bookings without it/);
  });

  it("was never a publish blocker, and still is not", () => {
    // The checklist is what tells a coach what stands between them and
    // going live. Calendar has never belonged on it.
    const blockers = read("app/(admin)/admin/coaches/data.ts");
    expect(blockers).toMatch(/photo: !!r\.photo_url/);
    expect(blockers).not.toMatch(/calendar/i);
    expect(dash).toMatch(/PublishChecklist/);
  });

  it("keeps the scope promise the Google review depends on", () => {
    expect(cal).toMatch(/busy times/);
    expect(cal).toMatch(/never event names, guests or locations/);
  });
});
