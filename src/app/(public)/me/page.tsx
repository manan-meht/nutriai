export const dynamic = "force-dynamic";
export const runtime = "edge";

import type { Metadata } from "next";
import { SelfImmersiveLanding } from "@/components/landing/immersive/SelfImmersiveLanding";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { createClient } from "@/lib/supabase/server";
import { getDashboardHrefForUser } from "@/lib/product/dashboard-href";

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
export default async function TrackMyselfPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const homeHref = user ? await getDashboardHrefForUser(user.id) : "/";

  return (
    <>
      <MarketingHeader variant="me" homeHref={homeHref} />
      <SelfImmersiveLanding />
    </>
  );
}
