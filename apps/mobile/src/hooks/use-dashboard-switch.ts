import { useEffect, useState } from 'react';
import { router } from 'expo-router';

import { api } from '@/lib/api';
import { saveLastDashboardChoice, type DashboardChoice } from '@/lib/product-choice';

/** The other dashboard this account can switch to from `current` — or null
 * when it owns only one workspace, which is every Health-only account.
 * /me/products is side-effect-free, so asking never creates the other
 * workspace. A failed check just hides the switch. */
export function useDashboardSwitch(current: DashboardChoice): { target: DashboardChoice; switchTo: () => void } | null {
  const [ownsBoth, setOwnsBoth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getMyProducts()
      .then((products) => {
        if (!cancelled) setOwnsBoth(Boolean(products.adults && products.gym));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ownsBoth) return null;

  const target: DashboardChoice = current === 'gym' ? 'adults' : 'gym';
  return {
    target,
    switchTo: () => {
      // Remembered so the next cold start opens where they left off (see
      // lib/dashboard-route.ts).
      saveLastDashboardChoice(target);
      // self is explicit for the reason (app)/index.tsx gives; '0' never
      // changes an existing workspace's plan.
      router.replace(target === 'gym' ? '/gym' : { pathname: '/adults', params: { self: '0' } });
    },
  };
}
