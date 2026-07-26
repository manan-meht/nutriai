import * as SecureStore from 'expo-secure-store';

// Hand-off from select-product.tsx/login.tsx/signup.tsx to (app)/index.tsx —
// carries which illustrated card the user picked pre-login so that, once
// authenticated, ProductRouterScreen can route straight there instead of
// falling back to its own picker. Needed both for an account with BOTH
// adults and gym workspaces (a scoped-email account can only ever match one
// product per login — see lib/auth.ts#scopedEmail — but /me/products still
// checks both products against the same auth user id) AND for a brand-new
// account with NEITHER workspace yet (the picker would otherwise ask again
// right after signup).
//
// SecureStore-backed (not module-level in-memory state) specifically
// because the OAuth path hands control to an external system browser
// (WebBrowser.openAuthSessionAsync in lib/oauth.ts) for the entire
// Google/Facebook flow — if the OS reclaims/suspends the app's JS context
// during that round-trip, an in-memory variable resets to null before
// ProductRouterScreen ever gets to read it, which is exactly what caused
// "picked Family, signed in with Google, got sent back to the picker."
// Persisting durably survives that regardless of what happens to the JS
// process while the browser has focus.
const PENDING_PRODUCT_KEY = 'tistra_pending_product_selection';

export type PendingProduct = 'self' | 'family' | 'coach';

export async function setPendingProductSelection(product: PendingProduct): Promise<void> {
  await SecureStore.setItemAsync(PENDING_PRODUCT_KEY, product);
}

/** Reads and clears in one step — only the very next screen that checks
 * after a fresh login should act on it. */
export async function consumePendingProductSelection(): Promise<PendingProduct | null> {
  const value = await SecureStore.getItemAsync(PENDING_PRODUCT_KEY);
  if (value) await SecureStore.deleteItemAsync(PENDING_PRODUCT_KEY);
  return value === 'self' || value === 'family' || value === 'coach' ? value : null;
}
