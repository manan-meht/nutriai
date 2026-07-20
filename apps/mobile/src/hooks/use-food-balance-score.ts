import { useCallback, useEffect, useState } from 'react';

import { api, type FoodBalanceScoreResult } from '@/lib/api';

/** Shared by FoodBalanceScoreCard (detail page), PersonCard (list row), and
 * NutritionTargetsCard — all need the same "fetch this person's score,
 * treat any failure as 404-shaped (don't show anything) rather than a hard
 * error" behavior. `refetch` lets a caller (e.g. after saving/resetting
 * macro targets) pull the latest activeMacroTargets without a full remount. */
export function useFoodBalanceScore(query: { contactId: string } | { clientId: string }) {
  const [result, setResult] = useState<FoodBalanceScoreResult | null>(null);
  const [loading, setLoading] = useState(true);
  const key = 'contactId' in query ? query.contactId : query.clientId;

  const fetchResult = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getFoodBalanceScore(query)
      .then((data) => !cancelled && setResult(data))
      .catch(() => !cancelled && setResult(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => fetchResult(), [fetchResult]);

  return { result, loading, refetch: fetchResult };
}
