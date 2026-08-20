import fs from "fs";
import path from "path";

// The Stitch discovery redesign: homepage and coach deck as ONE vertical
// surface. The cover is 72dvh inside a mandatory snap container, so the
// top ~28% of the REAL first coach card peeks below it — no preview
// component, no second render of coach #1. Filtering is client-side over
// the already-loaded ranked page, so a chip tap updates the count and the
// peeking coach with no navigation and no scroll reset.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
/** Comments explain WHY things are absent, so negative assertions must
 * check code with comments stripped — the lesson this suite keeps
 * re-learning. */
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const feed = () => src("components/club/SwipeFeed.tsx");
const page = () => src("app/(club)/club/browse/page.tsx");
const loading = () => src("app/(club)/club/browse/loading.tsx");

describe("hero copy", () => {
  it("uses the approved headline and subheadline, once, identically everywhere", () => {
    expect(feed()).toContain("What do you want to get better at?");
    expect(feed()).toContain("Choose a skill, meet the right coach, and start moving forward.");
    // One string in one component — there is no separate desktop copy to
    // drift from the mobile copy.
    expect(feed().split("What do you want to get better at?").length).toBe(2);
  });

  it("the headline is the page H1", () => {
    expect(feed()).toMatch(/<h1[^>]*>\s*What do you want to get better at\?/);
  });

  it("the greeting is gone", () => {
    for (const body of [feed(), page()]) {
      expect(body).not.toMatch(/Good (morning|afternoon|evening)/);
    }
  });
});

describe("the first coach peeks into the initial viewport", () => {
  it("cover is 72dvh inside a full-viewport snap container", () => {
    // 72dvh cover + mandatory snap = the real first card's top 28% shows
    // at scroll position 0, and the first swipe snaps it to full screen.
    expect(feed()).toMatch(/h-\[72dvh\][^"]*snap-start/);
    expect(feed()).toMatch(/h-\[100dvh\] w-full snap-y snap-mandatory/);
  });

  it("coach sections stay one-per-screen", () => {
    expect(feed()).toMatch(/h-\[100dvh\] w-full snap-start snap-always/);
  });

  it("never renders the first coach twice", () => {
    // The peek IS the first card. A separate preview block was the failure
    // mode the spec named.
    expect(feed()).not.toMatch(/coaches\[0\]|filtered\[0\]|\.slice\(0, ?1\)/);
    expect((feed().match(/filtered\.map\(/g) ?? []).length).toBe(1);
  });

  it("card meta is anchored to the card top, so the peek carries it", () => {
    expect(feed()).toMatch(/absolute inset-x-0 top-0 z-20/);
  });

  it("the scroll index accounts for the short cover", () => {
    expect(feed()).toMatch(/coverH/);
  });
});

describe("skill filtering", () => {
  it("chips are real buttons with aria-pressed", () => {
    expect(feed()).toMatch(/aria-pressed=\{selected\}/);
    expect(feed()).toMatch(/type="button"/);
  });

  it("filters client-side over the loaded page — no second query per tap", () => {
    expect(feed()).toMatch(/coaches\.filter\(\(c\) => c\.skillSlugs\.includes\(skill\)\)/);
    expect(page()).toMatch(/discoverCoaches\(admin, \{\}, now\)/);
  });

  it("keeps the URL shareable without navigating", () => {
    expect(feed()).toMatch(/history\.replaceState/);
  });

  it("prioritises the approved chips and defers the rest behind More", () => {
    const order = page().match(/PRIORITY_SKILL_SLUGS = \[([\s\S]*?)\]/)?.[1] ?? "";
    const slugs = [...order.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
    expect(slugs).toEqual([
      "handstands",
      "strength-training",
      "acrobatics",
      "mobility",
      "yoga",
      "muay-thai",
      "running",
    ]);
    expect(feed()).toMatch(/>\s*More\s*</);
    // Deferred, not removed: More reveals every remaining skill.
    expect(feed()).toMatch(/showAllChips \? skills : skills\.slice\(0, primaryCount\)/);
  });

  it("deep links still seed the filter", () => {
    expect(page()).toMatch(/params\.skill && bySlug\.has\(params\.skill\)/);
  });
});

describe("count and list view", () => {
  it("counts only what the deck actually shows", () => {
    // The Stitch mock says "available this week", but the deck includes
    // coaches without a slot this week — the honest fallback the spec
    // sanctions is the plain count.
    expect(feed()).toMatch(/coaches`\} in \{marketName\}/);
    expect(code(feed())).not.toMatch(/available this week/);
  });

  it("Browse all is a styled, tracked secondary action", () => {
    expect(feed()).toMatch(/>\s*Browse all\s*</);
    expect(feed()).toMatch(/trackClubEvent\("list_view_clicked"\)/);
  });
});

describe("swipe affordance", () => {
  it("uses the approved wording per breakpoint", () => {
    expect(feed()).toContain("Swipe up to meet your first coach");
    expect(feed()).toContain("Meet your first coach");
  });

  it("animates gently and retires after first use", () => {
    expect(feed()).toMatch(/swipe-nudge/);
    expect(feed()).not.toMatch(/animate-bounce/);
    expect(feed()).toMatch(/hasInteracted \|\| filtered\.length === 0 \? "pointer-events-none opacity-0"/);
    // Reduced motion: the global override in globals.css flattens every
    // animation, this one included.
    const css = src("app/globals.css");
    expect(css).toMatch(/@keyframes swipe-nudge/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});

describe("states", () => {
  it("empty results show a message and a way out, never a blank screen", () => {
    expect(feed()).toContain("No coaches for this skill yet.");
    expect(feed()).toContain("Browse all coaches");
  });

  it("the loading state shows real copy and a card skeleton at peek height", () => {
    expect(loading()).toContain("What do you want to get better at?");
    expect(loading()).toMatch(/h-\[28dvh\]/);
    expect(code(loading())).not.toMatch(/spinner/i);
  });
});

describe("analytics", () => {
  it("follows the repo's stub pattern with the five events", () => {
    const analytics = src("lib/club/analytics.ts");
    for (const e of [
      "homepage_viewed",
      "skill_selected",
      "first_coach_preview_seen",
      "coach_feed_started",
      "list_view_clicked",
    ]) {
      expect(analytics).toContain(`"${e}"`);
      expect(feed()).toContain(`"${e}"`);
    }
    // The stub is console.debug, matching feedback/analytics.ts — no new
    // analytics library.
    expect(analytics).toMatch(/console\.debug/);
  });
});

describe("entry points still hold", () => {
  it("signing in on the club lands on the feed", () => {
    for (const f of ["app/(public)/login/page.tsx", "app/(public)/signup/page.tsx"]) {
      expect(src(f)).toMatch(/"\/browse" : "\/club\/browse"/);
    }
  });

  it("tapping a coach opens the existing profile-and-booking chain", () => {
    expect(feed()).toMatch(/href=\{`\/coaches\/\$\{c\.id\}`\}/);
  });

  it("browse remains a registered club segment", () => {
    const { CLUB_APP_SEGMENTS } = require("@/lib/club/host");
    expect(CLUB_APP_SEGMENTS).toContain("browse");
  });
});
