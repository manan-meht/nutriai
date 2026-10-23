import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { LocalPricingSection } from "@/components/pricing/LocalPricingSection";

export function generateMetadata(): Metadata {
  return {
    title: "Billing — Tistra Health",
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// No auth check and no import of subscription-management.ts/Stripe —
// PricingSection already handles both logged-out (→ signup, carrying the
// chosen plan/interval through to checkout once signed up) and logged-in
// (→ straight to checkout) visitors client-side. A server-side auth
// redirect here previously made this page import the full Stripe SDK just
// to generate a billing-portal URL — see git history. LocalPricingSection
// only reads the request's country, the same way checkout does.
export default function BillingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-5xl mx-auto px-6 py-16">
        <LocalPricingSection sourcePage="billing_page" />
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
