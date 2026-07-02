export const runtime = "edge";
export const dynamic = "force-dynamic";

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
import nextDynamic from "next/dynamic";

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

export async function generateMetadata(_props: LandingPageProps): Promise<Metadata> {
  const envProduct = process.env.NEXT_PUBLIC_PRODUCT as ProductType | undefined;
  const product = envProduct ?? "gym";

  if (product === "gym") {
    return {
      title: "Tistra Coach — Nutrition coaching built for Indian trainers",
      description:
        "Your clients log meals from WhatsApp. AI identifies dal, roti, sabzi and more. You see who needs attention — all in one coach dashboard.",
      alternates: { canonical: "/" },
    };
  }

  return {
    title: "Tistra Family — Stay gently connected to how your family eats",
    description:
      "Your parent shares a photo or a few words. You see a calm weekly summary. Their privacy, always in their hands.",
    alternates: { canonical: "/" },
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
  const product: ProductType = resolveProductFromHostname(hostname, rawParamsEarly) ?? "gym";

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
