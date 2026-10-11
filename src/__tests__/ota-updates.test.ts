import fs from "fs";
import path from "path";

import {
  evaluateVersionGate,
  parseVersionPolicy,
  PERMISSIVE_POLICY,
  type VersionPolicy,
} from "../../apps/mobile/src/lib/version-policy";

// Two things are tested here, and both are things that go wrong silently.
//
// The gate decides whether a paying user is allowed to open an app that
// would otherwise work, so every uncertain case has to resolve to "let them
// in" — and that is only provable by enumerating the uncertain cases.
//
// The configuration decides whether updates are delivered at all. A channel
// missing from a build profile, or an updates URL pointing at a different
// EAS project, produces no error anywhere: updates publish successfully and
// simply never arrive.

const MOBILE = path.join(__dirname, "..", "..", "apps", "mobile");
const readMobile = (p: string) => fs.readFileSync(path.join(MOBILE, p), "utf-8");
const appJson = JSON.parse(readMobile("app.json")).expo;
const easJson = JSON.parse(readMobile("eas.json"));
const mobilePkg = JSON.parse(readMobile("package.json"));

const policy = (over: Partial<VersionPolicy> = {}): VersionPolicy => ({
  ios: { minimumSupportedBuild: 5, latestBuild: 9 },
  android: { minimumSupportedBuild: 40, latestBuild: 46 },
  ...over,
});

describe("a newer version existing is not a reason to block anyone", () => {
  it("reports an available update without blocking", () => {
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 7, policy: policy() })).toEqual({
      status: "update_available",
      latestBuild: 9,
    });
  });

  it("says nothing when already on the latest", () => {
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 9, policy: policy() })).toEqual({ status: "ok" });
  });

  it("says nothing when ahead of the latest", () => {
    // A TestFlight or internal-track build is routinely ahead of the store.
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 12, policy: policy() })).toEqual({ status: "ok" });
  });

  it("blocks only below the minimum, and treats the minimum itself as supported", () => {
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 4, policy: policy() })).toEqual({
      status: "unsupported",
      minimumSupportedBuild: 5,
    });
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 5, policy: policy() })).toEqual({
      status: "update_available",
      latestBuild: 9,
    });
  });

  it("keeps the two platforms independent", () => {
    // Build 7 is supported on iOS and far below the Android minimum. The
    // numbering is per-platform and has no shared meaning.
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 7, policy: policy() }).status).toBe("update_available");
    expect(evaluateVersionGate({ platform: "android", installedBuild: 7, policy: policy() }).status).toBe("unsupported");
  });
});

describe("nothing uncertain ever locks anyone out", () => {
  it("lets everyone in when the config request failed", () => {
    // Offline, a 500, DNS, a timeout. None of these are evidence about the
    // installed build, and treating them as such turns a backend hiccup
    // into an outage.
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 1, policy: null })).toEqual({ status: "ok" });
  });

  it("lets everyone in when the build number could not be read", () => {
    for (const installedBuild of [null, NaN, Infinity]) {
      expect(evaluateVersionGate({ platform: "ios", installedBuild, policy: policy() })).toEqual({ status: "ok" });
    }
  });

  it("lets everyone in on a platform the policy does not describe", () => {
    expect(evaluateVersionGate({ platform: "web", installedBuild: 1, policy: policy() })).toEqual({ status: "ok" });
  });

  it("blocks nobody under the default policy", () => {
    // What the endpoint serves when nothing is configured, which is its
    // current production state. A minimum of 0 must not block build 1.
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 1, policy: PERMISSIVE_POLICY })).toEqual({
      status: "ok",
    });
    expect(PERMISSIVE_POLICY.ios.minimumSupportedBuild).toBe(0);
    expect(PERMISSIVE_POLICY.android.minimumSupportedBuild).toBe(0);
  });

  it("turns a malformed response into the permissive policy, not NaN", () => {
    // A NaN minimum would make every comparison false, which happens to be
    // safe — and a NaN that reached a message would read as "update to
    // build NaN". Parsing it to 0 is deliberate rather than lucky.
    for (const raw of [null, undefined, "nonsense", 42, {}, { ios: "x" }, { ios: { minimumSupportedBuild: "abc" } }]) {
      const parsed = parseVersionPolicy(raw);
      expect(parsed.ios.minimumSupportedBuild).toBe(0);
      expect(evaluateVersionGate({ platform: "ios", installedBuild: 1, policy: parsed })).toEqual({ status: "ok" });
    }
  });

  it("ignores a negative or zero latest build rather than reporting an update", () => {
    const parsed = parseVersionPolicy({ ios: { minimumSupportedBuild: 0, latestBuild: -3 } });
    expect(parsed.ios.latestBuild).toBeNull();
    expect(evaluateVersionGate({ platform: "ios", installedBuild: 1, policy: parsed })).toEqual({ status: "ok" });
  });

  it("does not raise the minimum supported version as part of this change", () => {
    // The brief is explicit about this: wiring the mechanism up is not the
    // same decision as retiring a build, and no build is retired here.
    const route = fs.readFileSync(
      path.join(__dirname, "..", "..", "apps", "mobile-api", "src", "app", "app-version-policy", "route.ts"),
      "utf-8"
    );
    expect(route).toMatch(/APP_MIN_SUPPORTED_BUILD_IOS, 0/);
    expect(route).toMatch(/APP_MIN_SUPPORTED_BUILD_ANDROID, 0/);
  });
});

describe("the update configuration is coherent", () => {
  it("points updates at this project, not another one", () => {
    // A URL carrying a different project id publishes and delivers
    // nothing, with no error at either end.
    const projectId = appJson.extra.eas.projectId;
    expect(projectId).toBeTruthy();
    expect(appJson.updates.url).toBe(`https://u.expo.dev/${projectId}`);
  });

  it("never delays launch waiting for an update", () => {
    // A non-zero timeout is how "the app must start offline" quietly stops
    // being true: launch waits, fails, and only then falls back.
    expect(appJson.updates.fallbackToCacheTimeout).toBe(0);
  });

  it("uses the fingerprint runtime policy", () => {
    // appVersion or nativeVersion would let a JS bundle that needs new
    // native code land on a binary that lacks it, because the version
    // string is bumped by hand and says nothing about the native runtime.
    expect(appJson.runtimeVersion).toEqual({ policy: "fingerprint" });
  });

  it("gives every build profile a channel and a matching environment", () => {
    // No channel means an installed binary listens on nothing. A mismatched
    // environment means an OTA can ship one environment's API URL into
    // another environment's binary, since EXPO_PUBLIC_* values are inlined
    // at publish time, not read at runtime.
    for (const [name, profile] of Object.entries(easJson.build) as [string, Record<string, string>][]) {
      expect(profile.channel).toBe(name);
      expect(profile.environment).toBe(name);
    }
  });

  it("names the channel and environment explicitly in the release scripts", () => {
    // `eas update --auto` takes the channel from the current git branch,
    // which makes publishing to production an accident waiting for someone
    // on a feature branch.
    expect(mobilePkg.scripts["update:production"]).toContain("--channel production");
    expect(mobilePkg.scripts["update:production"]).toContain("--environment production");
    expect(mobilePkg.scripts["update:preview"]).toContain("--channel preview");
    expect(mobilePkg.scripts["update:preview"]).not.toContain("production");
    for (const script of Object.values(mobilePkg.scripts) as string[]) {
      expect(script).not.toContain("eas update --auto");
    }
  });

  it("has expo-updates installed and in the lockfile", () => {
    // The lockfile half matters: a dependency present in package.json but
    // absent from the lockfile's workspace entry breaks EAS's `npm ci`
    // rather than the local build, so it surfaces as a failed build.
    expect(mobilePkg.dependencies["expo-updates"]).toBeTruthy();
    const lock = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package-lock.json"), "utf-8"));
    expect(lock.packages["apps/mobile"].dependencies["expo-updates"]).toBeTruthy();
    expect(lock.packages["node_modules/expo-updates"]).toBeTruthy();
  });
});

describe("updates are quiet", () => {
  it("adds no custom reload, so a session is never interrupted", () => {
    // Expo's default lifecycle already downloads in the background and
    // applies on the next cold launch. reloadAsync() is the one call that
    // would restart the app mid-use, discarding whatever someone was
    // typing.
    const files = collectSources(path.join(MOBILE, "src"));
    const offenders = files.filter((f) => /reloadAsync|fetchUpdateAsync/.test(fs.readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });

  it("shows no update dialog or notification for an OTA update", () => {
    // Routine OTA updates are meant to be invisible. The store-update
    // screen is a different thing: it appears only for a build the server
    // has explicitly retired.
    const diagnostics = readMobile("src/lib/update-diagnostics.ts");
    expect(diagnostics).not.toMatch(/Alert\.alert|Notifications\./);
    const gate = readMobile("src/lib/version-gate.ts");
    expect(gate).not.toMatch(/Alert\.alert/);
  });

  it("keeps the store gate out of the authenticated path", () => {
    // Someone on a retired build has to be told before they try to sign
    // in, so the check cannot require a session.
    expect(readMobile("src/lib/version-gate.ts")).not.toMatch(/getSession|access_token|Authorization/);
  });
});

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSources(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
