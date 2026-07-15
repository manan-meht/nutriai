// In-memory (not persisted) hand-off from select-product.tsx to
// (app)/index.tsx — carries which illustrated card the user picked
// pre-login so that, once authenticated, ProductRouterScreen can route
// straight there instead of always falling back to its own "Which
// dashboard?" picker for accounts that happen to have both adults and gym
// workspaces (a scoped-email account can only ever match one product per
// login — see lib/auth.ts#scopedEmail — but /me/products still checks both
// products against the same auth user id, so an account seeded with both
// would otherwise ignore the choice the user just made and ask again).
// Deliberately module-level state, not persisted storage — this is only
// meant to survive the single login→dashboard transition, not app
// restarts; a returning already-authenticated user correctly sees the
// picker again if their account genuinely has both.
let pendingSelection: 'self' | 'family' | 'coach' | null = null;

export function setPendingProductSelection(product: 'self' | 'family' | 'coach') {
  pendingSelection = product;
}

/** Reads and clears in one step — only the very next screen that checks
 * after a fresh login should act on it. */
export function consumePendingProductSelection(): 'self' | 'family' | 'coach' | null {
  const value = pendingSelection;
  pendingSelection = null;
  return value;
}
