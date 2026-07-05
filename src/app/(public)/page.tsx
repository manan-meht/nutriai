export const dynamic = "force-dynamic";
export const runtime = "edge";

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
import { MasterHome } from "@/components/home/MasterHome";
import nextDynamic from "next/dynamic";

// Feature flag: unified Tistra Health home page. When enabled, hosts that
// don't resolve to a dedicated gym/family marketing subdomain (and that
// don't carry an explicit ?product= override, used for local dev/testing)
// show the unified chooser instead of defaulting to one product's landing.
const UNIFIED_HOME_ENABLED = process.env.NEXT_PUBLIC_UNIFIED_HOME_ENABLED !== "false";

// New three-use-case master homepage (Track myself / Family / Coach). Takes
// precedence over UNIFIED_HOME_ENABLED at the same neutral-host gate below
// — off by default so it can be reviewed before replacing the existing
// unified chooser.
const NEW_MASTER_HOME_ENABLED = process.env.NEXT_PUBLIC_NEW_TISTRA_HOMEPAGE_ENABLED === "true";

const GymImmersiveLanding = nextDynamic(
  () => import("@/components/landing/immersive/GymImmersiveLanding").then((m) => ({ default: m.GymImmersiveLanding })),
  { ssr: true }
);

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
      title: "Tistra Health — Nutrition tracking through WhatsApp",
      description:
        "Send meals through WhatsApp. Tistra turns everyday food updates into simple weekly insights, progress trends, and gentle nutrition suggestions — for yourself, your family, or your clients.",
      alternates: { canonical: "/" },
      icons: { icon: faviconForProduct(null) },
    };
  }

  if (!byHostname && !explicitProduct && UNIFIED_HOME_ENABLED) {
    return {
      title: "Tistra Health — Family and Coaching, in one place",
      description:
        "Track nutrition for your family, or coach your clients — all under Tistra Health.",
      alternates: { canonical: "/" },
      icons: { icon: faviconForProduct(null) },
    };
  }

  const product = explicitProduct ?? (process.env.NEXT_PUBLIC_PRODUCT as ProductType | undefined) ?? "gym";

  if (product === "gym") {
    return {
      title: "Tistra Health — Nutrition coaching built for Indian trainers",
      description:
        "Your clients log meals from WhatsApp. AI identifies dal, roti, sabzi and more. You see who needs attention — all in one coach dashboard.",
      alternates: { canonical: "/" },
      icons: { icon: faviconForProduct("gym") },
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
    return <MasterHome />;
  }

  if (!explicitProduct && UNIFIED_HOME_ENABLED) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return (
      <UnifiedHome
        familyHref={user ? "/adults/dashboard" : getProductMarketingUrl("adults")}
        coachingHref={user ? "/gym/dashboard" : getProductMarketingUrl("gym")}
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
  return <GymImmersiveLanding variant="immersive" experimentId={experimentId} />;
}
