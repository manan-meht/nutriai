"use client";

import React, { useEffect, useRef, useState } from "react";
import { FeedbackForm } from "./FeedbackForm";

interface Props {
  product: "gym" | "adults";
  prefillEmail?: string;
  onClose: () => void;
  /** The trigger element to return focus to on close — passing this
   * explicitly (rather than relying on document.activeElement at mount)
   * keeps it correct even if focus moved between opening the modal and
   * this effect running. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function FeedbackModal({ product, prefillEmail, onClose, returnFocusRef }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    return () => {
      returnFocusRef?.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount/unmount only
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (submitting) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [submitting, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 id="feedback-modal-title" className="text-lg font-bold text-gray-900">Send Feedback</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-40"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-6">
          <FeedbackForm
            source="dashboard"
            product={product}
            prefillEmail={prefillEmail}
            onSubmittingChange={setSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
