import type { Metadata } from "next";
import { CoachLanding } from "@/components/landing/coach/CoachLanding";
import { GoogleAdsTag } from "@/components/marketing/GoogleAdsTag";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Coach | Run your coaching practice",
    description:
      "Get discovered by new clients, fill your calendar with travel-aware scheduling, take payment automatically, and track every client's progress. Built for coaches in Singapore.",
    alternates: { canonical: "/coach" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// The Tistra Coach product page, served at coach.tistrahealth.com and at
// /coach on the neutral host.
//
// Replaces GymImmersiveLanding (Aug 2026). That page sold nutrition
// tracking as the whole product — "clients send meal photos, you see who
// needs attention" — which is why the coach product had seven signups and
// not one client between them: it only pays off for a coach who ALREADY
// has a full roster and a logging habit to enforce. Tistra Coach sells the
// business itself (discovery, scheduling, payments, progress) and presents
// nutrition as one capability, which is also what the product now is.
//
// MarketingHeader isn't used here: that's Tistra Health's nav, and this is
// a separate product with its own brand. CoachLanding brings its own.
//
// Deliberately static — see ../family/page.tsx for the bundle-size
// reasoning that applies to every marketing route.
export default function CoachMarketingPage() {
  return (
    <>
      <GoogleAdsTag />
      <CoachLanding />
    </>
  );
}
