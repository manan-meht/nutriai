"use client";

import { forwardRef } from "react";
import type { MealShareData } from "@/lib/meal-share/types";

const FRAME_WIDTH = 1080;
const FRAME_HEIGHT = 1920;

/** CSS filter for the optional "Food/Bright" enhancement toggle (see
 * MealShareModal) — boosts saturation/warmth/brightness so the food pops,
 * applied only to the <img>, never baked into the exported file until the
 * user has it toggled on at capture time. */
export const FOOD_ENHANCE_FILTER = "saturate(1.35) brightness(1.08) contrast(1.05) sepia(0.06)";

/** Full-bleed rendering of a user's own meal photo with macros stylized
 * directly over it — elegant serif numerals in the photo's own negative
 * space (top/bottom), a soft vignette purely for legibility (not a heavy
 * scrim), and a small subtle wordmark, rather than inset into a separate
 * branded frame. Deliberately shows exact macro values — see
 * meal-share/types.ts's header comment on why this differs from
 * share-cards' "hide exact metrics by default" rule. */
export const MealSharePreview = forwardRef<HTMLDivElement, { meal: MealShareData; enhanced?: boolean; captionText?: string | null }>(
  function MealSharePreview({ meal, enhanced = true, captionText }, ref) {
    return (
      <div
        ref={ref}
        style={{ width: FRAME_WIDTH / 2, height: FRAME_HEIGHT / 2 }}
        className="relative overflow-hidden select-none bg-black"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- captured via html-to-image, external Supabase Storage URL */}
        <img
          src={meal.imageUrl}
          alt={meal.mealType}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: enhanced ? FOOD_ENHANCE_FILTER : undefined }}
          crossOrigin="anonymous"
        />

        {/* Soft vignette for legibility only — the photo itself stays the
            hero, not darkened wholesale like a typical scrim overlay.
            Taller at the top when a caption is present, since that's now
            a two-line italic accent plus the Protein/Calories row. */}
        <div className={`absolute inset-x-0 top-0 bg-gradient-to-b from-black/35 to-transparent ${captionText ? "h-[30%]" : "h-[22%]"}`} />
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-t from-black/35 to-transparent" />

        {/* Caption overlay — kept short (see meal-share/overlay-text.ts),
            an italic display accent sitting above the macro stats rather
            than a boxed sticker, so it reads as editorial type layered on
            the photo. line-clamp-2 + a max-width prevent overflow rather
            than trusting caption length alone. */}
        {captionText && (
          <div className="absolute inset-x-0 top-5 flex justify-center px-8 pointer-events-none">
            <p
              className="text-center italic font-serif text-white leading-tight max-w-[90%]"
              style={{
                fontSize: "1.75rem",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                textShadow: "0 3px 14px rgba(0,0,0,0.6)",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {captionText}
            </p>
          </div>
        )}

        <div className={`absolute inset-x-0 flex justify-around px-8 ${captionText ? "top-28" : "top-6"}`}>
          <MacroStat value={meal.proteinG} unit="g" label="Protein" />
          <MacroStat value={meal.caloriesKcal} unit="" label="Calories" />
        </div>

        <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3">
          <div className="flex justify-around w-full px-8">
            <MacroStat value={meal.carbsG} unit="g" label="Carbs" />
            <MacroStat value={meal.fatG} unit="g" label="Fat" />
          </div>
          <p className="text-[11px] font-medium tracking-[0.25em] text-white/90" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
            TISTRA HEALTH
          </p>
        </div>
      </div>
    );
  }
);

function MacroStat({ value, unit, label }: { value: number; unit: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-serif text-4xl text-white leading-none"
        style={{ textShadow: "0 2px 10px rgba(0,0,0,0.45)" }}
      >
        {value}
        <span className="text-2xl">{unit}</span>
      </span>
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/90 mt-1"
        style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
      >
        {label}
      </span>
    </div>
  );
}
