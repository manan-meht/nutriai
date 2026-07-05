export const dynamic = "force-dynamic";
export const runtime = "edge";

import type { Metadata } from "next";
import { AdultsImmersiveLanding } from "@/components/landing/immersive/AdultsImmersiveLanding";
import { EXPERIMENT_IDS } from "@/lib/experiments/landing-page-experiment";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { createClient } from "@/lib/supabase/server";
import { getDashboardHrefForUser } from "@/lib/product/dashboard-href";

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
export default async function FamilyMarketingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const homeHref = user ? await getDashboardHrefForUser(user.id) : "/";

  return (
    <>
      <MarketingHeader variant="family" homeHref={homeHref} />
      <AdultsImmersiveLanding variant="immersive" experimentId={EXPERIMENT_IDS.adults} showNav={false} />
    </>
  );
}
