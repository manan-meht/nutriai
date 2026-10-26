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

  if (ownsAdults && ownsGym) {
    // A fresh self/family pick is a Health choice, so it opens Health. The
    // remembered choice covers every cold start after that; with neither,
    // Health is this app's home and the coach view is one tap away.
    if (pendingProduct) return { kind: 'dashboard', dashboard: 'adults' };
    return { kind: 'dashboard', dashboard: lastChoice ?? 'adults' };
  }

  // Coach-only. Every sign-in passes through the self/family picker, so a
  // pending pick here says nothing about wanting a Health workspace —
  // honoring it would create an empty adults workspace on every coach
  // sign-in.
  if (ownsGym) return { kind: 'dashboard', dashboard: 'gym' };
  if (ownsAdults) return { kind: 'dashboard', dashboard: 'adults' };

  if (pendingProduct) return { kind: 'new-adults', self: pendingProduct === 'self' };
  return { kind: 'picker' };
}
