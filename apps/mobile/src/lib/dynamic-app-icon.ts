import { Platform } from 'react-native';
import { setAppIcon, getAppIcon } from 'expo-dynamic-app-icon';
import { api } from './api';

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
 * only fetch whichever of the two the account actually has. Reuses the
 * same list endpoints the family/coach picker screens already call — no
 * new server endpoint. */
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

let checking = false;

/** Best-effort — a failure here should never surface to the person using
 * the app; the launcher icon just doesn't update until the next successful
 * check. Safe to call repeatedly (e.g. every foreground): setAppIcon() is a
 * no-op if the target icon is already the active one under the hood, but we
 * also skip the call ourselves via getAppIcon() to avoid the brief
 * relaunch blip Android does on every activity-alias swap, even a same-icon
 * one. */
export async function updateAppIconForWeeklyActivity(): Promise<void> {
  if (Platform.OS !== 'android' || checking) return;
  checking = true;
  try {
    const mealCount = await totalWeeklyMealCount();
    const target = bowlIconForWeeklyMealCount(mealCount);
    if (getAppIcon() !== target) setAppIcon(target);
  } catch (err) {
    console.warn('[dynamic-app-icon] failed:', err);
  } finally {
    checking = false;
  }
}
