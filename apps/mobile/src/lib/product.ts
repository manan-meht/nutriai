import AsyncStorage from "@react-native-async-storage/async-storage";

export type Product = "adults" | "gym";

const STORAGE_KEY = "selectedProduct";

// Persists the user's product choice from the selection screen through
// login and into the dashboard, so a screen deep in the (app) group
// doesn't need it threaded through as a route param. AsyncStorage (not
// component state) so it survives a cold app restart with an existing
// session — the selection screen otherwise only ever runs once per login.
export async function getSelectedProduct(): Promise<Product | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return value === "adults" || value === "gym" ? value : null;
}

export async function setSelectedProduct(product: Product): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, product);
}

export async function clearSelectedProduct(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Derives which product an already-authenticated session belongs to from
 * the account's actual (scoped) email — see scopedEmail() in
 * src/lib/auth.ts, which tags adults/family accounts with
 * "+nutriai-adults" and leaves gym accounts untouched. This is the source
 * of truth for the dashboard screen (not the AsyncStorage selection from
 * select-product.tsx, which only exists to pick the right scoping *before*
 * a session exists) — it works correctly for an existing session on a
 * cold app start, not just a fresh login.
 */
export function detectProductFromEmail(email: string | null | undefined): Product {
  return email?.includes("+nutriai-adults@") ? "adults" : "gym";
}
