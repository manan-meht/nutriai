import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CoachLanding } from "@/components/landing/coach/CoachLanding";
import { IN_COACH_MARKET } from "@/lib/landing/coach-market";
import { GoogleAdsTag } from "@/components/marketing/GoogleAdsTag";
import { isCoachHost } from "@/lib/coach/routes";
import { isLocalDevHost } from "@/lib/club/host";
import { visitorCity } from "@/lib/landing/visitor-city";

// coach.tistra.club/india — the India coach recruitment page.
//
// Dynamic because it reads the visitor's city from the edge. That is the
// only reason; nothing else here varies per request.
//
// One component, two markets: everything that differs — copy, imagery,
// discipline cards, the FAQ set, whether bookings are live — comes from the
// market object, so the two cannot drift into separate designs again. This
// route pins India; the coach root picks the market from the edge country.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const description =
    "Tistra Club is opening in India. Join as a Founding Coach: help building your profile, " +
    "Tistra-funded promotion, and 0% commission on your first 10 bookings when booking opens.";
  return {
    title: "Tistra Coach India | Get more coaching clients",
    description,
    // Absolute, and on the coach host: the page is served only there, and a
    // relative canonical would resolve against whichever host rendered it.
    alternates: { canonical: "https://coach.tistra.club/india" },
    icons: { icon: "/logos/logo-purple.png" },
    openGraph: {
      title: "Tistra Club is opening in India — become a Founding Coach",
      description,
      type: "website",
      siteName: "Tistra Coach",
    },
  };
}

export default async function IndiaCoachMarketingPage() {
  // Coach host only. On tistrahealth.com this page would be a coach
  // recruitment pitch on the Health domain, and on tistra.club the
  // middleware rewrites into /club/* anyway.
  const host = (await headers()).get("host");
  if (!isCoachHost(host) && !isLocalDevHost(host)) notFound();

  return (
    <>
      <GoogleAdsTag />
      <CoachLanding market={IN_COACH_MARKET} city={await visitorCity()} />
    </>
  );
}
