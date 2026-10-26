import * as SecureStore from 'expo-secure-store';

// Persists which dashboard (adults/gym) an account with BOTH workspaces
// last opened, so a cold start goes straight back there (see
// lib/dashboard-route.ts) — lib/product-intent.ts's pendingProduct only
// survives the single login->dashboard transition, not app restarts.
// Written only by the dashboard switch (hooks/use-dashboard-switch.ts).
//
// Only ever relevant to a coach who also uses Health: the coach view is
// shown only to an account that already owns a gym workspace.
const LAST_DASHBOARD_KEY = 'tistra_last_dashboard_choice';

export type DashboardChoice = 'adults' | 'gym';

export async function saveLastDashboardChoice(choice: DashboardChoice): Promise<void> {
  await SecureStore.setItemAsync(LAST_DASHBOARD_KEY, choice);
}

export async function getLastDashboardChoice(): Promise<DashboardChoice | null> {
  const value = await SecureStore.getItemAsync(LAST_DASHBOARD_KEY);
  return value === 'adults' || value === 'gym' ? value : null;
}

/** Called alongside supabase.auth.signOut() everywhere it's used — a
 * different account signing into the same device afterward shouldn't
 * inherit the previous account's dashboard preference. */
export async function clearLastDashboardChoice(): Promise<void> {
  await SecureStore.deleteItemAsync(LAST_DASHBOARD_KEY);
}
