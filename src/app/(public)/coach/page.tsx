import type { Metadata } from "next";
import { GymImmersiveLanding } from "@/components/landing/immersive/GymImmersiveLanding";
import { EXPERIMENT_IDS } from "@/lib/experiments/landing-page-experiment";
import { MarketingHeader } from "@/components/home/MarketingHeader";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Health — Nutrition coaching built for Indian trainers",
    description:
      "Your clients log meals from WhatsApp. AI identifies dal, roti, sabzi and more. You see who needs attention — all in one coach dashboard.",
    alternates: { canonical: "/coach" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Clean, stable route for the coach/trainer/gym marketing flow — the
// existing coach.tistrahealth.com subdomain and the neutral-host `/` with
// ?product=gym keep working unchanged (see resolve-product.ts); this is an
// additive route, not a replacement.
//
// Deliberately static — see the comment in ../family/page.tsx for why
// (Cloudflare Pages edge-function bundle size limit).
export default function CoachMarketingPage() {
  return (
    <>
      <MarketingHeader variant="coach" />
      <GymImmersiveLanding variant="immersive" experimentId={EXPERIMENT_IDS.gym} showNav={false} />
    </>
  );
}
