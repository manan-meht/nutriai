import fs from "fs";
import path from "path";

// The swipe entry point: sign in on a phone, see a greeting and one
// motivating line, then one FULL-SCREEN coach per swipe. Explicitly not a
// regular scroll — the container snaps a whole viewport per profile — and
// explicitly not a Tinder deck: swiping back is always possible and no
// coach is ever discarded, which matters when the pool is eleven people.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const feed = () => src("components/club/SwipeFeed.tsx");
const page = () => src("app/(club)/club/browse/page.tsx");

describe("one full profile per screen", () => {
  it("snaps a full viewport per coach — the core of the ask", () => {
    expect(feed()).toMatch(/snap-y snap-mandatory/);
    expect(feed()).toMatch(/h-\[100dvh\]/);
    // Every section participates; without snap-always a fast flick can
    // sail past profiles, which turns the deck back into a plain scroll.
    expect(feed()).toMatch(/snap-start snap-always/);
  });

  it("uses dvh, not vh, so mobile browser chrome can't hide the CTA", () => {
    expect(feed()).not.toMatch(/h-screen/);
  });

  it("loads the first photo eagerly and the rest lazily", () => {
    expect(feed()).toMatch(/loading=\{i === 0 \? "eager" : "lazy"\}/);
  });

  it("tapping a coach opens the existing profile-and-booking chain", () => {
    expect(feed()).toMatch(/href=\{`\/coaches\/\$\{c\.id\}`\}/);
  });
});

describe("the cover screen", () => {
  it("greets by time of day in the market's timezone, not the server's", () => {
    // A Worker runs in UTC and would say good morning at dinner time.
    expect(page()).toMatch(/timeZone: CLUB_MARKET\.timezone/);
    expect(page()).toMatch(/Good morning/);
  });

  it("rotates the motivating line deterministically by day", () => {
    // A refresh must not feel like a slot machine.
    expect(page()).toMatch(/dayNumber % DAILY_LINES\.length/);
  });

  it("offers the skill filters and an all-skills default", () => {
    expect(feed()).toMatch(/All skills/);
    expect(feed()).toMatch(/\/browse\?skill=/);
  });
});

describe("entry points", () => {
  it("signing in on the club lands on the feed", () => {
    for (const f of ["app/(public)/login/page.tsx", "app/(public)/signup/page.tsx"]) {
      expect(src(f)).toMatch(/"\/browse" : "\/club\/browse"/);
    }
  });

  it("the list view links to the feed and the feed links back", () => {
    expect(src("app/(club)/club/page.tsx")).toMatch(/href="\/browse"/);
    expect(feed()).toMatch(/list view/);
  });

  it("browse is a registered club segment, so clean URLs resolve everywhere", () => {
    const { CLUB_APP_SEGMENTS } = require("@/lib/club/host");
    expect(CLUB_APP_SEGMENTS).toContain("browse");
  });
});
