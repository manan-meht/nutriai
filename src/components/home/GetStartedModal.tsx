"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { getSignupUrl } from "@/lib/landing/routes";

interface GetStartedModalProps {
  onClose: () => void;
}

const OPTIONS = [
  {
    href: getSignupUrl({ product: "adults", source: "home_get_started", variant: "standard", productParam: "me" }) +
      "&next=" + encodeURIComponent("/adults/dashboard?self=1"),
    icon: "🙋",
    title: "For Me",
    description: "Build awareness without calorie counting.",
    cta: "Continue for myself",
  },
  {
    href: getSignupUrl({ product: "adults", source: "home_get_started", variant: "standard", productParam: "family" }),
    icon: "👨‍👩‍👧",
    title: "For Family",
    description: "Support aging parents or family members through simple WhatsApp meal updates.",
    cta: "Continue for family",
  },
  {
    href: getSignupUrl({ product: "gym", source: "home_get_started", variant: "standard", productParam: "coach" }),
    icon: "🏋️",
    title: "For Coaches",
    description: "See which clients need a nutrition check-in this week.",
    cta: "Continue for coaching",
  },
];

// Opened by the header's "Get Started" button on the homepage — previously
// that button just anchor-scrolled to the homepage's own use-case section
// (a no-op if you were already there), which wasn't a real product choice.
// This makes the choice explicit and takes people straight to signup.
export function GetStartedModal({ onClose }: GetStartedModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">How would you like to use Tistra Health?</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {OPTIONS.map((option) => (
            <div key={option.title} className="border border-gray-200 rounded-2xl p-5 flex flex-col hover:border-[#6750A4] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#F3EEFB] flex items-center justify-center text-xl mb-4">
                {option.icon}
              </div>
              <h3 className="font-bold text-gray-900 mb-1">{option.title}</h3>
              <p className="text-sm text-gray-600 mb-6 flex-grow">{option.description}</p>
              <Link
                href={option.href}
                className="w-full text-center py-2.5 px-4 bg-[#6750A4] hover:bg-[#4F378A] text-white text-sm font-semibold rounded-full transition-colors"
              >
                {option.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
