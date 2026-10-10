import { Platform } from 'react-native';
import { getBuildNumber } from 'react-native-device-info';

import {
  evaluateVersionGate,
  parseVersionPolicy,
  type VersionGate,
  type VersionPolicy,
} from './version-policy';

// The native edge of the store-update gate: fetches the version policy and
// reads the installed build number. The decision itself lives in
// version-policy.ts, dependency-free so the root jest config can test it.
//
// This is separate from check-for-update.ts, which is Google Play's own
// In-App Update API — that handles "a newer build exists on the track you
// installed from" on Android, natively and without any config to maintain.
// What it cannot express is "this particular build is no longer supported",
// and it does not exist on iOS at all. That gap is what this fills.

const POLICY_PATH = '/app-version-policy';
const TIMEOUT_MS = 4000;

/** Reads the installed build number: versionCode on Android,
 * CFBundleVersion on iOS. Returns null rather than guessing — a null can
 * never block anyone. */
function installedBuild(): number | null {
  try {
    const parsed = Number(getBuildNumber());
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchPolicy(): Promise<VersionPolicy | null> {
  const base = process.env.EXPO_PUBLIC_MOBILE_API_URL;
  if (!base) return null;

  // Bounded, because the alternative is a request that never settles while
  // someone waits to find out whether they are allowed to use the app.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${POLICY_PATH}`, { signal: controller.signal });
    if (!response.ok) return null;
    return parseVersionPolicy(await response.json());
  } catch {
    // Offline, timed out, DNS, a 500 — none of these are evidence that
    // this build is unsupported. Null resolves to "ok" downstream.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether this build is still supported, and whether a newer one exists.
 *
 * Never throws and never blocks on uncertainty. Unauthenticated on purpose:
 * someone on an unsupported build needs to be told before they try to sign
 * in, and a gate that depends on a session is a gate that cannot explain
 * why sign-in just failed.
 */
export async function checkVersionGate(): Promise<VersionGate> {
  const policy = await fetchPolicy();
  return evaluateVersionGate({
    platform: Platform.OS,
    installedBuild: installedBuild(),
    policy,
  });
}
