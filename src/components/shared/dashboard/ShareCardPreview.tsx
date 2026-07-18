"use client";

import { forwardRef } from "react";
import type { EarnedShareCard } from "@/lib/share-cards/types";

const CATEGORY_LABEL: Record<EarnedShareCard["concept"]["category"], string> = {
  daily_win: "Daily win",
  weekly_consistency: "Weekly win",
  food_balance: "Balance win",
  improvement: "Progress win",
  personality_badge: "Badge",
  comeback: "Welcome back",
};

/** Renders one earned share card as an actual DOM node so its text can be
 * captured to PNG (see useShareCardExport) or shown inline on the
 * dashboard. Deliberately a plain gradient + emoji-sparkle placeholder
 * background today, not a generated image — see concepts.ts's
 * nanoBananaPrompt fields for the eventual illustrated background brief.
 * The point of keeping text app-rendered rather than baked into an image
 * is spelled out in share-cards/concepts.ts's header comment: it lets
 * copy be A/B tested, personalized, and localized without regenerating
 * artwork. */
export const ShareCardPreview = forwardRef<HTMLDivElement, { card: EarnedShareCard; dateLabel?: string }>(
  function ShareCardPreview({ card, dateLabel }, ref) {
    const isStory = card.format === "story_9_16";

    return (
      <div
        ref={ref}
        style={{
          width: isStory ? 270 : 300,
          height: isStory ? 480 : 300,
          background: "linear-gradient(160deg, #EFE6FB 0%, #D9C7F7 45%, #B79CEB 100%)",
        }}
        className="relative rounded-3xl overflow-hidden flex flex-col justify-between p-6 select-none"
      >
        <div className="absolute -top-6 -right-6 text-6xl opacity-30">✦</div>
        <div className="absolute bottom-10 -left-4 text-4xl opacity-20">✧</div>
        <div className="absolute top-1/3 left-2 text-2xl opacity-20">✦</div>

        <div>
          <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-white bg-[#6750A4] rounded-full px-3 py-1">
            {CATEGORY_LABEL[card.concept.category]}
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center text-center px-2">
          <p className="text-2xl font-extrabold text-[#3B2A63] leading-tight text-balance">{card.headline}</p>
          <p className="text-sm text-[#4B3A73] mt-3">{card.supportingText}</p>
          {card.stat && (
            <p className="text-xs font-semibold text-[#6750A4] mt-3 uppercase tracking-wide">{card.stat}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#3B2A63]">Tistra Health</span>
          {dateLabel && <span className="text-[10px] text-[#4B3A73]">{dateLabel}</span>}
        </div>
      </div>
    );
  }
);
