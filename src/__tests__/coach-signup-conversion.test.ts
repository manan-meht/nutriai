import fs from "fs";
import path from "path";

// The Google Ads conversion for a completed coach signup.
//
// The tag has to fire once, when a coach actually goes live. Two ways to
// get that wrong, both of which corrupt campaign data rather than break
// anything visibly:
//
//   - putting it on /settings, where it fires every time a coach opens
//     their settings, counting coaches who converted weeks ago
//   - firing it when a coach PAUSES their profile, which is the opposite
//     of a conversion

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const PAGE = "app/(coach)/coach/settings/published/page.tsx";
const SETTINGS = "components/coach/CoachSettings.tsx";

describe("the tag lives on its own page", () => {
  it("emits a real script tag, not next/script's preload", () => {
    // next/script afterInteractive puts only <link rel="preload"> in the
    // head and injects the tag after hydration. It worked, but Google's
    // installation check looks for the literal script it hands you and
    // reported the tag as missing.
    const t = code("components/marketing/GoogleAdsTag.tsx");
    expect(t).toMatch(/<script async src=\{`https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=\$\{GOOGLE_ADS_ID\}`\} \/>/);
    expect(t).not.toMatch(/next\/script/);
    expect(t).not.toMatch(/strategy=/);
  });

  it("loads gtag with the Ads account", () => {
    const t = code("components/marketing/GoogleAdsTag.tsx");
    expect(t).toMatch(/AW-18404074450/);
    expect(t).toMatch(/googletagmanager\.com\/gtag\/js/);
    expect(t).toMatch(/gtag\('config', '\$\{GOOGLE_ADS_ID\}'\)/);
  });

  it("is not on the settings page, where it would fire on every visit", () => {
    const t = code(SETTINGS);
    expect(t).not.toMatch(/AW-18404074450/);
    expect(t).not.toMatch(/googletagmanager/);
  });

  it("covers every page of the coach product, per Google's instruction", () => {
    // Landing (where the ad click lands), the shared auth pages when they
    // are serving Tistra Coach, and every Coach OS page via the layout.
    expect(code("app/(coach)/layout.tsx")).toMatch(/<GoogleAdsTag \/>/);
    expect(code("app/(public)/signup/page.tsx")).toMatch(/product === "gym" && <GoogleAdsTag \/>/);
    expect(code("app/(public)/login/page.tsx")).toMatch(/product === "gym" && <GoogleAdsTag \/>/);
  });

  it("never renders twice on one page — Google warns against that", () => {
    // The confirmation page sits inside the (coach) layout, so its own copy
    // would be a second tag on the same page.
    expect(code(PAGE)).not.toMatch(/<GoogleAdsTag \/>/);
  });

  it("does not leak onto Tistra Health or Tistra Club", () => {
    // signup and login are one shared route across three products.
    const signup = code("app/(public)/signup/page.tsx");
    expect(signup).toMatch(/product === "gym" &&/);
    expect(code("app/(club)/club/browse/page.tsx")).not.toMatch(/GoogleAdsTag/);
    expect(code("app/layout.tsx")).not.toMatch(/GoogleAdsTag/);
  });

  it("is on the landing page, where ad clicks arrive", () => {
    // Without it here no _gcl_aw cookie is written, so a later conversion
    // cannot be attributed to the click — and Google's tag check, which
    // fetches the domain root, reports the tag as missing.
    // The coach host's ROOT is served by the shared root page's gym
    // branch, not by /coach — that is the URL the ad click lands on and
    // the one Google's checker fetches.
    expect(code("app/(public)/page.tsx")).toMatch(/<GoogleAdsTag \/>/);
    expect(code("app/(public)/coach/page.tsx")).toMatch(/<GoogleAdsTag \/>/);
  });

  it("defines the account id once, not copied per page", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && fs.readFileSync(full, "utf-8").includes("AW-18404074450")) {
          hits.push(path.relative(path.join(__dirname, ".."), full));
        }
      }
    };
    walk(path.join(__dirname, "..", "app"));
    walk(path.join(__dirname, "..", "components"));
    expect(hits).toEqual(["components/marketing/GoogleAdsTag.tsx"]);
  });

  it("keeps the conversion EVENT off every page but the confirmation", () => {
    // A stray copy anywhere else double-counts.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && fs.readFileSync(full, "utf-8").includes("'event', 'conversion'")) {
          hits.push(path.relative(path.join(__dirname, ".."), full));
        }
      }
    };
    walk(path.join(__dirname, "..", "app"));
    walk(path.join(__dirname, "..", "components"));
    expect(hits).toEqual([PAGE]);
  });

  it("loading the tag is not treated as a conversion", () => {
    // The base tag is on the landing page. If the conversion event were in
    // it, every ad click would count as a signup.
    expect(code("components/marketing/GoogleAdsTag.tsx")).not.toMatch(/'conversion'/);
  });

  it("stays inert until the conversion label is filled in", () => {
    // An unlabelled conversion event is silently dropped by Google, which
    // looks identical to working.
    const t = code(PAGE);
    expect(t).toMatch(/const CONVERSION_LABEL = /);
    expect(t).toMatch(/\{CONVERSION_LABEL && \(/);
  });
});

describe("it only fires on a real publish", () => {
  it("navigates with a real page load, so gtag reports the URL", () => {
    // The tag is mounted by the (coach) layout and does not re-run on a
    // client-side route change; router.push would mean no pageview for
    // /settings/published, and a URL-based conversion would never fire.
    const t = code(SETTINGS);
    expect(t).toMatch(/window\.location\.assign/);
    expect(t).not.toMatch(/router\.push\("\/settings\/published"\)/);
  });

  it("redirects to the page when publishing, never when pausing", () => {
    const t = code(SETTINGS);
    expect(t).toMatch(/if \(!published\) window\.location\.assign\("\/settings\/published"\)/);
  });

  it("does not redirect when the publish failed", () => {
    // Blockers return ok:false; landing on "you're live" then would be a
    // lie and a false conversion.
    const t = code(SETTINGS);
    const block = t.slice(t.indexOf("const res = await setCoachPublished"));
    expect(block).toMatch(/if \(!res\.ok\) \{[\s\S]*?return;[\s\S]*?\}/);
  });

  it("refuses to render for a profile that is not live", () => {
    // Guards a direct visit, a bookmark, or a coach who has since paused —
    // any of which would otherwise load the tag on a page view.
    const t = code(PAGE);
    expect(t).toMatch(/if \(profile\.status !== "published"\) redirect\("\/settings"\)/);
  });

  it("is excluded from search indexing", () => {
    expect(code(PAGE)).toMatch(/robots: \{ index: false, follow: false \}/);
  });
});
