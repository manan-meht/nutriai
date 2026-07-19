"use client";

import { useRef, useState } from "react";
import type { MealShareData } from "@/lib/meal-share/types";
import { downloadShareCard, shareOrDownloadCard } from "@/lib/share-cards/export";
import { MealSharePreview } from "./MealSharePreview";

/** "Share this meal" — opened from MealPhotoModal. Reuses the generic
 * DOM-to-PNG export helpers from share-cards/export.ts (those aren't
 * actually share-card-specific — they just capture an HTMLElement). */
export function MealShareModal({ meal, onClose }: { meal: MealShareData; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState(true);

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
          <MealSharePreview ref={cardRef} meal={meal} enhanced={enhanced} />
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
