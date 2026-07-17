"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";

interface GetStartedModalProps {
  onClose: () => void;
  /** "signup" (default) sends each option to that product's signup flow;
   * "signin" sends it to that product's login instead — used by the
   * header's "Sign in" button so it also asks which product before
   * routing, instead of silently defaulting to one plan (see the header's
   * comment on why that was a bug). Login has no separate "me" vs
   * "family" destination (both are the "adults" product's one login
   * screen — the mobile app's Self/Family login share the same scoping
   * for the same reason), so those two options both point at the same
   * adults login URL in signin mode. */
  mode?: "signup" | "signin";
}

const SIGNUP_OPTIONS = [
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

const SIGNIN_OPTIONS = [
  {
    href: getLoginUrl({ product: "adults", source: "home_sign_in" }),
    icon: "🙋",
    title: "For Me",
    description: "Build awareness without calorie counting.",
    cta: "Sign in as myself",
  },
  {
    href: getLoginUrl({ product: "adults", source: "home_sign_in" }),
    icon: "👨‍👩‍👧",
    title: "For Family",
    description: "Support aging parents or family members through simple WhatsApp meal updates.",
    cta: "Sign in for family",
  },
  {
    href: getLoginUrl({ product: "gym", source: "home_sign_in" }),
    icon: "🏋️",
    title: "For Coaches",
    description: "See which clients need a nutrition check-in this week.",
    cta: "Sign in as a coach",
  },
  {
    // Not a caregiver/coach login at all — this is the OTP-verified
    // end-user session (src/lib/end-user/otp.ts) for the person whose
    // meals are actually being tracked. Signin-only: a participant doesn't
    // "sign up" here, they're already someone else's tracked contact.
    href: "/my-progress",
    icon: "🔒",
    title: "I was invited",
    description: "Sign in with a text message to view your private Tistra Health dashboard.",
    cta: "View my dashboard",
  },
];

// Opened by the header's "Get Started" and "Sign in" buttons on the
// homepage — previously "Get Started" just anchor-scrolled to the
// homepage's own use-case section (a no-op if you were already there), and
// "Sign in" skipped product choice entirely, landing everyone on the
// family plan's login regardless of what they actually wanted. This makes
// the choice explicit in both flows.
export function GetStartedModal({ onClose, mode = "signup" }: GetStartedModalProps) {
  const OPTIONS = mode === "signin" ? SIGNIN_OPTIONS : SIGNUP_OPTIONS;
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
          <h2 className="text-xl font-bold text-gray-900">
            {mode === "signin" ? "Which account are you signing in to?" : "How would you like to use Tistra Health?"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <div className={`grid grid-cols-1 gap-4 ${mode === "signin" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
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
