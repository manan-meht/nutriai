import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { LocalPricingSection } from "@/components/pricing/LocalPricingSection";
import { BILLING_AVAILABLE } from "@/lib/billing/feature-flags";

export function generateMetadata(): Metadata {
  return {
    title: "Pricing — Tistra Health",
    description: BILLING_AVAILABLE
      ? "Founding-member pricing for Tistra Health. Start your free 14-day trial today."
      : "Founding-member pricing for Tistra Health. Free during Beta — billing isn't available yet.",
    alternates: { canonical: "/pricing" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Shows the visitor's local prices — the same market resolution and price
// table checkout uses (see LocalPricingSection), so what this page quotes
// is what checkout charges. It used to be a static US$-only list, which
// disagreed with checkout once billing went live in each market.
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-5xl mx-auto px-6 py-16">
        <LocalPricingSection sourcePage="pricing_page" />
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
