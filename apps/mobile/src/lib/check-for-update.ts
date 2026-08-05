import { AppState, Platform } from 'react-native';
import { getBuildNumber } from 'react-native-device-info';
import SpInAppUpdates, { IAUUpdateKind, AndroidInstallStatus } from 'sp-react-native-in-app-updates';

// Android-only: Google Play's own In-App Update API (via Play Core),
// checked against whichever track the app was actually installed from —
// including Closed Testing, not just Production — so uploading a new
// build there is enough for this to fire, no separate "latest version"
// config to maintain per release. This app has no iOS build yet, so the
// library's iOS (App Store lookup) path is deliberately unused here.
//
// FLEXIBLE, not IMMEDIATE: downloads in the background and lets the
// person keep using the app — "a reminder", not a hard block — then
// prompts to restart once the download finishes (installUpdate() is a
// no-op until then).
let inAppUpdates: SpInAppUpdates | null = null;
let checking = false;

// Play Core's own FLEXIBLE-update guidance is explicit about this: a
// DOWNLOADED status can arrive while the app is backgrounded (these
// downloads aren't instant), and a listener registered once at cold
// launch won't still be "live" for it in any way the person can act on —
// the app just sits there having quietly finished a download nobody gets
// prompted to install. Re-running the check on every foreground (not just
// once at startup) is what actually surfaces a completed download —
// reproduced via the exact reported symptom: tap "Update", the prompt
// disappears, and nothing else ever happens because the person backgrounds
// the app before the download finishes.
function runCheck(): void {
  if (Platform.OS !== 'android' || checking) return;
  checking = true;

  if (!inAppUpdates) inAppUpdates = new SpInAppUpdates(__DEV__);
  const updates = inAppUpdates;

  updates
    // Without curVersion, the library falls back to react-native-device-
    // info's getVersion() — the semver-style version *name* ("1.0.0",
    // never bumped; only versionCode auto-increments per build, see
    // eas.json) — and compares that against the Play Store's returned
    // versionCode ("29", "30", ...). Coerced to semver those are "1.0.0"
    // vs "29.0.0", so the comparison would nonsensically say "update
    // available" almost unconditionally. It never actually broke anything
    // (Play Core's own updateAvailability check already gates this
    // correctly upstream, so the two independently agreed by coincidence
    // — versionCode always dwarfs "1.0.0"), but it's not a real
    // comparison. getBuildNumber() is the actual installed versionCode on
    // Android, which is what the store's number should be compared
    // against.
    .checkNeedsUpdate({ curVersion: getBuildNumber() })
    .then((result) => {
      if (!result.shouldUpdate) return;

      // Play Core recognizes an update that's already downloading/
      // downloaded from a previous session and resolves accordingly
      // (it won't re-show the accept UI or re-download) — safe to call
      // on every foreground, not just the first time.
      updates.addStatusUpdateListener((status) => {
        if (status.status === AndroidInstallStatus.DOWNLOADED) {
          updates.installUpdate();
        }
      });

      return updates.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE });
    })
    .catch((err) => {
      // Best-effort — a Play Core hiccup (e.g. app not installed via Play
      // Store at all, common for a sideloaded/dev build) should never
      // block using the app.
      console.warn('[check-for-update] failed:', err);
    })
    .finally(() => {
      checking = false;
    });
}

export function checkForUpdate(): void {
  runCheck();
  if (Platform.OS !== 'android') return;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') runCheck();
  });
}
