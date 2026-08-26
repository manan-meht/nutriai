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

  it("does not leak onto Tistra Health", () => {
    // signup and login are one shared route across three products, so the
    // tag there is branched rather than unconditional.
    const signup = code("app/(public)/signup/page.tsx");
    expect(signup).toMatch(/product === "gym" &&/);
    // The root layout wraps all three products, including Tistra Health.
    expect(code("app/layout.tsx")).not.toMatch(/GoogleAdsTag/);
  });

  it("covers Tistra Club too, exactly once per page", () => {
    // Google reported the tag missing while it lived only on the coach
    // host: its check fetches the domain registered on the Ads account.
    // A layout, so a new club route cannot miss the tag — and so no club
    // PAGE carries its own copy, which would put two tags on one page.
    expect(code("app/(club)/layout.tsx")).toMatch(/<GoogleAdsTag \/>/);
    for (const page of [
      "app/(club)/club/browse/page.tsx",
      "app/(club)/club/demo/page.tsx",
      "app/(club)/club/coaches/page.tsx",
      "app/(club)/club/bookings/page.tsx",
      "app/(club)/club/profile/page.tsx",
    ]) {
      expect(code(page)).not.toMatch(/GoogleAdsTag/);
    }
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

  it("sends the labelled conversion Google Ads issued", () => {
    // Google Ads reports a conversion action as unconnected until it
    // receives a conversion, and drops an unlabelled event silently —
    // which looks identical to working. The label is what makes it real.
    const t = code(PAGE);
    expect(t).toMatch(/const CONVERSION_LABEL = "3TrvCLHh6uUcENLH38dE"/);
    // Kept guarded, so blanking the label disables the event rather than
    // sending one Google will throw away.
    expect(t).toMatch(/\{CONVERSION_LABEL && \(/);
    expect(t).toMatch(/'send_to': '\$\{GOOGLE_ADS_ID\}\/\$\{CONVERSION_LABEL\}'/);
    expect(t).toMatch(/'value': \$\{CONVERSION_VALUE\}/);
    expect(t).toMatch(/'currency': '\$\{CONVERSION_CURRENCY\}'/);
  });

  it("reports the conversion on page load, not after hydration", () => {
    // next/script's afterInteractive waits for hydration; a plain script
    // runs during parse, just after the head tag defined gtag.
    const t = code(PAGE);
    expect(t).not.toMatch(/next\/script/);
    expect(t).not.toMatch(/strategy=/);
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

/** GA4 rides on the Ads tag rather than arriving as its own snippet.
 *
 * Google's GA4 install instructions say to paste a full snippet on every
 * page AND to keep one Google tag per page. With a tag already installed
 * those conflict: pasting verbatim yields two gtag/js loaders. One loader
 * serves multiple destinations, so GA4 is a second config command.
 */
describe("GA4 shares the existing Google tag", () => {
  const tag = fs.readFileSync(
    path.join(__dirname, "..", "components", "marketing", "GoogleAdsTag.tsx"),
    "utf-8"
  );

  it("configures the GA4 measurement ID", () => {
    expect(tag).toMatch(/GA4_MEASUREMENT_ID = "G-HWYL5L7KL2"/);
    expect(tag).toMatch(/gtag\('config', '\$\{GA4_MEASUREMENT_ID\}'\)/);
  });

  it("adds no second loader script", () => {
    // The whole point: one <script async src=...gtag/js...> on the page.
    expect((tag.match(/googletagmanager\.com\/gtag\/js/g) ?? []).length).toBe(1);
    expect(tag).not.toMatch(/gtag\/js\?id=\$\{GA4_MEASUREMENT_ID\}/);
  });

  it("keeps the loader on the Ads ID that Google's install check looks for", () => {
    expect(tag).toMatch(/gtag\/js\?id=\$\{GOOGLE_ADS_ID\}/);
  });

  it("configures GA4 after the consent default, never before", () => {
    // Consent Mode is order-sensitive. GA4 respects analytics_storage, but
    // only if the default is already in the queue when it configures.
    const consent = tag.indexOf("gtag('consent','default'");
    const ga4 = tag.indexOf("gtag('config', '${GA4_MEASUREMENT_ID}')");
    expect(consent).toBeGreaterThan(-1);
    expect(ga4).toBeGreaterThan(consent);
  });

  it("is covered by the analytics_storage consent signal", () => {
    const consent = fs.readFileSync(
      path.join(__dirname, "..", "lib", "privacy", "consent.ts"),
      "utf-8"
    );
    expect(consent).toMatch(/"analytics_storage"/);
  });
});
