"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface MealPhotoModalProps {
  url: string;
  label: string;
  onClose: () => void;
}

/** Full-screen lightbox for a meal photo — shared by the adults and gym
 * dashboards' "Recent meals" section (see ContactDashboard.tsx/
 * ClientDashboard.tsx). Tapping the small thumbnail in the list opens this
 * instead of navigating away. */
export function MealPhotoModal({ url, label, onClose }: MealPhotoModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
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
        className="max-w-full max-h-full rounded-2xl object-contain"
      />
    </div>,
    document.body
  );
}
