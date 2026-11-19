import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setAppIcon, getAppIcon } from 'expo-dynamic-app-icon';
import { api } from './api';
import { shouldSwitchIconNow } from './app-icon-switch-rules';

// Android-only, by request — iOS has no equivalent of "silently swap the
// launcher icon in the background"; Apple only allows a user-triggered,
// in-app icon change (UIApplication.setAlternateIconName), which is a
// different feature this app doesn't have today. The 4 icon variants are
// still registered for both platforms (see app.json's expo-dynamic-app-icon
// plugin config) since the plugin doesn't support per-platform icon sets,
// but setAppIcon() below is simply never called on iOS.

// Names must exactly match app.json's expo-dynamic-app-icon plugin config,
// AND be lowercase-only with no uppercase letters — the plugin uses these
// keys verbatim as Android mipmap resource file names, and Android's
// resource compiler rejects any file-based resource name containing
// anything outside [a-z0-9_] (an earlier camelCase version of these names,
// e.g. "bowlHalf", failed the production build with "'H' is not a valid
// file-based resource name character").
type BowlIconName = 'bowl_empty' | 'bowl_quarter' | 'bowl_half' | 'bowl_full';

/** Bands over the trailing-7-day total meal count across every person the
 * account tracks (all family members / gym clients combined — not just the
 * signed-in user's own logging). Thresholds confirmed with product: empty
 * at 0, then roughly <1/day, ~1/day, 2+/day. */
function bowlIconForWeeklyMealCount(mealCount: number): BowlIconName {
  if (mealCount <= 0) return 'bowl_empty';
  if (mealCount <= 6) return 'bowl_quarter';
  if (mealCount <= 13) return 'bowl_half';
  return 'bowl_full';
}

/** Sums last7DaysMealCount — a true rolling 7-day window ending today (see
 * computeRollingWeekMealCount in packages/nutrition-core), not the
 * Monday-reset calendar week — across every adults contact and gym client
 * the signed-in account has. Recomputed server-side on every fetch, so
 * calling this on any given day always reflects that day's own rolling
 * window; no separate "reset" logic needed here. Uses api.getMyProducts to
 * only fetch whichever of the two the account actually has — which also
 * matters because /gym/clients get-or-creates a gym workspace, so it must
 * never be called for an account that doesn't already own one. Reuses the
 * same list endpoints the family and coach screens already call — no new
 * server endpoint. */
async function totalWeeklyMealCount(): Promise<number> {
  const products = await api.getMyProducts();
  let total = 0;

  if (products.adults) {
    const { contacts } = await api.getAdultsContacts();
    total += contacts.reduce((sum, c) => sum + (c.last7DaysMealCount ?? 0), 0);
  }
  if (products.gym) {
    const { clients } = await api.getGymClients();
    total += clients.reduce((sum, c) => sum + (c.last7DaysMealCount ?? 0), 0);
  }
  return total;
}

// --- When the icon switches -------------------------------------------------
//
// A check only *chooses* the icon (chooseAppIconForWeeklyActivity, while the
// app is open). The switch itself waits until the person leaves the app
// (switchAppIconIfDue, on AppState 'background'), because switching closes
// every screen the app has open; see app-icon-switch-rules.ts.
//
// Until 2026-11-19 this module switched as soon as a foreground check found a
// new bowl. It also forced one switch call per launch to clear a duplicate
// icon left by the unpatched native module (versionCode 34 and earlier). Only
// 1.0.1 builds receive this code over the air, and those builds already run
// the native self-heal at startup (patches/expo-dynamic-app-icon+1.2.0.patch),
// so the forced call is gone.
//
// A skipped switch is not lost. The next check chooses the same bowl again,
// and the switch happens on a later exit.

const LAST_SWITCH_KEY = 'app_icon_last_switch_at';

let checking = false;
let pendingIcon: BowlIconName | null = null;
let lastTouchAt = 0;
/** Loaded from SecureStore by the first check. null until then, which blocks
 * switching. */
let lastSwitchAt: number | null = null;

/** Called by the root view on every touch. */
export function noteAppTouch(): void {
  lastTouchAt = Date.now();
}

function shownIcon(): string | null {
  try {
    return getAppIcon();
  } catch {
    return null;
  }
}

async function loadLastSwitchAt(): Promise<number> {
  try {
    return Number(await SecureStore.getItemAsync(LAST_SWITCH_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Works out which bowl the icon should show, without switching it. Call while
 * the app is open (once a session exists, and on every return to the
 * foreground). Best-effort: a failure never reaches the person using the app,
 * and the icon stays as it is until a later check succeeds. */
export async function chooseAppIconForWeeklyActivity(): Promise<void> {
  if (Platform.OS !== 'android' || checking) return;
  checking = true;
  try {
    if (lastSwitchAt === null) lastSwitchAt = await loadLastSwitchAt();
    const target = bowlIconForWeeklyMealCount(await totalWeeklyMealCount());
    pendingIcon = shownIcon() === target ? null : target;
  } catch (err) {
    console.warn('[dynamic-app-icon] failed:', err);
  } finally {
    checking = false;
  }
}

/** Call when the app goes to the background. Synchronous on purpose: it has
 * to finish while the app is on its way out, before Android pauses JS. */
export function switchAppIconIfDue(): void {
  if (Platform.OS !== 'android') return;
  const now = Date.now();
  if (
    !shouldSwitchIconNow({
      pendingIcon,
      appState: AppState.currentState,
      now,
      lastTouchAt,
      lastSwitchAt,
    })
  ) {
    return;
  }
  const target = pendingIcon as BowlIconName;
  pendingIcon = null;
  lastSwitchAt = now;
  SecureStore.setItemAsync(LAST_SWITCH_KEY, String(now)).catch(() => {});
  try {
    setAppIcon(target);
  } catch (err) {
    console.warn('[dynamic-app-icon] switch failed:', err);
  }
}
