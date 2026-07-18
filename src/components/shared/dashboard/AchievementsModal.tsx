"use client";

import { useState } from "react";
import type { EarnedShareCard } from "@/lib/share-cards/types";
import { ShareCardModal } from "./YourWinsSection";

/** "Achievements page or modal" (see this feature's spec) — a grid of
 * every earned card (not capped at 3 like the dashboard's "Your wins"
 * row), so a user can revisit and share any past win. This codebase has
 * no dedicated-page pattern for this kind of secondary view (see
 * EditContactModal/AddContactModal/FeedbackModal) — a modal matches the
 * existing convention rather than a new route. */
export function AchievementsModal({
  cards,
  onClose,
  onDismissForever,
}: {
  cards: EarnedShareCard[];
  onClose: () => void;
  onDismissForever?: (conceptId: string) => void;
}) {
  const [openCard, setOpenCard] = useState<EarnedShareCard | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Your achievements</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            Close
          </button>
        </div>

        {cards.length === 0 ? (
          <p className="text-sm text-gray-500">
            Keep logging meals and Tistra will turn your progress into shareable wins.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card) => (
              <button
                key={card.concept.id}
                onClick={() => setOpenCard(card)}
                className="text-left rounded-2xl border border-gray-100 p-3 bg-gradient-to-br from-[#EFE6FB] to-[#D9C7F7] hover:shadow-sm transition-shadow"
              >
                <p className="text-xs font-semibold text-[#3B2A63]">{card.headline}</p>
                {card.stat && (
                  <p className="text-[10px] font-semibold text-[#6750A4] mt-2 uppercase tracking-wide">{card.stat}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {openCard && (
        <ShareCardModal
          card={openCard}
          onClose={() => setOpenCard(null)}
          onDismissForever={onDismissForever}
          sourceSurface="achievements_page"
        />
      )}
    </div>
  );
}
