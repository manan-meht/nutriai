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
  const [showSignIn, setShowSignIn] = useState(false);
  const [dashboardHref, setDashboardHref] = useState<string | null>(null);

  const product = variant === "home" ? null : VARIANT_PRODUCT[variant];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feedback?resource=dashboard-href")
      .then((res) => res.json())
      .then((data: { href: string | null }) => {
        if (cancelled) return;
        if (!data.href) return;
        // On a product-specific marketing page (/family, /coach, /me) we
        // already know unambiguously which product the visitor means —
        // use that instead of the API's answer. getDashboardHrefForUser
        // just picks whichever workspace the account happens to own
        // first, which is wrong for anyone whose single login (e.g. one
        // Google OAuth identity, which isn't scoped per-product the way
        // password sign-in's scopedEmail() is) owns workspaces in both
        // products — it would otherwise send a Family-page visitor to
        // their Gym dashboard. Only the neutral "home" variant has no
        // such page-level signal, so it still defers to the API.
        const href = product ? (product === "gym" ? "/gym/dashboard" : "/adults/dashboard") : data.href;
        setHomeHref(href);
        setDashboardHref(href);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product]);
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
          <span className="font-bold text-gray-900 flex items-center gap-1.5">
            Tistra Health
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#4F378A] bg-[#4F378A]/10 rounded-full px-1.5 py-0.5">Beta</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link href="/me" className="text-gray-600 hover:text-[#4F378A]">For Me</Link>
          <Link href="/family" className="text-gray-600 hover:text-[#4F378A]">Family</Link>
          <Link href="/coach" className="text-gray-600 hover:text-[#4F378A]">Coach</Link>
          <Link href="/pricing" className="text-gray-600 hover:text-[#4F378A]">Pricing</Link>
        </nav>
        {variant === "home" ? (
          <div className="flex items-center gap-3">
            {dashboardHref ? (
              <Link
                href={dashboardHref}
                className="bg-[#6750A4] hover:bg-[#4F378A] text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors"
              >
                My Dashboard
              </Link>
            ) : (
              <>
                <button
                  onClick={() => setShowSignIn(true)}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2"
                >
                  Sign in
                </button>
                <button
                  onClick={() => setShowGetStarted(true)}
                  className="bg-[#6750A4] hover:bg-[#4F378A] text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors"
                >
                  Get Started →
                </button>
              </>
            )}
          </div>
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
      {showSignIn && <GetStartedModal mode="signin" onClose={() => setShowSignIn(false)} />}
    </header>
  );
}
