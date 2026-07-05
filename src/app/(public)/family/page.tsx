export const dynamic = "force-dynamic";
export const runtime = "edge";

import type { Metadata } from "next";
import { AdultsImmersiveLanding } from "@/components/landing/immersive/AdultsImmersiveLanding";
import { EXPERIMENT_IDS } from "@/lib/experiments/landing-page-experiment";
import { faviconForProduct } from "@/lib/product/icons";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Health — Stay gently connected to how your family eats",
    description:
      "Your parent shares a photo or a few words on WhatsApp. You see a calm weekly summary. Their privacy, always in their hands.",
    alternates: { canonical: "/family" },
    icons: { icon: faviconForProduct("adults") },
  };
}

// Clean, stable route for the family/parent-support marketing flow — the
// existing family.tistrahealth.com subdomain and the neutral-host `/` with
// ?product=adults keep working unchanged (see resolve-product.ts); this is
// an additive route, not a replacement.
export default function FamilyMarketingPage() {
  return <AdultsImmersiveLanding variant="immersive" experimentId={EXPERIMENT_IDS.adults} />;
}
