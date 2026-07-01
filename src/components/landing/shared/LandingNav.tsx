import React from "react";
import Link from "next/link";
import type { ProductType, LandingVariant } from "@/types";
import { getLoginUrl, getSignupUrl } from "@/lib/landing/routes";
import { getCrossProductSwitchUrl } from "@/lib/product/resolve-product";

interface LandingNavProps {
  product: ProductType;
  variant: LandingVariant;
  experimentId?: string;
}

const NAV_COPY: Record<
  ProductType,
  { logoLabel: string; crossProductPrompt: string; crossProductLabel: string; signupLabel: string }
> = {
  gym: {
    logoLabel: "Coach Nutrition",
    crossProductPrompt: "Supporting an older family member?",
    crossProductLabel: "Switch to Family Nutrition",
    signupLabel: "Start free",
  },
  adults: {
    logoLabel: "Family Nutrition",
    crossProductPrompt: "Are you a trainer or fitness professional?",
    crossProductLabel: "Switch to Coach Nutrition",
    signupLabel: "Get started",
  },
};

export function LandingNav({ product, variant, experimentId }: LandingNavProps) {
  const copy = NAV_COPY[product];
  const switchUrl = getCrossProductSwitchUrl(product);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur-md border-b border-black/5">
      {/* Logo */}
      <div className="text-base font-semibold tracking-tight">
        {copy.logoLabel}
      </div>

      {/* Nav */}
      <nav className="hidden md:flex items-center gap-6 text-sm">
        <span className="text-gray-500 text-xs">{copy.crossProductPrompt}</span>
        <a
          href={switchUrl}
          className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
        >
          {copy.crossProductLabel}
        </a>
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Link
          href={getLoginUrl({ product, source: "nav" })}
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          Sign in
        </Link>
        <Link
          href={getSignupUrl({ product, source: "nav", variant, experimentId })}
          className="text-sm font-semibold bg-gray-900 text-white rounded-full px-4 py-2 hover:bg-gray-700 transition-colors"
        >
          {copy.signupLabel}
        </Link>
      </div>
    </header>
  );
}
