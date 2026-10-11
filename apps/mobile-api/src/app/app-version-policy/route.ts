import { NextResponse } from "next/server";

export const runtime = "edge";

// GET /app-version-policy — which installed builds are still supported.
//
// Unauthenticated on purpose. Someone on an unsupported build has to be
// told before they try to sign in; a gate that needs a session is a gate
// that cannot explain why signing in just failed. Nothing here is
// user-specific, so there is nothing to protect — the response is the same
// for everyone and is cached at the edge.
//
// ─── Two numbers per platform, and only one of them blocks ───────────────
//
// minimumSupportedBuild  builds strictly below this are blocked. A
//                        deliberate act, taken when a build genuinely
//                        cannot work any more — an API shape it depends on
//                        has gone, say. 0 means "nothing is unsupported",
//                        which is the default and the current value.
//
// latestBuild            newest build in the store. Informational only.
//                        A newer build existing is not a reason to stop
//                        someone using the app.
//
// Both default to blocking nobody, so an unset variable, a typo, or a
// misconfigured environment cannot lock anyone out. The client treats a
// failed request the same way (see version-policy.ts).
//
// Raising minimumSupportedBuild is a config change plus a redeploy of this
// worker, deliberately: it is the one value here that can stop an app
// working, and it should not be adjustable without a reviewable change.

/** Parses an env var into a build number, resolving anything absent or
 * malformed to the permissive value rather than NaN. */
function buildNumber(raw: string | undefined, fallback: number | null): number | null {
  if (!raw) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export async function GET() {
  const body = {
    ios: {
      minimumSupportedBuild: buildNumber(process.env.APP_MIN_SUPPORTED_BUILD_IOS, 0) ?? 0,
      latestBuild: buildNumber(process.env.APP_LATEST_BUILD_IOS, null),
    },
    android: {
      minimumSupportedBuild: buildNumber(process.env.APP_MIN_SUPPORTED_BUILD_ANDROID, 0) ?? 0,
      latestBuild: buildNumber(process.env.APP_LATEST_BUILD_ANDROID, null),
    },
  };

  return NextResponse.json(body, {
    headers: {
      // Five minutes. Long enough that this costs nothing at any plausible
      // traffic level, short enough that raising the minimum takes effect
      // the same morning rather than needing a cache purge.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
