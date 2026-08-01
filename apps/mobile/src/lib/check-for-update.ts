import { Platform } from 'react-native';
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
export function checkForUpdate(): void {
  if (Platform.OS !== 'android') return;

  const inAppUpdates = new SpInAppUpdates(__DEV__);

  inAppUpdates
    .checkNeedsUpdate()
    .then((result) => {
      if (!result.shouldUpdate) return;

      inAppUpdates.addStatusUpdateListener((status) => {
        if (status.status === AndroidInstallStatus.DOWNLOADED) {
          inAppUpdates.installUpdate();
        }
      });

      return inAppUpdates.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE });
    })
    .catch((err) => {
      // Best-effort — a Play Core hiccup (e.g. app not installed via Play
      // Store at all, common for a sideloaded/dev build) should never
      // block using the app.
      console.warn('[check-for-update] failed:', err);
    });
}
