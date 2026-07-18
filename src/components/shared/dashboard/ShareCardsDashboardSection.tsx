"use client";

import { useEffect, useState } from "react";
import type { EarnedShareCard } from "@/lib/share-cards/types";
import { selectDashboardCards } from "@/lib/share-cards/selector";
import { YourWinsSection } from "./YourWinsSection";
import { AchievementsModal } from "./AchievementsModal";

/** Fetches the same per-contact/client route FoodBalanceScoreCard already
 * calls (see that component) and pulls out `earnedShareCards` — a second
 * request to an already-cheap edge route rather than plumbing the data
 * through as a prop, so this section stays a fully self-contained,
 * independently-droppable piece of the dashboard. A 404 (feature not
 * available) or any fetch failure just means "show nothing", same
 * convention as FoodBalanceScoreCard. */
export function ShareCardsDashboardSection(params: { contactId: string } | { clientId: string }) {
  const [cards, setCards] = useState<EarnedShareCard[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const id = "contactId" in params ? params.contactId : params.clientId;
  const basePath = "contactId" in params ? `/api/adults/contacts/${id}` : `/api/gym/clients/${id}`;

  useEffect(() => {
    let cancelled = false;

    fetch(basePath)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setCards(data?.earnedShareCards ?? []);
      })
      .catch(() => !cancelled && setCards([]));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDismissForever(conceptId: string) {
    setCards((prev) => (prev ? prev.filter((c) => c.concept.id !== conceptId) : prev));
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
