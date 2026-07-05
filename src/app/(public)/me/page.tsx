import type { Metadata } from "next";
import { SelfImmersiveLanding } from "@/components/landing/immersive/SelfImmersiveLanding";
import { MarketingHeader } from "@/components/home/MarketingHeader";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Health — Track your own meals through WhatsApp",
    description:
      "Track your own meals through WhatsApp. No calorie counting. No complicated app. See your own weekly progress dashboard.",
    alternates: { canonical: "/me" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Self-tracking marketing page. Reuses the adults product's signup/login
// (same account system, dashboard, and WhatsApp bot) — the ?next= param
// on signup only controls which onboarding step runs after signup
// (creating a tracked profile for the signed-up user themself,
// relationship_type "self", instead of inviting someone else). See
// SELF_TRACKING_ENABLED.
//
// Deliberately static — see the comment in ../family/page.tsx for why
// (Cloudflare Pages edge-function bundle size limit).
export default function TrackMyselfPage() {
  return (
    <>
      <MarketingHeader variant="me" />
      <SelfImmersiveLanding />
    </>
  );
}
