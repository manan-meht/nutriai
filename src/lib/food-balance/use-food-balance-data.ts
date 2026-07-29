"use client";

import { useEffect, useState } from "react";
import type { FoodBalanceScoreResult, MacroTargets } from "@nutriai/health-scoring";
import type { EarnedShareCard } from "@/lib/share-cards/types";

export type FoodBalanceDataState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; result: FoodBalanceScoreResult | null; cards: EarnedShareCard[]; activeMacroTargets: MacroTargets | null };

interface RoutePayload {
  earnedShareCards?: EarnedShareCard[];
  activeMacroTargets?: MacroTargets;
  status?: FoodBalanceScoreResult["status"];
}

/** Single fetch of the per-contact/client route, shared by
 * FoodBalanceScoreCard, ShareCardsDashboardSection, AND ProfileDashboard's
 * own activeMacroTargets lookup — all three used to independently fetch
 * this exact same route, so the score's several sequential DB queries +
 * scoring math (and a snapshot INSERT) ran three times per page view. The
 * two card sections also rendered nothing at all while loading, popping
 * into the page abruptly once their (duplicated) fetch resolved — a
 * visible layout shift below the macro chart, which needs no fetch of its
 * own and so was already on screen. This hook fixes both problems: one
 * fetch, and callers can render a properly-sized skeleton for the
 * "loading" state instead of nothing. */
export function useFoodBalanceData(
  path: string,
  /** Bump to force a re-fetch without the path itself changing — e.g.
   * after saving edited nutrition goals, which can change activeMacroTargets
   * without changing which contact/client this is. */
  refreshKey: number = 0
): FoodBalanceDataState {
  const [state, setState] = useState<FoodBalanceDataState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    // Deliberately doesn't reset to {status:"loading"} synchronously here
    // on a path/refreshKey change — the initial useState value already
    // covers the true first-mount loading skeleton, and staying on the
    // previous ready/error state until the new fetch resolves (rather than
    // flashing back to a skeleton) is smoother for the refreshKey-triggered
    // refetch this hook exists for (saving edited nutrition goals).
    fetch(path)
      .then((res) => {
        if (res.status === 404) return { earnedShareCards: [] }; // feature flag off — render nothing
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data: RoutePayload) => {
        if (cancelled) return;
        const { earnedShareCards, activeMacroTargets, ...rest } = data;
        const result = "status" in rest ? (rest as FoodBalanceScoreResult) : null;
        setState({ status: "ready", result, cards: earnedShareCards ?? [], activeMacroTargets: activeMacroTargets ?? null });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [path, refreshKey]);

  return state;
}
