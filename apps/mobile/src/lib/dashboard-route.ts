// Which dashboard (app)/index.tsx opens. Kept free of React Native imports
// so the decision can be unit-tested from the root jest suite.
//
// Tistra Health is a self/family app, and its sign-up offers only those two.
// The coach view exists for one case: an account that ALREADY owns a gym
// workspace — created on the web, in Coach OS — managing its nutrition
// clients from the phone. Nothing here ever sends an account to the coach
// view without one, and nothing creates a gym workspace: /gym/workspace
// get-or-creates, so reaching it is what ownership has to be checked
// against first (see api.getMyProducts).

export type Dashboard = 'adults' | 'gym';

export type DashboardRoute =
  | { kind: 'dashboard'; dashboard: Dashboard }
  /** No workspace yet: open adults, which creates it on first load. */
  | { kind: 'new-adults'; self: boolean }
  /** No workspace and no pick to honor: ask self vs family. */
  | { kind: 'picker' };

export function chooseDashboard(input: {
  ownsAdults: boolean;
  ownsGym: boolean;
  /** Last dashboard this device opened for an account that owns both. */
  lastChoice: Dashboard | null;
  /** The self/family card tapped before this sign-in, if any. */
  pendingProduct: 'self' | 'family' | null;
}): DashboardRoute {
  const { ownsAdults, ownsGym, lastChoice, pendingProduct } = input;

  // Every sign-in passes through the self/family picker — it is the only
  // way to reach the login screen — so for an account that already owns a
  // workspace a pending pick carries no signal, and it is ignored. (For a
  // coach-only account, honoring it would create an empty adults workspace
  // on every sign-in.) Only a brand-new account below uses it.
  if (ownsAdults && ownsGym) {
    // Health is this app's home; the coach view is one tap away and is
    // remembered once chosen.
    return { kind: 'dashboard', dashboard: lastChoice ?? 'adults' };
  }
  if (ownsGym) return { kind: 'dashboard', dashboard: 'gym' };
  if (ownsAdults) return { kind: 'dashboard', dashboard: 'adults' };

  if (pendingProduct) return { kind: 'new-adults', self: pendingProduct === 'self' };
  return { kind: 'picker' };
}
