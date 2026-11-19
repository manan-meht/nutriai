// When the Android launcher icon may switch. Switching closes every screen the
// app has open, so these rules are what keep the app from closing on the
// person. Imported by relative path: the root jest config maps "@/" to the
// web app's src.
import {
  MIN_MS_BETWEEN_SWITCHES,
  RECENT_TOUCH_MS,
  shouldSwitchIconNow,
  type IconSwitchState,
} from "../lib/app-icon-switch-rules";

const NOW = 1_800_000_000_000;

const state = (over: Partial<IconSwitchState> = {}): IconSwitchState => ({
  pendingIcon: "bowl_half",
  appState: "background",
  now: NOW,
  lastTouchAt: NOW - RECENT_TOUCH_MS - 1,
  lastSwitchAt: 0,
  ...over,
});

describe("shouldSwitchIconNow", () => {
  it("switches on the way out when a new bowl is waiting", () => {
    expect(shouldSwitchIconNow(state())).toBe(true);
  });

  it("never switches while the app is open", () => {
    expect(shouldSwitchIconNow(state({ appState: "active" }))).toBe(false);
  });

  it("never switches while the app state is still unknown at startup", () => {
    expect(shouldSwitchIconNow(state({ appState: "unknown" }))).toBe(false);
  });

  it("does nothing when the right bowl already shows", () => {
    expect(shouldSwitchIconNow(state({ pendingIcon: null }))).toBe(false);
  });

  it("waits when the app was touched just before going to the background", () => {
    // A tap that opens a share sheet, the photo picker, Play billing or a
    // sign-in tab also sends the app to the background. Switching then would
    // close that screen too.
    expect(shouldSwitchIconNow(state({ lastTouchAt: NOW - 500 }))).toBe(false);
    expect(
      shouldSwitchIconNow(state({ lastTouchAt: NOW - RECENT_TOUCH_MS + 1 })),
    ).toBe(false);
  });

  it("switches at most once per window, so the icon cannot flip back and forth", () => {
    expect(
      shouldSwitchIconNow(state({ lastSwitchAt: NOW - MIN_MS_BETWEEN_SWITCHES + 1 })),
    ).toBe(false);
    expect(
      shouldSwitchIconNow(state({ lastSwitchAt: NOW - MIN_MS_BETWEEN_SWITCHES })),
    ).toBe(true);
  });

  it("waits until the last switch time has been loaded", () => {
    expect(shouldSwitchIconNow(state({ lastSwitchAt: null }))).toBe(false);
  });
});
