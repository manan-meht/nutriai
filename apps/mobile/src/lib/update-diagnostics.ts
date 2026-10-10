import * as Updates from 'expo-updates';

// Which JS bundle is actually running, as a short suffix for the free-text
// `client` field on a feedback submission (capped at 200 characters by
// apps/mobile-api me/feedback).
//
// Why this is worth having: once OTA updates are live, "1.0.0 (7)" stops
// identifying the code someone is running. Two people on the same store
// build can be on different update bundles, and a bug report that does not
// say which one cannot be reproduced. The update id is the only thing that
// separates them.
//
// This deliberately returns only the update half. The version/build half is
// assembled by the caller from Constants.platform, which reads the embedded
// native values — see the comment in feedback-modal.tsx for why
// Constants.expoConfig is wrong for that, and note that the reason is this
// very feature: an OTA update replaces the manifest, so expoConfig can
// report a build the user is not running.
//
// Contains no personal or health data: channel, runtime version and the
// update's UUID. An update id identifies a bundle we published, not a
// person — everyone on that bundle reports the same value.

/** Shortened because the field is capped at 200 characters and a full UUID
 * spends 36 of them. Eight hex characters identify an update unambiguously
 * within a channel's history. */
function shortUpdateId(id: string | null): string {
  if (!id) return 'embedded';
  return id.replace(/-/g, '').slice(0, 8);
}

export function describeRunningUpdate(): string {
  try {
    // All null in Expo Go and in development builds, which is itself worth
    // seeing in a report: it says the person was not on a release build and
    // so was never receiving updates at all.
    const channel = Updates.channel ?? 'dev';
    const runtime = Updates.runtimeVersion ?? 'dev';
    return `ch=${channel} rt=${runtime.slice(0, 12)} upd=${shortUpdateId(Updates.updateId)}`;
  } catch {
    // A feedback submission must not fail because the diagnostics line
    // could not be assembled.
    return 'upd=unknown';
  }
}
