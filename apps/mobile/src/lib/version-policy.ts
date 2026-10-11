/** Decides whether an installed build is still supported.
 *
 * Deliberately dependency-free (no React, no Expo, no react-native) so the
 * repo's root jest config can exercise it directly — the mobile package has
 * no test runner of its own. Same split as review-policy.ts and
 * push-nudge.ts; version-gate.ts is the native edge that fetches the policy
 * and reads the installed build number.
 *
 * ─── Why "latest" and "minimum" are different questions ──────────────────
 *
 * A newer build existing in the store is not a reason to stop someone using
 * the app. It is at most a reason to mention it. Conflating the two is how
 * apps end up with a dialog nobody can dismiss because a release went out
 * forty minutes ago.
 *
 * So there are two numbers per platform, and only one of them can block:
 *
 *   latestBuild           — newest in the store. Informational, always.
 *   minimumSupportedBuild — below this the build is explicitly unsupported,
 *                           e.g. it talks to an API shape that no longer
 *                           exists. This is the only thing that blocks, and
 *                           raising it is a deliberate act.
 *
 * ─── Why every uncertain case resolves to "ok" ───────────────────────────
 *
 * This gate is the one piece of client logic that can lock a paying user
 * out of an app that would otherwise work. A missing config, an unparseable
 * build number, a failed request on an aeroplane: none of those are
 * evidence that a build is unsupported, and treating them as such turns a
 * backend hiccup into an outage. Blocking requires a positive statement
 * from the server that this specific build is too old.
 */

export interface PlatformVersionPolicy {
  /** Builds strictly below this are blocked. 0 blocks nothing, which is the
   * default and the current production value — nothing is unsupported yet. */
  minimumSupportedBuild: number;
  /** Newest build in the store, or null when unknown. Never blocks. */
  latestBuild: number | null;
}

export interface VersionPolicy {
  ios: PlatformVersionPolicy;
  android: PlatformVersionPolicy;
}

export type VersionGate =
  /** Nothing to say. Includes every case where we could not tell. */
  | { status: "ok" }
  /** A newer build exists. Mention it; never block on it. */
  | { status: "update_available"; latestBuild: number }
  /** The server says this build is no longer supported. */
  | { status: "unsupported"; minimumSupportedBuild: number };

/** Blocks nothing. Used when the config request fails and as the server's
 * own default, so "no configuration" and "configuration unreachable" lead
 * to the same safe place. */
export const PERMISSIVE_POLICY: VersionPolicy = {
  ios: { minimumSupportedBuild: 0, latestBuild: null },
  android: { minimumSupportedBuild: 0, latestBuild: null },
};

export function evaluateVersionGate(params: {
  platform: "ios" | "android" | string;
  /** The installed build number — versionCode on Android, CFBundleVersion
   * on iOS. Null when it could not be read. */
  installedBuild: number | null;
  /** Null when the request failed. */
  policy: VersionPolicy | null;
}): VersionGate {
  const { platform, installedBuild, policy } = params;

  // No policy, an unknown platform (web), or an unreadable build number:
  // nothing here is evidence that the build is unsupported.
  if (policy == null) return { status: "ok" };
  if (platform !== "ios" && platform !== "android") return { status: "ok" };
  if (installedBuild == null || !Number.isFinite(installedBuild)) return { status: "ok" };

  const forPlatform = policy[platform];
  if (!forPlatform) return { status: "ok" };

  const minimum = Number(forPlatform.minimumSupportedBuild);
  if (Number.isFinite(minimum) && minimum > 0 && installedBuild < minimum) {
    return { status: "unsupported", minimumSupportedBuild: minimum };
  }

  const latest = forPlatform.latestBuild == null ? null : Number(forPlatform.latestBuild);
  if (latest != null && Number.isFinite(latest) && installedBuild < latest) {
    return { status: "update_available", latestBuild: latest };
  }

  return { status: "ok" };
}

/** Parses the config endpoint's response, resolving anything malformed to
 * the permissive policy rather than throwing — see the module note. */
export function parseVersionPolicy(raw: unknown): VersionPolicy {
  if (typeof raw !== "object" || raw === null) return PERMISSIVE_POLICY;
  const body = raw as Record<string, unknown>;
  return {
    ios: parsePlatform(body.ios),
    android: parsePlatform(body.android),
  };
}

function parsePlatform(raw: unknown): PlatformVersionPolicy {
  if (typeof raw !== "object" || raw === null) return { minimumSupportedBuild: 0, latestBuild: null };
  const p = raw as Record<string, unknown>;
  const minimum = Number(p.minimumSupportedBuild);
  const latest = Number(p.latestBuild);
  return {
    // A non-numeric minimum must not become NaN and then silently compare
    // false — it becomes 0, which blocks nobody.
    minimumSupportedBuild: Number.isFinite(minimum) && minimum > 0 ? Math.floor(minimum) : 0,
    latestBuild: Number.isFinite(latest) && latest > 0 ? Math.floor(latest) : null,
  };
}
