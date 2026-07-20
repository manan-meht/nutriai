"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MealShareData } from "@/lib/meal-share/types";
import type { ShareOverlayAudience } from "@/lib/meal-share/overlay-text";
import { MealShareModal } from "./MealShareModal";

interface MealPhotoModalProps {
  url: string;
  label: string;
  onClose: () => void;
  /** When present, shows a "Share this meal" action that opens
   * MealShareModal — omitted by callers that don't have macro data handy
   * for this photo, in which case the modal is just a plain lightbox. */
  shareData?: MealShareData | null;
  /** Who's sharing — drives caption grammar (self/family/coach), see
   * @/lib/meal-share/overlay-text.ts. Defaults to "self" since most
   * callers are a person viewing their own dashboard. */
  audience?: ShareOverlayAudience;
  /** e.g. "mom"/"dad"/"client" — only used when audience is "family". */
  relationship?: string;
}

/** Full-screen lightbox for a meal photo — shared by the adults and gym
 * dashboards' "Recent meals" section (see ContactDashboard.tsx/
 * ClientDashboard.tsx). Tapping the small thumbnail in the list opens this
 * instead of navigating away. */
export function MealPhotoModal({ url, label, onClose, shareData, audience = "self", relationship }: MealPhotoModalProps) {
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
        aria-label="Close"
      >
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset */}
      <img
        src={url}
        alt={`${label} photo`}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[80vh] rounded-2xl object-contain"
      />
      {shareData && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSharing(true);
          }}
          className="mt-4 rounded-lg bg-[#6750A4] text-white px-5 py-2 text-sm font-semibold hover:opacity-90"
        >
          Share this meal
        </button>
      )}
      {sharing && shareData && (
        <MealShareModal meal={shareData} onClose={() => setSharing(false)} audience={audience} relationship={relationship} />
      )}
    </div>,
    document.body
  );
}
