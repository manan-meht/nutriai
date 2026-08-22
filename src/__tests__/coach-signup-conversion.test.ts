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
  it("loads gtag with the Ads account", () => {
    const t = code(PAGE);
    expect(t).toMatch(/AW-18404074450/);
    expect(t).toMatch(/googletagmanager\.com\/gtag\/js/);
    expect(t).toMatch(/gtag\('config', '\$\{GOOGLE_ADS_ID\}'\)/);
  });

  it("is not on the settings page, where it would fire on every visit", () => {
    const t = code(SETTINGS);
    expect(t).not.toMatch(/AW-18404074450/);
    expect(t).not.toMatch(/googletagmanager/);
  });

  it("is on no other page either", () => {
    // A stray copy anywhere else double-counts.
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
    expect(hits).toEqual([PAGE]);
  });
});

describe("it only fires on a real publish", () => {
  it("redirects to the page when publishing, never when pausing", () => {
    const t = code(SETTINGS);
    expect(t).toMatch(/if \(!published\) router\.push\("\/settings\/published"\)/);
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
