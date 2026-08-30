import fs from "fs";
import path from "path";

/** The Play Store listing is live; the App Store one is not.
 *
 * Google supplies a badge for linking to a live listing and requires the
 * official artwork, self-hosted. Apple supplies one too — but only for an
 * app people can actually download. Using Apple's badge for an unreleased
 * app would be against their guidelines and would tell a visitor something
 * untrue, so the iOS side is a plain pill with no Apple mark until there
 * is a real listing behind it.
 */
const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const COMPONENT = "components/marketing/AppStoreLinks.tsx";
const SURFACES = [
  "components/home/MasterHome.tsx",
  "components/landing/immersive/SelfImmersiveLanding.tsx",
  "components/landing/immersive/AdultsImmersiveLanding.tsx",
];

describe("the Google Play badge", () => {
  const src = code(COMPONENT);

  it("uses the official artwork, self-hosted rather than hotlinked", () => {
    expect(src).toMatch(/\/store\/google-play-badge\.svg/);
    expect(src).not.toMatch(/play\.google\.com\/intl\/.*badges/);
  });

  it.each(["google-play-badge.svg", "app-store-badge.svg"])("ships %s as real SVG", (name) => {
    const badge = path.join(SRC, "..", "public", "store", name);
    expect(fs.existsSync(badge)).toBe(true);
    // A wrong file here would most likely be an HTML error page saved with
    // an .svg name, which is exactly how the first fetch failed.
    expect(fs.readFileSync(badge, "utf-8")).toMatch(/<svg[^>]*viewBox/);
  });

  it("points at the real listing", () => {
    expect(src).toMatch(/id=com\.tistrahealth\.app/);
  });

  it("carries a per-page utm so the three surfaces can be told apart", () => {
    expect(src).toMatch(/utm_source=tistrahealth/);
    expect(src).toMatch(/utm_campaign=\$\{encodeURIComponent\(source\)\}/);
  });

  it("has an accessible name, since the badge is an image", () => {
    expect(src).toMatch(/aria-label="Get Tistra Health on Google Play"/);
    expect(src).toMatch(/alt="Get it on Google Play"/);
  });
});

describe("the iOS side shows the badge but promises nothing", () => {
  const src = code(COMPONENT);

  it("uses Apple's official badge artwork", () => {
    expect(src).toMatch(/\/store\/app-store-badge\.svg/);
    expect(src).toMatch(/alt="Download on the App Store"/);
  });

  it("is not a link, because there is no listing behind it", () => {
    // Apple supplies the badge for linking to a live listing. Pointing it
    // at nothing would be against their guidelines and would tell a
    // visitor something untrue.
    expect(src).not.toMatch(/apps\.apple\.com/);
    const badgeIdx = src.indexOf("app-store-badge.svg");
    const before = src.slice(Math.max(0, badgeIdx - 400), badgeIdx);
    expect(before).not.toMatch(/<a\s/);
  });

  it("says plainly that it is not out yet", () => {
    expect(src).toMatch(/Coming soon/);
  });

  it("is visually subordinate to the live one", () => {
    expect(src).toMatch(/opacity: 0\.68/);
  });
});

describe("placement", () => {
  it.each(SURFACES)("%s shows it in the hero", (f) => {
    expect(code(f)).toMatch(/<AppStoreLinks/);
  });

  it.each(SURFACES)("%s gives it a distinct source", (f) => {
    expect(code(f)).toMatch(/source="(home|me|family)_hero"/);
  });

  it.each(SURFACES.slice(1))("%s does not hide it behind a scroll reveal", (f) => {
    // Reveal renders children at opacity 0 until an IntersectionObserver
    // fires. The two immersive heroes are built from Reveal blocks, so the
    // badge is deliberately placed outside them.
    const src = code(f);
    const idx = src.indexOf("<AppStoreLinks");
    const before = src.slice(Math.max(0, idx - 220), idx);
    expect(before).not.toMatch(/<Reveal[^>]*>\s*$/);
  });

  it("stays out of the coach product entirely", () => {
    // Tistra Coach is a different product with no mobile app.
    expect(code("components/landing/coach/CoachLanding.tsx")).not.toMatch(/AppStoreLinks/);
  });
});
