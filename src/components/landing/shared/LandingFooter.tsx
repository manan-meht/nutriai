import React from "react";
import type { ProductType } from "@/types";
import { getCrossProductSwitchUrl } from "@/lib/product/resolve-product";

interface LandingFooterProps {
  product: ProductType;
}

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
            Helping Indian families and fitness communities eat better, together.
          </p>
        </div>

        <div className="flex flex-col gap-1 text-xs">
          <span className="text-gray-400">{switchPrompt}</span>
          <a href={switchUrl} className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
            Switch to {switchLabel} →
          </a>
        </div>

        <div className="text-xs text-gray-400">
          © {new Date().getFullYear()} Tistra Health. Made for India.
        </div>
      </div>
    </footer>
  );
}
