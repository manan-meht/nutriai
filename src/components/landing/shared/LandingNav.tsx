import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { ProductType, LandingVariant } from "@/types";
import { getLoginUrl, getSignupUrl } from "@/lib/landing/routes";

interface LandingNavProps {
  product: ProductType;
  variant: LandingVariant;
  experimentId?: string;
}

const NAV_COPY: Record<ProductType, { logoLabel: string; logoSrc: string; signupLabel: string }> = {
  gym: {
    logoLabel: "Tistra Health",
    logoSrc: "/logos/logo-purple.png",
    signupLabel: "Start free",
  },
  adults: {
    logoLabel: "Tistra Health",
    logoSrc: "/logos/logo-red.png",
    signupLabel: "Get started",
  },
};

export function LandingNav({ product, variant, experimentId }: LandingNavProps) {
  const copy = NAV_COPY[product];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur-md border-b border-black/5">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center overflow-hidden">
          <Image src={copy.logoSrc} alt="" width={28} height={28} className="w-full h-full object-contain" />
        </div>
        <span className="text-base font-semibold tracking-tight">
          {copy.logoLabel}
        </span>
      </div>

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
