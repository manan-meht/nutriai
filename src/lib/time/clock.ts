// Controllable clock so trial start/expiry logic can be tested without
// waiting real time, and so trial state can be manually exercised in dev
// (see the __setClockOverrideForTests / TISTRA_CLOCK_OVERRIDE_ISO paths
// below). All application code that needs "now" for entitlement/trial
// logic must go through this — never call `new Date()` directly for
// trial timestamps, or tests/dev overrides won't take effect.
let overrideNow: Date | null = null;

export function now(): Date {
  if (overrideNow) return overrideNow;

  // Dev/staging-only manual override for exercising trial expiry locally
  // (see the manual testing steps in the completion report). Never honored
  // in production, so this cannot be used to manipulate real trial state.
  if (process.env.NODE_ENV !== "production" && process.env.TISTRA_CLOCK_OVERRIDE_ISO) {
    const parsed = new Date(process.env.TISTRA_CLOCK_OVERRIDE_ISO);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

/** Test-only. Never call this from application/production code paths. */
export function __setClockOverrideForTests(date: Date | null): void {
  overrideNow = date;
}
