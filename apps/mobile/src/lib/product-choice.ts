import * as SecureStore from 'expo-secure-store';

// Persists which dashboard (adults/gym) an account with BOTH workspaces
// last chose, so reopening the app goes straight there instead of showing
// "Which dashboard?" (see (app)/index.tsx) every single cold start —
// lib/product-intent.ts's in-memory pendingProduct only survives the
// single login->dashboard transition, not app restarts, which is exactly
// why the picker kept reappearing. Explicitly changing dashboards (the
// "switch anytime by signing out" copy) re-triggers select-product.tsx on
// next login anyway, which overwrites this.
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
