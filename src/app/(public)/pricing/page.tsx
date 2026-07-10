import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { PricingSection } from "@/components/pricing/PricingSection";

export function generateMetadata(): Metadata {
  return {
    title: "Pricing — Tistra Health",
    description: "Founding-member pricing for Tistra Health. Free during Beta — billing isn't available yet.",
    alternates: { canonical: "/pricing" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Deliberately static (no market/IP resolution, no edge runtime) — this
// page must always show USD founding-member pricing only, never the
// multi-market, multi-currency live checkout prices from
// src/lib/billing/pricing.ts, which is what the dashboards use.
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-5xl mx-auto px-6 py-16">
        <PricingSection sourcePage="pricing_page" />
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
