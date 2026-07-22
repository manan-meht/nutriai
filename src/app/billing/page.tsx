import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { PricingSection } from "@/components/pricing/PricingSection";

export function generateMetadata(): Metadata {
  return {
    title: "Billing — Tistra Health",
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Deliberately static, same as /pricing (no auth check, no edge runtime,
// no import of subscription-management.ts/Stripe) — PricingSection itself
// already handles both logged-out (→ signup, carrying the chosen plan/
// interval through to checkout once signed up) and logged-in (→ straight
// to Stripe Checkout) visitors client-side. A server-side auth redirect
// here previously made this page import the full Stripe SDK just to
// generate a billing-portal URL, which alone cost ~1.3 MB as a Cloudflare
// Pages Function and helped push the whole deployment over the 25 MiB
// aggregate Functions limit — see git history.
export default function BillingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-5xl mx-auto px-6 py-16">
        <PricingSection sourcePage="billing_page" />
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
