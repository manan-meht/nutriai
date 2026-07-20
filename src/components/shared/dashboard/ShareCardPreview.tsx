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

/** Absolutely-positioned photo grid behind the text — 1 photo goes
 * full-bleed, 2 split top/bottom, 3/4 form a grid. Deliberately never
 * more than 4 (see selectSharePhotos) so the grid stays legible at this
 * card's small size. */
function PhotoCollage({ photoUrls }: { photoUrls: string[] }) {
  const gridClass =
    photoUrls.length === 1
      ? "grid-cols-1 grid-rows-1"
      : photoUrls.length === 2
      ? "grid-cols-1 grid-rows-2"
      : photoUrls.length === 3
      ? "grid-cols-2 grid-rows-2"
      : "grid-cols-2 grid-rows-2";

  return (
    <div className={`absolute inset-0 grid ${gridClass} gap-0.5`}>
      {photoUrls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- captured via html-to-image, external Supabase Storage URL
        <img
          key={url + i}
          src={url}
          alt=""
          crossOrigin="anonymous"
          className={`w-full h-full object-cover ${photoUrls.length === 3 && i === 0 ? "row-span-2" : ""}`}
        />
      ))}
    </div>
  );
}

/** Renders one earned share card as an actual DOM node so its text can be
 * captured to PNG (see useShareCardExport) or shown inline on the
 * dashboard. Uses a real collage of the user's own relevant meal photos
 * as the background when selectSharePhotos found any (see
 * triggers.ts) — falls back to the plain gradient + emoji-sparkle
 * placeholder otherwise. The point of keeping text app-rendered rather
 * than baked into an image is spelled out in share-cards/concepts.ts's
 * header comment: it lets copy be A/B tested, personalized, and
 * localized without regenerating artwork. */
export const ShareCardPreview = forwardRef<HTMLDivElement, { card: EarnedShareCard; dateLabel?: string }>(
  function ShareCardPreview({ card, dateLabel }, ref) {
    const isStory = card.format === "story_9_16";
    const hasPhotos = Boolean(card.photoUrls && card.photoUrls.length > 0);

    return (
      <div
        ref={ref}
        style={{
          width: isStory ? 270 : 300,
          height: isStory ? 480 : 300,
          background: hasPhotos ? "#000" : "linear-gradient(160deg, #EFE6FB 0%, #D9C7F7 45%, #B79CEB 100%)",
        }}
        className="relative rounded-3xl overflow-hidden flex flex-col justify-between p-6 select-none"
      >
        {hasPhotos && <PhotoCollage photoUrls={card.photoUrls!} />}
        {hasPhotos && (
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/60" />
        )}

        {!hasPhotos && (
          <>
            <div className="absolute -top-6 -right-6 text-6xl opacity-30">✦</div>
            <div className="absolute bottom-10 -left-4 text-4xl opacity-20">✧</div>
            <div className="absolute top-1/3 left-2 text-2xl opacity-20">✦</div>
          </>
        )}

        <div className="relative">
          <span
            className={`inline-block text-[11px] font-semibold uppercase tracking-wide rounded-full px-3 py-1 ${
              hasPhotos ? "text-white bg-white/20 backdrop-blur-sm" : "text-white bg-[#6750A4]"
            }`}
          >
            {CATEGORY_LABEL[card.concept.category]}
          </span>
        </div>

        <div className="relative flex-1 flex flex-col justify-center text-center px-2">
          <p className={`text-2xl font-extrabold leading-tight text-balance ${hasPhotos ? "text-white" : "text-[#3B2A63]"}`}>
            {card.headline}
          </p>
          {card.stat && (
            <p className={`text-xs font-semibold mt-3 uppercase tracking-wide ${hasPhotos ? "text-white" : "text-[#6750A4]"}`}>
              {card.stat}
            </p>
          )}
        </div>

        <div className="relative flex items-center justify-between">
          <span className={`text-xs font-bold ${hasPhotos ? "text-white" : "text-[#3B2A63]"}`}>Tistra Health</span>
          {dateLabel && <span className={`text-[10px] ${hasPhotos ? "text-white/80" : "text-[#4B3A73]"}`}>{dateLabel}</span>}
        </div>
      </div>
    );
  }
);
