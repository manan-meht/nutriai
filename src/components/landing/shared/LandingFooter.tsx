import React from "react";
import Link from "next/link";
import type { ProductType } from "@/types";
import { getCrossProductSwitchUrl } from "@/lib/product/resolve-product";

interface LandingFooterProps {
  product: ProductType;
}

const TAGLINE: Record<ProductType, string> = {
  adults: "Bridging the distance with effortless nutrition awareness for global Indian families.",
  gym: "Modern Indian fitness coaching. Effortless accountability, lasting habits.",
};

export function LandingFooter({ product }: LandingFooterProps) {
  const switchUrl = getCrossProductSwitchUrl(product);
  const switchLabel = product === "gym" ? "the family view" : "the coaching view";
  const switchPrompt =
    product === "gym"
      ? "Supporting an older family member?"
      : "Are you a trainer or fitness professional?";

  return (
    <footer className="border-t border-gray-200 py-12 px-6 text-sm text-gray-500">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <p className="font-semibold text-gray-900 mb-1">Tistra Health</p>
          <p className="text-xs">
            {TAGLINE[product]}
          </p>
        </div>

        <div className="flex flex-col gap-1 text-xs">
          <span className="text-gray-400">{switchPrompt}</span>
          <a href={switchUrl} className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
            Switch to {switchLabel} →
          </a>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1 text-xs text-gray-400">
          <span>©2026 Tistra Health. Made for global Indians.</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:justify-end">
            <Link href="/terms" className="text-gray-500 hover:text-gray-900 underline underline-offset-2">
              Terms &amp; Conditions
            </Link>
            <span aria-hidden="true">·</span>
            <span>
              Support:{" "}
              <a
                href="mailto:tistrahealth@gmail.com?subject=Tistra%20Health%20Support"
                className="text-gray-500 hover:text-gray-900 underline underline-offset-2"
              >
                tistrahealth@gmail.com
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
