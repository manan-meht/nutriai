import type { Metadata } from "next";
import { AdultsImmersiveLanding } from "@/components/landing/immersive/AdultsImmersiveLanding";
import { EXPERIMENT_IDS } from "@/lib/experiments/landing-page-experiment";
import { MarketingHeader } from "@/components/home/MarketingHeader";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Health — Stay gently connected to how your family eats",
    description:
      "Your parent shares a photo or a few words on WhatsApp. You see a calm weekly summary. Their privacy, always in their hands.",
    alternates: { canonical: "/family" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Clean, stable route for the family/parent-support marketing flow — the
// existing family.tistrahealth.com subdomain and the neutral-host `/` with
// ?product=adults keep working unchanged (see resolve-product.ts); this is
// an additive route, not a replacement.
//
// Deliberately static (no server-side auth check, no edge runtime) — the
// logged-in→dashboard logo link is resolved client-side by MarketingHeader
// via /api/dashboard-href instead. Making this dynamic/edge would push it
// into the much larger Cloudflare Pages edge-function bundle bucket,
// which has a 25 MiB total-across-all-functions limit; adding 3 dynamic
// marketing pages (family/coach/me) tipped that over in production.
export default function FamilyMarketingPage() {
  return (
    <>
      <MarketingHeader variant="family" />
      <AdultsImmersiveLanding variant="immersive" experimentId={EXPERIMENT_IDS.adults} showNav={false} />
    </>
  );
}
