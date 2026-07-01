/**
 * Public landing page — resolves product + variant, then renders the correct page.
 *
 * Resolution order:
 * 1. Read product from hostname via NEXT_PUBLIC_PRODUCT env (local dev)
 *    or via resolved hostname in production.
 * 2. Read existing A/B assignment cookie.
 * 3. Resolve variant (query override → mode config → stable cookie).
 * 4. Set assignment cookie for new visitors.
 * 5. Render the correct landing page variant.
 *
 * The standard page is always the safe fallback if product cannot be determined.
 */

import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import type { ProductType } from "@/types";
import { resolveProductFromHostname } from "@/lib/product/resolve-product";
import {
  resolveServerSideVariant,
  parseAssignmentCookie,
  getCookieName,
  EXPERIMENT_IDS,
} from "@/lib/experiments/landing-page-experiment";
import dynamic from "next/dynamic";

const GymImmersiveLanding = dynamic(
  () => import("@/components/landing/immersive/GymImmersiveLanding").then((m) => ({ default: m.GymImmersiveLanding })),
  { ssr: true }
);

const AdultsImmersiveLanding = dynamic(
  () => import("@/components/landing/immersive/AdultsImmersiveLanding").then((m) => ({ default: m.AdultsImmersiveLanding })),
  { ssr: true }
);

interface LandingPageProps {
  searchParams?: Promise<Record<string, string | string[]>>;
}

export async function generateMetadata({ searchParams }: LandingPageProps): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const product = resolveProduct();

  if (product === "gym") {
    return {
      title: "Coach Nutrition — Nutrition coaching built for Indian trainers",
      description:
        "Your clients log meals from WhatsApp. AI identifies dal, roti, sabzi and more. You see who needs attention — all in one coach dashboard.",
      // Canonical prevents experiment URLs from appearing as duplicates
      alternates: { canonical: "/" },
    };
  }

  return {
    title: "Family Nutrition — Stay gently connected to how your family eats",
    description:
      "Your parent shares a photo or a few words. You see a calm weekly summary. Their privacy, always in their hands.",
    alternates: { canonical: "/" },
  };
}

function resolveProduct(): ProductType {
  // In RSC we can't call headers() before the component, so we default
  // based on NEXT_PUBLIC_PRODUCT for local dev
  const envProduct = process.env.NEXT_PUBLIC_PRODUCT as ProductType | undefined;
  return envProduct ?? "gym";
}

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const headerStore = await headers();
  const hostname = headerStore.get("host") ?? "localhost:3000";
  const cookieStore = await cookies();
  const resolvedParams = (await searchParams) ?? {};

  // 1. Resolve product (passes searchParams so ?product= works in local dev)
  const rawParamsEarly = new URLSearchParams(
    Object.entries((await searchParams) ?? {})
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
      .filter((e): e is [string, string] => typeof e[1] === "string")
  );
  const product: ProductType = resolveProductFromHostname(hostname, rawParamsEarly) ?? "gym";

  // 2. Parse existing assignment cookie
  const cookieName = getCookieName(product);
  const existingCookieValue = cookieStore.get(cookieName)?.value;
  const existingAssignment = parseAssignmentCookie(existingCookieValue, product);

  // 3. Resolve variant (query → config → cookie → new assignment)
  const rawParams = new URLSearchParams(
    Object.entries(resolvedParams)
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
      .filter((e): e is [string, string] => typeof e[1] === "string")
  );

  const { variant, assignment } = resolveServerSideVariant(
    product,
    rawParams,
    existingAssignment
  );

  // Cookie is set by middleware on first visit — no write needed here.

  const experimentId = EXPERIMENT_IDS[product];

  // 4. Render — immersive is now the only variant
  if (product === "adults") {
    return <AdultsImmersiveLanding variant="immersive" experimentId={experimentId} />;
  }
  return <GymImmersiveLanding variant="immersive" experimentId={experimentId} />;
}
