import fs from "fs";
import path from "path";

// Two Play Console findings on release 44, fixed together because they share
// a build and a device test pass:
//
//   1. "DEX code optimisation is below our threshold" — obfuscation at 2%,
//      with a stated deadline of 2026-02-27 and a warning about visibility
//      and publishing. R8 had never run: android.enableMinifyInReleaseBuilds
//      defaults to false and nothing set it.
//   2. "Remove resizability and orientation restrictions" — MainActivity was
//      locked to portrait. From Android 16 the OS ignores that on large
//      screens regardless, so the lock buys nothing and costs the layout.
//
// These pin the config, because both are invisible once set: a dropped flag
// or a renamed option fails silently and only shows up as a Play Console
// warning weeks later.

const MOBILE = path.join(__dirname, "..", "..", "apps", "mobile");
const appJson = JSON.parse(fs.readFileSync(path.join(MOBILE, "app.json"), "utf-8")).expo;

function buildProperties(): Record<string, unknown> {
  const entry = appJson.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === "expo-build-properties"
  );
  expect(entry).toBeDefined();
  return entry[1].android;
}

describe("R8 runs on release builds", () => {
  it("enables minification and resource shrinking", () => {
    const android = buildProperties();
    expect(android.enableMinifyInReleaseBuilds).toBe(true);
    // Documented as only meaningful alongside minification.
    expect(android.enableShrinkResourcesInReleaseBuilds).toBe(true);
  });

  it("keeps the two libraries whose failure would be silent", () => {
    const rules = String(buildProperties().extraProguardRules);
    // expo-notifications ships this rule itself but never declares
    // consumerProguardFiles, so R8 would not pick it up.
    expect(rules).toMatch(/-keep class expo\.modules\.notifications\.\*\* \{ \*; \}/);
    // A stripped billing class costs money rather than a screen.
    expect(rules).toMatch(/-keep class com\.revenuecat\.purchases\.\*\* \{ \*; \}/);
    expect(rules).toMatch(/-keep class com\.android\.billingclient\.\*\* \{ \*; \}/);
  });
});

describe("orientation is free on Android and locked on iOS", () => {
  it("still declares portrait, which is what iOS reads", () => {
    // @expo/config-plugins' iOS handler spreads its derived
    // UISupportedInterfaceOrientations OVER anything in ios.infoPlist, so
    // this value — not an infoPlist override — is what locks iOS. The app is
    // phone-only and was designed portrait; changing this to "default" would
    // unlock rotation there too.
    expect(appJson.orientation).toBe("portrait");
    expect(appJson.ios.supportsTablet).toBe(false);
    expect(appJson.ios.infoPlist.UISupportedInterfaceOrientations).toBeUndefined();
  });

  it("strips the Android lock through a plugin, since app.json cannot do it per-platform", () => {
    expect(appJson.plugins).toContain("./plugins/withAndroidFreeOrientation");
    const plugin = fs.readFileSync(path.join(MOBILE, "plugins", "withAndroidFreeOrientation.js"), "utf-8");
    expect(plugin).toMatch(/delete mainActivity\.\$\[SCREEN_ORIENTATION\]/);
    expect(plugin).toMatch(/getMainActivityOrThrow/);
  });
});
