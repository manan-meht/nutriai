"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ProductType } from "@/types";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { GetStartedModal } from "./GetStartedModal";

export type MarketingHeaderVariant = "home" | "family" | "coach" | "me";

interface MarketingHeaderProps {
  variant: MarketingHeaderVariant;
  /** Fallback/initial href for the logo/brand name — the marketing
   * homepage by default. For "family" | "coach" | "me" (static pages,
   * no per-request server auth check — see the /api/dashboard-href
   * comment for why), this is upgraded client-side after mount if the
   * visitor turns out to be logged in. The "home" variant's caller
   * already resolves this server-side correctly, so no upgrade is
   * needed there, but the effect below is harmless either way. */
  homeHref?: string;
}

const VARIANT_PRODUCT: Record<Exclude<MarketingHeaderVariant, "home">, ProductType> = {
  family: "adults",
  coach: "gym",
  me: "adults",
};

// Shared sticky top nav for every marketing page (/, /family, /coach, /me)
// so the menu stays steady on scroll across the whole marketing surface,
// not just the master homepage. Purely presentational — each page keeps
// its own hero/content below it.
export function MarketingHeader({ variant, homeHref: initialHomeHref = "/" }: MarketingHeaderProps) {
  const [homeHref, setHomeHref] = useState(initialHomeHref);
  const [showGetStarted, setShowGetStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard-href")
      .then((res) => res.json())
      .then((data: { href: string | null }) => {
        if (!cancelled && data.href) setHomeHref(data.href);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const product = variant === "home" ? null : VARIANT_PRODUCT[variant];
  const signupUrl = product
    ? getSignupUrl({ product, source: "nav", variant: "standard" }) +
      (variant === "me" ? "&next=" + encodeURIComponent("/adults/dashboard?self=1") : "")
    : null;
  const loginUrl = product ? getLoginUrl({ product, source: "nav" }) : null;

  return (
    <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <Image src="/logos/logo-purple.png" alt="" width={32} height={32} className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-gray-900">Tistra Health</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link href="/family" className="text-gray-600 hover:text-[#4F378A]">Family</Link>
          <Link href="/coach" className="text-gray-600 hover:text-[#4F378A]">Coach</Link>
          <Link href="/me" className="text-gray-600 hover:text-[#4F378A]">For Me</Link>
        </nav>
        {variant === "home" ? (
          <button
            onClick={() => setShowGetStarted(true)}
            className="bg-[#6750A4] hover:bg-[#4F378A] text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors"
          >
            Get Started →
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href={loginUrl!}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2"
            >
              Sign in
            </Link>
            <Link
              href={signupUrl!}
              className="bg-[#6750A4] hover:bg-[#4F378A] text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
      {showGetStarted && <GetStartedModal onClose={() => setShowGetStarted(false)} />}
    </header>
  );
}
