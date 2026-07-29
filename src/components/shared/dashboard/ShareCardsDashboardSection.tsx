"use client";

import { useState } from "react";
import { selectDashboardCards } from "@/lib/share-cards/selector";
import type { FoodBalanceDataState } from "@/lib/food-balance/use-food-balance-data";
import { YourWinsSection } from "./YourWinsSection";
import { AchievementsModal } from "./AchievementsModal";

function WinsSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 animate-pulse" aria-hidden="true">
      <div className="h-4 w-24 bg-gray-100 rounded mb-3" />
      <div className="flex gap-3">
        <div className="w-48 h-20 bg-gray-100 rounded-2xl shrink-0" />
        <div className="w-32 h-20 bg-gray-100 rounded-2xl shrink-0" />
      </div>
    </div>
  );
}

/** Shares the same per-contact/client route fetch as FoodBalanceScoreCard
 * via useFoodBalanceData — this used to fetch that route a second time
 * independently, doubling the score's DB queries/scoring work (and a
 * snapshot INSERT) on every dashboard view. `data` still carries the
 * loading/error/ready states so this section can show its own properly-
 * sized skeleton instead of popping in once the (now-shared) fetch
 * resolves. */
export function ShareCardsDashboardSection(params: ({ contactId: string } | { clientId: string }) & { data: FoodBalanceDataState }) {
  const { data } = params;
  const basePath = "contactId" in params ? `/api/adults/contacts/${params.contactId}` : `/api/gym/clients/${params.clientId}`;
  const fetchedCards = data.status === "ready" ? data.cards : null;
  // A dismissal is the only local mutation this section ever needs — kept
  // as just the dismissed ids (not a mirrored copy of fetchedCards) so
  // there's no prop-into-state sync effect: the effective list is derived
  // directly on every render instead.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const cards = fetchedCards ? fetchedCards.filter((c) => !dismissedIds.has(c.concept.id)) : null;

  async function handleDismissForever(conceptId: string) {
    setDismissedIds((prev) => new Set(prev).add(conceptId));
    try {
      await fetch(`${basePath}?resource=share-card-dismiss`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId }),
      });
    } catch {
      // Best-effort — worst case the card reappears next load, which is
      // harmless (the user can dismiss it again).
    }
  }

  if (data.status === "loading") return <WinsSkeleton />;
  if (cards === null) return null;

  return (
    <>
      <YourWinsSection
        cards={selectDashboardCards(cards)}
        onViewAll={() => setShowAll(true)}
        onDismissForever={handleDismissForever}
      />
      {showAll && (
        <AchievementsModal cards={cards} onClose={() => setShowAll(false)} onDismissForever={handleDismissForever} />
      )}
    </>
  );
}
