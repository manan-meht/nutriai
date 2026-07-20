"use client";

import { useRef, useState } from "react";
import type { EarnedShareCard } from "@/lib/share-cards/types";
import type { ShareCardAnalyticsProperties } from "@/lib/share-cards/analytics";
import { trackShareCardEvent } from "@/lib/share-cards/analytics";
import { shareOrDownloadCard } from "@/lib/share-cards/export";
import { ShareCardPreview } from "./ShareCardPreview";

type SourceSurface = ShareCardAnalyticsProperties["source_surface"];

/** Dashboard "Your wins" section (see this feature's spec) — shows only
 * already-earned cards (selectDashboardCards has already capped this at
 * 3 and prioritized by category before this component ever sees them),
 * 1 featured + up to 2 smaller. Deliberately does no data-fetching or
 * trigger evaluation itself — callers compute `cards` server-side/via
 * their own hook so this component works the same for adults/gym/self. */
export function YourWinsSection({
  cards,
  onViewAll,
  onDismissForever,
  sourceSurface = "dashboard",
}: {
  cards: EarnedShareCard[];
  onViewAll?: () => void;
  /** Persists "don't show this one again" — see ShareCardsDashboardSection,
   * which wires this to the `?resource=share-card-dismiss` PATCH. */
  onDismissForever?: (conceptId: string) => void;
  sourceSurface?: SourceSurface;
}) {
  const [openCard, setOpenCard] = useState<EarnedShareCard | null>(null);

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Your wins</h3>
        <p className="text-sm text-gray-500">
          Keep logging meals and Tistra will turn your progress into shareable wins.
        </p>
      </div>
    );
  }

  const [featured, ...rest] = cards;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Your wins</h3>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs font-medium text-[#6750A4] hover:underline"
          >
            View all achievements
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        <MiniCard card={featured} featured onOpen={setOpenCard} sourceSurface={sourceSurface} />
        {rest.map((c) => (
          <MiniCard key={c.concept.id} card={c} onOpen={setOpenCard} sourceSurface={sourceSurface} />
        ))}
      </div>

      {openCard && (
        <ShareCardModal
          card={openCard}
          onClose={() => setOpenCard(null)}
          onDismissForever={onDismissForever}
          sourceSurface={sourceSurface}
        />
      )}
    </div>
  );
}

function MiniCard({
  card,
  featured,
  onOpen,
  sourceSurface,
}: {
  card: EarnedShareCard;
  featured?: boolean;
  onOpen: (c: EarnedShareCard) => void;
  sourceSurface: SourceSurface;
}) {
  return (
    <button
      onClick={() => {
        trackShareCardEvent("share_card_viewed", {
          card_id: card.concept.id,
          category: card.concept.category,
          format: card.format,
          source_surface: sourceSurface,
        });
        onOpen(card);
      }}
      className={`shrink-0 text-left rounded-2xl border border-gray-100 p-3 bg-gradient-to-br from-[#EFE6FB] to-[#D9C7F7] hover:shadow-sm transition-shadow ${
        featured ? "w-48" : "w-32"
      }`}
    >
      <p className={`font-semibold text-[#3B2A63] ${featured ? "text-sm" : "text-xs"}`}>{card.headline}</p>
      {card.stat && <p className="text-[10px] font-semibold text-[#6750A4] mt-2 uppercase tracking-wide">{card.stat}</p>}
    </button>
  );
}

/** Exported so AchievementsModal (the "View all achievements" surface) can
 * reuse the exact same single-card share/download/dismiss view. */
export function ShareCardModal({
  card,
  onClose,
  onDismissForever,
  sourceSurface = "dashboard",
}: {
  card: EarnedShareCard;
  onClose: () => void;
  onDismissForever?: (conceptId: string) => void;
  sourceSurface?: SourceSurface;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);

  async function handleDownload() {
    if (!cardRef.current) return;
    setBusy("download");
    try {
      const { downloadShareCard } = await import("@/lib/share-cards/export");
      await downloadShareCard(cardRef.current, `tistra-health-${card.concept.id}.png`);
      trackShareCardEvent("share_card_downloaded", {
        card_id: card.concept.id,
        category: card.concept.category,
        format: card.format,
        source_surface: sourceSurface,
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!cardRef.current) return;
    setBusy("share");
    try {
      const result = await shareOrDownloadCard(cardRef.current, {
        filename: `tistra-health-${card.concept.id}.png`,
        title: "Tistra Health",
        text: card.headline,
      });
      if (result !== "cancelled") {
        trackShareCardEvent(result === "shared" ? "share_card_shared" : "share_card_downloaded", {
          card_id: card.concept.id,
          category: card.concept.category,
          format: card.format,
          source_surface: sourceSurface,
        });
      }
    } finally {
      setBusy(null);
    }
  }

  function trackDismissed() {
    trackShareCardEvent("share_card_dismissed", {
      card_id: card.concept.id,
      category: card.concept.category,
      format: card.format,
      source_surface: sourceSurface,
    });
  }

  function handleNotNow() {
    trackDismissed();
    onClose();
  }

  function handleDismissForever() {
    trackDismissed();
    onDismissForever?.(card.concept.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={handleNotNow}>
      <div className="bg-white rounded-3xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-4">
          <ShareCardPreview ref={cardRef} card={card} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDownload}
            disabled={busy !== null}
            className="rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "download" ? "Saving…" : "Download card"}
          </button>
          <button
            onClick={handleShare}
            disabled={busy !== null}
            className="rounded-lg bg-[#6750A4] text-white py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy === "share" ? "Sharing…" : card.concept.shareCta}
          </button>
        </div>
        <div className="flex items-center justify-center gap-4 mt-3">
          <button onClick={handleNotNow} className="text-xs text-gray-400 hover:text-gray-600">
            Not now
          </button>
          {onDismissForever && (
            <button onClick={handleDismissForever} className="text-xs text-gray-400 hover:text-gray-600">
              Don&apos;t show this one again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
