export const dynamic = "force-dynamic";

import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import type { ProductType } from "@/types";
import { resolveProductFromHostnameOnly, getProductMarketingUrl } from "@/lib/product/resolve-product";
import { faviconForProduct } from "@/lib/product/icons";
import {
  resolveServerSideVariant,
  parseAssignmentCookie,
  getCookieName,
  EXPERIMENT_IDS,
} from "@/lib/experiments/landing-page-experiment";
import { createClient } from "@/lib/supabase/server";
import { UnifiedHome } from "@/components/home/UnifiedHome";
import { CoachLanding } from "@/components/landing/coach/CoachLanding";
import { GoogleAdsTag } from "@/components/marketing/GoogleAdsTag";
import { coachMarketForCountry } from "@/lib/landing/coach-market";
import { visitorCity } from "@/lib/landing/visitor-city";
import { MasterHome } from "@/components/home/MasterHome";
import { getDashboardHrefForUser } from "@/lib/product/dashboard-href";
import nextDynamic from "next/dynamic";

// Feature flag: unified Tistra Health home page. When enabled, hosts that
// don't resolve to a dedicated gym/family marketing subdomain (and that
// don't carry an explicit ?product= override, used for local dev/testing)
// show the unified chooser instead of defaulting to one product's landing.
const UNIFIED_HOME_ENABLED = process.env.NEXT_PUBLIC_UNIFIED_HOME_ENABLED !== "false";

// Master homepage (Me / Family / invited user). Takes
// precedence over UNIFIED_HOME_ENABLED at the same neutral-host gate below
// — off by default so it can be reviewed before replacing the existing
// unified chooser.
const NEW_MASTER_HOME_ENABLED = process.env.NEXT_PUBLIC_NEW_TISTRA_HOMEPAGE_ENABLED === "true";

const AdultsImmersiveLanding = nextDynamic(
  () => import("@/components/landing/immersive/AdultsImmersiveLanding").then((m) => ({ default: m.AdultsImmersiveLanding })),
  { ssr: true }
);

interface LandingPageProps {
  searchParams?: Promise<Record<string, string | string[]>>;
}

export async function generateMetadata(props: LandingPageProps): Promise<Metadata> {
  const headerStore = await headers();
  const hostname = headerStore.get("host") ?? "localhost:3000";
  const rawParams = new URLSearchParams(
    Object.entries((await props.searchParams) ?? {})
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
      .filter((e): e is [string, string] => typeof e[1] === "string")
  );

  const byHostname = resolveProductFromHostnameOnly(hostname);
  const qp = rawParams.get("product");
  const explicitProduct: ProductType | null =
    byHostname ?? (qp === "gym" || qp === "adults" ? qp : null);

  if (!byHostname && !explicitProduct && NEW_MASTER_HOME_ENABLED) {
    return {
      title: "Tistra Health | WhatsApp Meal Tracking and Nutrition Insights",
      description:
        "Turn WhatsApp meal photos into simple nutrition insights for individuals and families.",
      alternates: { canonical: "/" },
      icons: { icon: "/logos/logo-purple.png" },
    };
  }

  if (!byHostname && !explicitProduct && UNIFIED_HOME_ENABLED) {
    return {
      title: "Tistra Health — nutrition tracking for you and your family",
      description:
        "Track nutrition for yourself or the people you care about, from a WhatsApp meal photo.",
      alternates: { canonical: "/" },
      icons: { icon: faviconForProduct(null) },
    };
  }

  const product = explicitProduct ?? (process.env.NEXT_PUBLIC_PRODUCT as ProductType | undefined) ?? "gym";

  if (product === "gym") {
    // Tistra Coach — the coaching business platform, not a food-logging
    // tool. Matches CoachLanding's positioning (see that component's note
    // on why the previous nutrition-first framing was replaced).
    // The coach root serves India's copy to Indian visitors at the SAME
    // URL (see the render branch below), so the metadata has to follow or
    // an Indian visitor gets Singapore's title on India's page.
    if (coachMarketForCountry(headerStore.get("cf-ipcountry")).id === "in") {
      const inDescription =
        "Tistra Club is opening in India. Join as a Founding Coach: help building your profile, " +
        "Tistra-funded promotion, and 0% commission on your first 10 bookings when booking opens.";
      return {
        title: "Tistra Coach India | Get more coaching clients",
        description: inDescription,
        // Points at the India page's own URL rather than "/": the same
        // content lives there permanently and is what should be indexed,
        // while "/" varies by country.
        alternates: { canonical: "https://coach.tistra.club/india" },
        icons: { icon: faviconForProduct("gym") },
        openGraph: {
          title: "Tistra Club is opening in India — become a Founding Coach",
          description: inDescription,
          type: "website",
          siteName: "Tistra Coach",
        },
      };
    }

    const description =
      "Join Tistra Club as a Founding Coach: 0% commission on your first 10 bookings, " +
      "Tistra-funded promotion of your profile, and personal help setting it up. " +
      "No monthly fee, no exclusivity.";
    return {
      title: "Tistra Coach | Get more coaching clients",
      description,
      alternates: { canonical: "/" },
      icons: { icon: faviconForProduct("gym") },
      openGraph: {
        title: "Get more coaching clients — become a Tistra Founding Coach",
        description,
        type: "website",
        siteName: "Tistra Coach",
      },
      twitter: { card: "summary_large_image", title: "Get more coaching clients", description },
    };
  }

  return {
    title: "Tistra Health — Stay gently connected to how your family eats",
    description:
      "Your parent shares a photo or a few words. You see a calm weekly summary. Their privacy, always in their hands.",
    alternates: { canonical: "/" },
    icons: { icon: faviconForProduct("adults") },
  };
}

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const headerStore = await headers();
  const hostname = headerStore.get("host") ?? "localhost:3000";
  const cookieStore = await cookies();
  const resolvedParams = (await searchParams) ?? {};

  const rawParamsEarly = new URLSearchParams(
    Object.entries((await searchParams) ?? {})
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
      .filter((e): e is [string, string] => typeof e[1] === "string")
  );

  const byHostname = resolveProductFromHostnameOnly(hostname);
  const qp = rawParamsEarly.get("product");
  const explicitProduct: ProductType | null =
    byHostname ?? (qp === "gym" || qp === "adults" ? qp : null);

  // Dedicated marketing subdomains (coach.tistrahealth.com, family.tistrahealth.com,
  // etc.) and explicit ?product= overrides keep their existing immersive landing —
  // only the neutral/unresolved host switches to the new home page.
  if (!explicitProduct && NEW_MASTER_HOME_ENABLED) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const lastVisitedProduct = (await cookies()).get("tistra_last_product")?.value;
    const homeHref = user
      ? await getDashboardHrefForUser(
          user.id,
          lastVisitedProduct === "gym" || lastVisitedProduct === "adults" ? lastVisitedProduct : undefined
        )
      : "/";
    return <MasterHome homeHref={homeHref} />;
  }

  if (!explicitProduct && UNIFIED_HOME_ENABLED) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return (
      <UnifiedHome
        familyHref={user ? "/adults/dashboard" : getProductMarketingUrl("adults")}
        selfHref={user ? "/adults/dashboard" : "/me"}
      />
    );
  }

  const product: ProductType = explicitProduct ?? "gym";

  const cookieName = getCookieName(product);
  const existingCookieValue = cookieStore.get(cookieName)?.value;
  const existingAssignment = parseAssignmentCookie(existingCookieValue, product);

  const rawParams = new URLSearchParams(
    Object.entries(resolvedParams)
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
      .filter((e): e is [string, string] => typeof e[1] === "string")
  );

  const { variant } = resolveServerSideVariant(product, rawParams, existingAssignment);
  const experimentId = EXPERIMENT_IDS[product];

  if (product === "adults") {
    return <AdultsImmersiveLanding variant="immersive" experimentId={experimentId} />;
  }
  // The "gym" product is now Tistra Coach — a separate product on its own
  // domain (coach.tistrahealth.com), so the coach host's root serves the
  // Coach page rather than Tistra Health's nutrition-tracking pitch. The
  // landing-page experiment doesn't apply here: it was built to compare
  // variants of GymImmersiveLanding, which this replaces.
  // The Google tag belongs here, not only on /coach: coach.tistra.club's
  // ROOT is served by this branch, and the root is the URL an ad click
  // lands on and the one Google's tag check fetches. Inside the gym branch
  // so it never renders for Tistra Health.
  // India sees India's page at this same URL — no redirect, so a link to
  // coach.tistra.club keeps working from anywhere and simply says the right
  // thing. Anything that is not India falls through to CoachLanding
  // unchanged, which is what the Google Ads campaign points at.
  //
  // This is geolocation, not cloaking: the branch is on the visitor's
  // country and treats a crawler exactly like any other visitor from the
  // same place. /india remains separately reachable and indexable, and the
  // India variant's canonical points there.
  //
  // Free to do per request — this route is already force-dynamic.
  const coachMarket = coachMarketForCountry(headerStore.get("cf-ipcountry"));
  if (coachMarket.id === "in") {
    return (
      <>
        <GoogleAdsTag />
        <CoachLanding market={coachMarket} city={await visitorCity()} />
      </>
    );
  }

  return (
    <>
      <GoogleAdsTag />
      <CoachLanding />
    </>
  );
}
