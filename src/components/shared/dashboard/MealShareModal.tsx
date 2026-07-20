"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MealShareData } from "@/lib/meal-share/types";
import { downloadShareCard, shareOrDownloadCard } from "@/lib/share-cards/export";
import {
  deriveMealShareCategories,
  suggestOverlayTexts,
  shuffleOverlayTexts,
  type ShareOverlayAudience,
  type ShareOverlayTextCategory,
} from "@/lib/meal-share/overlay-text";
import { trackShareOverlayTextEvent } from "@/lib/meal-share/analytics";
import { MealSharePreview } from "./MealSharePreview";

const CATEGORY_TABS: Array<{ key: "suggested" | ShareOverlayTextCategory | "custom"; label: string }> = [
  { key: "suggested", label: "Suggested" },
  { key: "protein", label: "Protein" },
  { key: "balanced_meal", label: "Balanced" },
  { key: "fiber_veg", label: "Fiber" },
  { key: "funny", label: "Funny" },
  { key: "custom", label: "Custom" },
];

/** "Share this meal" — opened from MealPhotoModal. Reuses the generic
 * DOM-to-PNG export helpers from share-cards/export.ts (those aren't
 * actually share-card-specific — they just capture an HTMLElement). Now
 * also lets the user add a short overlay caption (see
 * @/lib/meal-share/overlay-text.ts) — punchy, Gen-Z-adjacent, optional. */
export function MealShareModal({
  meal,
  onClose,
  audience = "self",
  relationship,
}: {
  meal: MealShareData;
  onClose: () => void;
  audience?: ShareOverlayAudience;
  relationship?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof CATEGORY_TABS)[number]["key"]>("suggested");
  const [customText, setCustomText] = useState("");
  const [pickerExpanded, setPickerExpanded] = useState(false);

  const mealType = (["breakfast", "lunch", "dinner", "snack"].includes(meal.mealType) ? meal.mealType : "unknown") as
    | "breakfast"
    | "lunch"
    | "dinner"
    | "snack"
    | "unknown";
  const derivedCategories = useMemo(() => deriveMealShareCategories(meal), [meal]);

  const [suggestions, setSuggestions] = useState(() =>
    suggestOverlayTexts({ mealType, categories: derivedCategories, audience, relationship }, 8)
  );

  // The single highest-relevance suggestion is applied immediately (see
  // suggestOverlayTexts' ranking) rather than requiring the user to open
  // the picker and choose — "Show other captions" below reveals the full
  // tab/shuffle/custom picker for anyone who wants something different.
  const topSuggestion = suggestions[0] ?? null;
  const [selected, setSelected] = useState<{ id: string; text: string } | null>(
    topSuggestion ? { id: topSuggestion.id, text: topSuggestion.text } : null
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once for the auto-applied top suggestion, not on every re-render
  useEffect(() => {
    if (topSuggestion) {
      trackShareOverlayTextEvent("share_overlay_text_selected", {
        text_id: topSuggestion.id,
        category: topSuggestion.category,
        meal_type: mealType,
        audience,
      });
    }
  }, []);

  const visibleSuggestions =
    activeTab === "suggested" || activeTab === "custom"
      ? suggestions
      : suggestOverlayTexts({ mealType, categories: [activeTab], audience, relationship }, 8);

  function handleShuffle() {
    const categories = activeTab === "suggested" || activeTab === "custom" ? derivedCategories : [activeTab];
    const next = shuffleOverlayTexts({ mealType, categories, audience, relationship }, 8);
    setSuggestions(next);
    trackShareOverlayTextEvent("share_overlay_text_shuffled", { meal_type: mealType, audience });
  }

  function handleSelect(suggestion: { id: string; text: string; category: ShareOverlayTextCategory }) {
    setSelected({ id: suggestion.id, text: suggestion.text });
    trackShareOverlayTextEvent("share_overlay_text_selected", {
      text_id: suggestion.id,
      category: suggestion.category,
      meal_type: mealType,
      audience,
    });
  }

  function handleRemove() {
    setSelected(null);
    setCustomText("");
    trackShareOverlayTextEvent("share_overlay_text_removed", { meal_type: mealType, audience });
  }

  function handleCustomTextChange(value: string) {
    setCustomText(value);
    setSelected(value.trim() ? { id: "custom", text: value.trim() } : null);
  }

  function handleCustomTextBlur() {
    if (customText.trim()) trackShareOverlayTextEvent("share_overlay_text_edited", { meal_type: mealType, audience });
  }

  async function handleDownload() {
    if (!cardRef.current) return;
    setBusy("download");
    setError(null);
    try {
      await downloadShareCard(cardRef.current, `tistra-health-${meal.mealType}-${meal.loggedAt.slice(0, 10)}.png`);
    } catch {
      setError("Couldn't save the image. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!cardRef.current) return;
    setBusy("share");
    setError(null);
    try {
      await shareOrDownloadCard(cardRef.current, {
        filename: `tistra-health-${meal.mealType}-${meal.loggedAt.slice(0, 10)}.png`,
        title: "Tistra Health",
        text: meal.summary,
      });
    } catch {
      setError("Couldn't share the image. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-4">
          <MealSharePreview ref={cardRef} meal={meal} enhanced={enhanced} captionText={selected?.text ?? null} />
        </div>

        <label className="flex items-center justify-center gap-2 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enhanced}
            onChange={(e) => setEnhanced(e.target.checked)}
            className="accent-[#6750A4]"
          />
          <span className="text-xs font-medium text-gray-600">Enhance photo (brighter, more vivid)</span>
        </label>

        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Caption</p>

          {!pickerExpanded ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-700 truncate">{selected?.text ?? "No caption"}</p>
              <button
                type="button"
                onClick={() => setPickerExpanded(true)}
                className="shrink-0 text-xs font-medium text-[#6750A4]"
              >
                Show other captions
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2">
                {CATEGORY_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${
                      activeTab === tab.key ? "bg-[#6750A4] text-white border-[#6750A4]" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "custom" ? (
                <textarea
                  value={customText}
                  onChange={(e) => handleCustomTextChange(e.target.value)}
                  onBlur={handleCustomTextBlur}
                  maxLength={60}
                  rows={2}
                  placeholder="Write your own short caption…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {visibleSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => handleSelect(suggestion)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium border text-left ${
                        selected?.id === suggestion.id ? "bg-[#EDE9F7] border-[#6750A4] text-[#6750A4]" : "border-gray-200 text-gray-700"
                      }`}
                    >
                      {suggestion.text}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 mt-2">
                {activeTab !== "custom" && (
                  <button type="button" onClick={handleShuffle} className="text-xs font-medium text-[#6750A4]">
                    Shuffle
                  </button>
                )}
                {selected && (
                  <button type="button" onClick={handleRemove} className="text-xs font-medium text-gray-400">
                    Remove text
                  </button>
                )}
                <button type="button" onClick={() => setPickerExpanded(false)} className="text-xs font-medium text-gray-400 ml-auto">
                  Done
                </button>
              </div>
            </>
          )}
        </div>

        {error && <p className="text-xs text-red-600 text-center mb-2">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDownload}
            disabled={busy !== null}
            className="rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "download" ? "Saving…" : "Download"}
          </button>
          <button
            onClick={handleShare}
            disabled={busy !== null}
            className="rounded-lg bg-[#6750A4] text-white py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy === "share" ? "Sharing…" : "Share"}
          </button>
        </div>
        <button onClick={onClose} className="w-full text-center text-xs text-gray-400 mt-3 hover:text-gray-600">
          Close
        </button>
      </div>
    </div>
  );
}
