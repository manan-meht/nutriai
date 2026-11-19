// When the Android launcher icon may switch. Dependency-free so the rules can
// be tested from the root jest runner (see __tests__/app-icon-switch-rules).
//
// Why the rules exist: switching the icon means enabling one
// <activity-alias> and disabling the one the app was opened through. Android
// then finishes every activity in the task that alias opened. DONT_KILL_APP
// keeps the process alive, but not the screen. A switch made while the app is
// open therefore closes it in front of the person: the "app keeps closing and
// reopening" report of 2026-11-19. The same happens to a share sheet, the
// photo picker, Google Play billing or a sign-in browser tab that the app
// opened inside its own task.

/** Leaving within this long of a touch is treated as the app opening another
 * screen itself (share sheet, picker, billing, sign-in), not the person
 * leaving. The switch then waits for a later exit. */
export const RECENT_TOUCH_MS = 20_000;

/** At most one switch in this window, so the icon can never flip back and
 * forth, e.g. when switching between accounts. */
export const MIN_MS_BETWEEN_SWITCHES = 6 * 60 * 60 * 1000;

export type IconSwitchState = {
  /** The icon the last check chose, or null when it already shows. */
  pendingIcon: string | null;
  /** AppState.currentState at the moment of asking. */
  appState: string;
  now: number;
  /** Last touch anywhere in the app, ms since epoch (0 = never). */
  lastTouchAt: number;
  /** Last switch, ms since epoch (0 = never). null = not loaded yet. */
  lastSwitchAt: number | null;
};

export function shouldSwitchIconNow(s: IconSwitchState): boolean {
  if (!s.pendingIcon) return false;
  // Only ever on the way out. 'active' is the open app. 'unknown' can be
  // reported briefly while the app is starting.
  if (s.appState !== 'background') return false;
  if (s.now - s.lastTouchAt < RECENT_TOUCH_MS) return false;
  if (s.lastSwitchAt === null) return false;
  if (s.now - s.lastSwitchAt < MIN_MS_BETWEEN_SWITCHES) return false;
  return true;
}
