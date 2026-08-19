import fs from "fs";
import path from "path";

// Tistra Health's own surfaces must not advertise coaching.
//
// Coaching is a separate product on a separate domain with its own signup.
// Every coach-facing link left on the Health homepage sent a visitor toward
// a product they can't sign up for here, and (before the split) into a
// signup path that no longer exists. This pins the removal so a future edit
// has to be deliberate.
//
// Scope is Health's own marketing chrome only. The coach host's landing
// (CoachLanding) and the routing in app/(public)/page.tsx that serves it
// obviously still name the product — that's the whole point of that file.

const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");

/** Health surfaces: rendered on tistrahealth.com for a consumer. */
const HEALTH_SURFACES = [
  "components/home/MasterHome.tsx",
  "components/home/UnifiedHome.tsx",
  "components/home/GetStartedModal.tsx",
];

/** Strips comments — the files explain *why* coaching was removed, and
 * that explanation must not itself trip the check. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Tistra Health surfaces do not advertise coaching", () => {
  it.each(HEALTH_SURFACES)("%s has no coach-facing copy", (file) => {
    const body = code(read(file));
    expect(body).not.toMatch(/\bCoach\b/);
    expect(body).not.toMatch(/coaching/i);
    expect(body).not.toMatch(/getCoachAppUrl/);
  });

  it.each(HEALTH_SURFACES)("%s links nowhere coach-related", (file) => {
    const body = code(read(file));
    expect(body).not.toMatch(/["'`]\/coach/);
    expect(body).not.toMatch(/coach\.tistrahealth\.com/);
  });

  it("the shared marketing nav has no Coach link", () => {
    const nav = code(read("components/home/MarketingHeader.tsx"));
    expect(nav).not.toMatch(/href="\/coach"/);
  });

  it("the footer does not cross-sell coaching from Health pages", () => {
    const footer = code(read("components/home/MarketingFooter.tsx"));
    expect(footer).not.toMatch(/Switch to the coaching view/);
    // The coach variant's own tagline is allowed — that footer renders on
    // the coach host, where naming the product is correct.
    const taglines = footer.slice(footer.indexOf("const TAGLINE"), footer.indexOf("}", footer.indexOf("const TAGLINE")));
    expect(taglines).not.toMatch(/home: "[^"]*coach/i);
  });

  it("the neutral-host metadata does not describe coaching", () => {
    const page = read("app/(public)/page.tsx");
    // Just the two neutral-host metadata blocks. The CoachLanding import
    // above them and the gym block below them both belong to the coach
    // host and must stay.
    const neutral = page.slice(
      page.indexOf("if (!byHostname"),
      page.indexOf('if (product === "gym")')
    );
    expect(code(neutral)).not.toMatch(/coach/i);
  });

  it("still serves the coach product on its own host", () => {
    // The counter-check: removing the mentions must not have removed the
    // routing that makes coach.tistrahealth.com work.
    const page = read("app/(public)/page.tsx");
    expect(page).toMatch(/CoachLanding/);
  });
});

// The mobile app is a Tistra Health surface too, and its sign-in screen had
// its own coach path — a /login?product=coach deep link presented "Sign in
// to your coaching account" and scoped the email to the gym product, long
// after the product picker stopped offering it. Read from disk rather than
// imported: jest's @/ alias points at the web app's src, and these are
// React Native screens.
const MOBILE = path.join(__dirname, "..", "..", "apps", "mobile", "src");
const readMobile = (p: string) => fs.readFileSync(path.join(MOBILE, p), "utf-8");

describe("mobile app auth screens offer no coach path", () => {
  it.each(["app/login.tsx", "app/signup.tsx"])("%s has no coach product", (file) => {
    const body = code(readMobile(file));
    expect(body).not.toMatch(/coach/i);
    // The gym scope was how a coach sign-in reached a different account.
    expect(body).not.toMatch(/'gym'/);
  });

  it.each(["app/login.tsx", "app/signup.tsx"])("%s still offers both adult products", (file) => {
    const body = code(readMobile(file));
    expect(body).toMatch(/self: \{ scopeAs: 'adults'/);
    expect(body).toMatch(/family: \{ scopeAs: 'adults'/);
  });

  it("the product picker offers only the two adult products", () => {
    const picker = code(readMobile("components/product-picker.tsx"));
    const options = picker.slice(picker.indexOf("const OPTIONS"), picker.indexOf("];", picker.indexOf("const OPTIONS")));
    expect((options.match(/key: '/g) ?? []).length).toBe(2);
    expect(options).not.toMatch(/coach/i);
  });

  it("an unknown product param falls through to the picker", () => {
    // This is what makes a stale ?product=coach deep link safe rather than
    // a crash or a silent wrong-account sign-in.
    expect(readMobile("app/login.tsx")).toMatch(/!\(product in PRODUCT_CONFIG\)/);
    expect(readMobile("app/login.tsx")).toMatch(/Redirect href="\/select-product"/);
  });
});

// The Tistra Health mobile app carries no coaching product at all as of
// Aug 2026 — coaching is getting its own app. The screens, the routing
// arbitration between two dashboards, the API surface and the types are
// all gone, not merely hidden behind a picker that no longer offers them.
describe("mobile app carries no coaching product", () => {
  it("has no gym screens", () => {
    expect(fs.existsSync(path.join(MOBILE, "app", "(app)", "gym"))).toBe(false);
  });

  it("registers no gym route in the authenticated stack", () => {
    expect(code(readMobile("app/(app)/_layout.tsx"))).not.toMatch(/name="gym"/);
  });

  it("routes straight to adults instead of arbitrating between dashboards", () => {
    const router = code(readMobile("app/(app)/index.tsx"));
    expect(router).not.toMatch(/href="\/gym"/);
    expect(router).not.toMatch(/saveLastDashboardChoice/);
    expect(router).toMatch(/if \(adults\) return <Redirect href="\/adults" \/>;/);
  });

  it("exposes no gym endpoints on the API client", () => {
    const api = code(readMobile("lib/api.ts"));
    for (const method of ["getGymWorkspace", "getGymClients", "createGymClient", "updateGymClient", "removeGymClient", "getGymClientDetails", "getRemovedGymClients"]) {
      expect([method, api.includes(method)]).toEqual([method, false]);
    }
  });

  it("narrows the product types to the two adult products", () => {
    expect(code(readMobile("components/product-picker.tsx"))).toMatch(/ProductKey = 'self' \| 'family';/);
    expect(code(readMobile("lib/product-intent.ts"))).toMatch(/PendingProduct = 'self' \| 'family';/);
  });

  it("counts only adults meals toward the dynamic app icon", () => {
    // The icon summed a coaching workspace's client meals too; leaving that
    // in would call an endpoint the app no longer ships a screen for.
    expect(code(readMobile("lib/dynamic-app-icon.ts"))).not.toMatch(/getGymClients|products\.gym/);
  });
});
