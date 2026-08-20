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
const page = () => src("app/(club)/club/deck.tsx");
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

  it("the cover is index 0, so the first coach is index 1", () => {
    // Position is observed, not derived from the cover's height — see the
    // "measured, not computed" block below.
    expect(feed()).toMatch(/data-deck-index="0"/);
  });
});

describe("skill filtering", () => {
  it("chips are real buttons with aria-pressed", () => {
    expect(feed()).toMatch(/aria-pressed=\{selected\}/);
    expect(feed()).toMatch(/type="button"/);
  });

  it("filters client-side over the loaded page — no second query per tap", () => {
    expect(feed()).toMatch(/coaches\.filter\(\(c\) => c\.skillSlugs\.includes\(skill\)\)/);
    expect(page()).toMatch(/discoverCoaches\(admin, \{ demo \}, now\)/);
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
    expect(page()).toMatch(/skillParam && bySlug\.has\(skillParam\)/);
    // The route still reads ?skill= and hands it down.
    expect(src("app/(club)/club/browse/page.tsx")).toMatch(/skillParam=\{params\.skill\}/);
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

  it("Browse all is a styled, tracked secondary action pointing at the list's home", () => {
    expect(feed()).toMatch(/>\s*Browse all\s*</);
    // Carries the audience: from /demo it must stay in the demo.
    expect(feed()).toMatch(/href=\{demo \? "\/coaches\?demo=1" : "\/coaches"\}/);
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
      // The deck is the club homepage now.
      expect(src(f)).toMatch(/"\/" : "\/club\/browse"/);
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

describe("deck position is measured, not computed", () => {
  it("tracks the visible section with an IntersectionObserver", () => {
    // Sections are sized in dvh, which tracks the DYNAMIC viewport — on a
    // phone it changes as the URL bar collapses. Dividing scrollTop by
    // clientHeight therefore drifted, the error compounded down the deck,
    // and the last two cards both reported "12 / 12".
    expect(feed()).toMatch(/new IntersectionObserver/);
    expect(feed()).toMatch(/data-deck-index/);
    expect(code(feed())).not.toMatch(/scrollTop \/ /);
    expect(code(feed())).not.toMatch(/onScroll=/);
  });

  it("marks every section, cover included, so indices line up", () => {
    expect(feed()).toMatch(/data-deck-index="0"/);
    expect(feed()).toMatch(/data-deck-index=\{i \+ 1\}/);
  });

  it("re-observes when filtering changes the sections", () => {
    expect(feed()).toMatch(/\}, \[filtered\.length\]\)/);
  });

  it("picks the most-visible section so a half-scroll doesn't flicker", () => {
    expect(feed()).toMatch(/intersectionRatio/);
  });
});

describe("card layout on a phone", () => {
  it("coach meta clears the fixed Filters/counter row", () => {
    // The chrome sits at safe-area + 12px and is ~40px tall; meta at pt-6
    // put the coach's name underneath it.
    expect(feed()).toMatch(/paddingTop: "calc\(env\(safe-area-inset-top\) \+ 64px\)"/);
  });

  it("keeps the photo subject clear of the meta block", () => {
    expect(feed()).toMatch(/objectPosition: "center 40%"/);
  });
});

/** Reads intrinsic dimensions from a lossy WebP's VP8 bitstream header —
 * the file itself, not a filename convention that could go stale. */
function webpSize(buf: Buffer): { width: number; height: number } {
  const i = buf.indexOf("VP8 ", 12);
  if (i === -1) throw new Error("not a lossy WebP");
  // 4-byte tag, 4-byte size, 3-byte start code, then 14-bit w/h.
  const off = i + 8 + 6;
  return {
    width: buf.readUInt16LE(off) & 0x3fff,
    height: buf.readUInt16LE(off + 2) & 0x3fff,
  };
}

describe("placeholder photos match the card shape", () => {
  it("are portrait, not squares cropped to their middle", () => {
    // 560x560 in a 390x844 card showed the middle ~44%, upscaled 1.5x.
    const dir = path.join(__dirname, "..", "..", "public", "coach-photos");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".webp"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const { width, height } = webpSize(fs.readFileSync(path.join(dir, f)));
      expect([f, height > width]).toEqual([f, true]);
      // And large enough for a 3x phone screen rather than upscaled.
      expect([f, width >= 800]).toEqual([f, true]);
    }
  });
});
