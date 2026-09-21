import fs from "fs";
import path from "path";

/** Both store listings are live as of the iOS release (2026-09-21).
 *
 * Both stores supply their badge for linking to a real listing and require
 * the official artwork, self-hosted. Until iOS shipped, the App Store badge
 * was dimmed and captioned "Coming soon" rather than linked — pointing
 * Apple's mark at nothing would have been against their guidelines and a
 * small lie to the visitor. These tests now pin the opposite: a real link,
 * at the same visual weight as Play.
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

describe("the App Store badge", () => {
  const src = code(COMPONENT);

  it("uses Apple's official badge artwork", () => {
    expect(src).toMatch(/\/store\/app-store-badge\.svg/);
    expect(src).toMatch(/alt="Download on the App Store"/);
  });

  it("points at the real listing", () => {
    // The numeric id is the listing. A wrong or missing one sends every
    // iPhone visitor to a 404 with no error anywhere to notice it by.
    expect(src).toMatch(/https:\/\/apps\.apple\.com\/app\/tistra-health\/id6811860460/);
  });

  it("is a link, wrapping the badge", () => {
    const badgeIdx = src.indexOf("app-store-badge.svg");
    const before = src.slice(Math.max(0, badgeIdx - 400), badgeIdx);
    expect(before).toMatch(/<a\s/);
    expect(before).toMatch(/href=\{APP_STORE_URL\}/);
  });

  it("no longer hedges now that the app is out", () => {
    expect(src).not.toMatch(/Coming soon/);
    // It was dimmed to read as not-yet-available; at equal footing it must
    // not still be the faded one of the pair.
    expect(src).not.toMatch(/opacity: 0\.68/);
  });

  it("has an accessible name, since the badge is an image", () => {
    expect(src).toMatch(/aria-label="Download Tistra Health on the App Store"/);
  });

  it("opens in a new tab safely, like the Play one", () => {
    const badgeIdx = src.indexOf("app-store-badge.svg");
    const before = src.slice(Math.max(0, badgeIdx - 400), badgeIdx);
    expect(before).toMatch(/rel="noopener noreferrer"/);
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
