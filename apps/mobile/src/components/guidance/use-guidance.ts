import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';
import type {
  ClarificationKey,
  FactAnswer,
  GuidanceResponse,
  GuidanceSubject,
  HabitKey,
  HabitVariant,
  MealSlot,
  MicroKey,
} from '@/lib/guidance-types';

// Guidance's data and actions for one person. The phone's counterpart of
// the web's bound server actions (lib/guidance/bound-actions.ts) and
// use-guidance-action.ts: each action is a POST to .../guidance/<op>, and a
// success refetches the GET so every card agrees, the way router.refresh()
// does on the web.

export type GuidanceResult = { ok: boolean; message?: string; kind?: string };

export interface GuidanceActions {
  planMeal: (optionId: string) => Promise<GuidanceResult>;
  turnOff: () => Promise<GuidanceResult>;
  cancelPlan: (planId: string) => Promise<GuidanceResult>;
  confirmPlannedMeal: (planId: string) => Promise<GuidanceResult>;
  setMealSkipped: (input: { date: string; slot: MealSlot; skipped: boolean }) => Promise<GuidanceResult>;
  chooseHabit: (input: { key: HabitKey; variant: HabitVariant } | { when: 'next_week' }) => Promise<GuidanceResult>;
  answerClarification: (
    input: { key: Exclude<ClarificationKey, 'product_brand'>; answer: FactAnswer } | { key: 'product_brand'; itemName: string; brand: string }
  ) => Promise<GuidanceResult>;
  addSupplement: (input: {
    name: string;
    brand: string;
    nutrients: Array<{ key: MicroKey; amount: number; unit: string }>;
  }) => Promise<GuidanceResult>;
  setSupplementTaken: (input: { scheduleId: string; taken: boolean }) => Promise<GuidanceResult>;
  stopSupplement: (scheduleId: string) => Promise<GuidanceResult>;
}

export function guidanceActionsFor(subject: GuidanceSubject): GuidanceActions {
  const post = (op: Parameters<typeof api.guidanceAction>[1], body: Record<string, unknown> = {}) =>
    api.guidanceAction(subject, op, body) as Promise<GuidanceResult>;
  return {
    planMeal: (optionId) => post('plan', { optionId }),
    turnOff: () => post('off'),
    cancelPlan: (planId) => post('cancel-plan', { planId }),
    confirmPlannedMeal: (planId) => post('confirm-plan', { planId }),
    setMealSkipped: (input) => post('skip', input),
    chooseHabit: (input) => post('habit', input),
    answerClarification: (input) => post('clarify', input),
    addSupplement: (input) => post('supplement-add', input),
    setSupplementTaken: (input) => post('supplement-taken', input),
    stopSupplement: (scheduleId) => post('supplement-stop', { scheduleId }),
  };
}

/** Refetches the Guidance state after an action, for whichever screen
 * holds it. The default does nothing (a read-only or preview render). */
const GuidanceRefreshContext = createContext<() => void>(() => {});
export const GuidanceRefreshProvider = GuidanceRefreshContext.Provider;

export const GENERIC_ERROR = "That didn't work. Please try again.";

/** Runs a Guidance action, shows its message on failure, and refetches on
 * success. An "invalid" answer refetches too: it usually means what's on
 * screen has changed since it loaded. */
export function useGuidanceAction() {
  const refresh = useContext(GuidanceRefreshContext);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    (action: () => Promise<GuidanceResult>, onDone?: () => void) => {
      setError(null);
      setPending(true);
      action()
        .then((result) => {
          if (!result.ok) {
            if (mounted.current) setError(result.message || GENERIC_ERROR);
            if (result.kind === 'invalid') refresh();
            return;
          }
          onDone?.();
          refresh();
        })
        .catch(() => {
          if (mounted.current) setError(GENERIC_ERROR);
        })
        .finally(() => {
          if (mounted.current) setPending(false);
        });
    },
    [refresh]
  );

  return { run, pending, error };
}

/**
 * The Guidance state for one person, starting from `initial` when the
 * screen already loaded it alongside everything else (so the page never
 * shows tracking first and then swaps). With `initial` undefined it loads
 * on mount.
 *
 * `data`: undefined while the first load is under way, null when there's
 * nothing Guidance-related to show (404), else the state. `failed` is set
 * when the last load got no answer; a failed refetch keeps what's on screen.
 */
export function useGuidanceData(subject: GuidanceSubject | undefined, initial?: GuidanceResponse | null) {
  const [data, setData] = useState<GuidanceResponse | null | undefined>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const kind = subject?.kind;
  const id = subject?.id;

  const refresh = useCallback(async () => {
    if (!kind || !id) return;
    const request = ++latest.current;
    setRefreshing(true);
    try {
      const next = await api.getGuidance(kind === 'gym' ? { kind: 'gym', id } : { kind: 'adults', id });
      if (request === latest.current) {
        setData(next);
        setFailed(false);
      }
    } catch {
      // Keep what's on screen; the next refresh or visit tries again.
      if (request === latest.current) setFailed(true);
    } finally {
      if (request === latest.current) setRefreshing(false);
    }
  }, [kind, id]);

  // The first load, when the screen didn't bring one. While it runs, `data`
  // stays undefined, which is the loading state; nothing is set until it
  // answers.
  const loadOnMount = initial === undefined;
  useEffect(() => {
    if (!loadOnMount || !kind || !id) return;
    let cancelled = false;
    const request = ++latest.current;
    api
      .getGuidance(kind === 'gym' ? { kind: 'gym', id } : { kind: 'adults', id })
      .then((next) => {
        if (cancelled || request !== latest.current) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled && request === latest.current) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadOnMount, kind, id]);

  return { data, refresh, refreshing, failed };
}
