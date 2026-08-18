"use client";

import { useCallback, useRef, useState } from "react";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";

// Swipeable photo strip for a discovery card.
//
// Paging is native CSS scroll-snap rather than a carousel library: it gives
// real momentum scrolling on touch for free, keeps working if JS is slow to
// hydrate, and costs nothing in bundle size. The JS here only mirrors the
// scroll position into the indicator and drives the tap/keyboard controls.
//
// The tap targets deliberately sit ABOVE the card's profile link (z-index)
// on the left/right thirds only, so paging photos never navigates away —
// the classic complaint with story-style cards inside a link.

export function CoachPhotoPager({
  photos,
  name,
  eager,
  aspectClassName = "aspect-[4/5]",
}: {
  photos: string[];
  name: string;
  /** Cards use a tall 4:5; the profile hero is shorter so the facts below
   * it are visible without scrolling. */
  aspectClassName?: string;
  /** First card renders its first image eagerly; the rest stay lazy so a
   * feed of large photos doesn't cost a screenful of requests up front. */
  eager?: boolean;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : i));
  }, []);

  const goTo = useCallback((i: number) => {
    const el = stripRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(photos.length - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  }, [photos.length]);

  const multiple = photos.length > 1;

  return (
    <div className={`relative ${aspectClassName} w-full overflow-hidden`} style={{ backgroundColor: T.surfaceContainer }}>
      <div
        ref={stripRef}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={`Photos of ${name}`}
      >
        {photos.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs and local placeholders
          <img
            key={src}
            src={src}
            alt={i === 0 ? name : ""}
            loading={eager && i === 0 ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            className="h-full w-full flex-none snap-center object-cover"
          />
        ))}
      </div>

      {multiple && (
        <>
          {/* Segmented progress, the story-card convention: how many photos
              there are and where you are, readable at a glance over a photo. */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex gap-1.5">
            {photos.map((src, i) => (
              <span
                key={src}
                className="h-1 flex-1 rounded-full transition-opacity"
                style={{
                  backgroundColor: "#FFFFFF",
                  opacity: i === index ? 0.95 : 0.4,
                  boxShadow: "0 0 3px rgba(0,0,0,0.35)",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label={`Previous photo of ${name}`}
            className="absolute inset-y-0 left-0 z-20 w-1/3 cursor-pointer disabled:cursor-default"
          />
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === photos.length - 1}
            aria-label={`Next photo of ${name}`}
            className="absolute inset-y-0 right-0 z-20 w-1/3 cursor-pointer disabled:cursor-default"
          />
        </>
      )}
    </div>
  );
}
