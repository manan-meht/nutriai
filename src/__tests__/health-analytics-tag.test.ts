import fs from "fs";
import path from "path";

// Tistra Health carried no analytics at all until 2026-10-08: GA4 existed,
// but scoped to the club marketplace and the coach product, because that is
// where the ad spend is. Health is now measured too — on its own property,
// for the reason GoogleAdsTag already records: analytics covering a
// different surface than the ads cannot explain them.

const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const TAG = "components/marketing/HealthAnalyticsTag.tsx";
const HEALTH_LAYOUTS = ["app/(public)/layout.tsx", "app/(adults)/layout.tsx", "app/(gym)/layout.tsx"];

describe("the Health tag is measurement, on its own property", () => {
  const t = code(TAG);

  it("reads its measurement id from the environment", () => {
    expect(t).toMatch(/process\.env\.NEXT_PUBLIC_GA4_HEALTH_MEASUREMENT_ID/);
  });

  it("renders nothing at all when no id is configured", () => {
    // A missing id must mean "no analytics", never "analytics into whichever
    // property happened to be hardcoded".
    expect(t).toMatch(/if \(!GA4_HEALTH_MEASUREMENT_ID\) return null;/);
  });

  it("does not reuse the coach property or carry an Ads id", () => {
    const ads = code("components/marketing/GoogleAdsTag.tsx");
    const coachGa4 = ads.match(/G-[A-Z0-9]{9,}/)?.[0];
    const adsId = ads.match(/AW-[0-9]{9,}/)?.[0];
    expect(coachGa4).toBeTruthy();
    expect(t).not.toContain(coachGa4!);
    expect(t).not.toContain(adsId!);
    expect(t).not.toMatch(/AW-/);
  });
});

describe("it stays off the surfaces that already have a tag", () => {
  const t = code(TAG);

  it("skips the coach and club hosts", () => {
    // The (public) group serves all three products from one set of routes,
    // chosen by host. Tagging the other two here would double-load gtag AND
    // report their traffic into Health's property.
    expect(t).toMatch(/isCoachHost\(host\) \|\| isClubHost\(host\)/);
    expect(t).toMatch(/return null;/);
  });
});

describe("consent", () => {
  const t = code(TAG);

  it("sets the consent default before any config, in one script", () => {
    // Consent Mode is order-sensitive and React hoists async script tags
    // independently of where the JSX sits.
    const def = t.indexOf("gtag('consent','default'");
    const cfg = t.indexOf("gtag('config'");
    expect(def).toBeGreaterThan(-1);
    expect(cfg).toBeGreaterThan(def);
  });

  it("decides whether consent is required from the edge country header", () => {
    expect(t).toMatch(/consentRequiredFor\(headerStore\.get\("cf-ipcountry"\)\)/);
  });

  it("shows the banner on the same rule as the coach tag", () => {
    expect(t).toMatch(/shouldShowBanner\(\{ required, stored \}\)/);
  });
});

describe("where it is mounted", () => {
  it.each(HEALTH_LAYOUTS)("%s carries it", (f) => {
    expect(code(f)).toMatch(/<HealthAnalyticsTag \/>/);
  });

  it("is not in the root layout", () => {
    // The root wraps all three products; telling them apart there needs
    // headers(), forcing every page of all three to render dynamically.
    expect(code("app/layout.tsx")).not.toMatch(/HealthAnalyticsTag/);
  });

  it("is mounted by layout rather than page by page", () => {
    // So a new route cannot be missed and an existing one cannot be doubled.
    const perPage = fs
      .readdirSync(path.join(SRC, "app/(public)"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => {
        const p = path.join(SRC, "app/(public)", d.name, "page.tsx");
        return fs.existsSync(p) && /HealthAnalyticsTag/.test(fs.readFileSync(p, "utf-8"));
      });
    expect(perPage).toHaveLength(0);
  });
});
