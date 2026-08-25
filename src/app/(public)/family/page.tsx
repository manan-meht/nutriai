import type { Metadata } from "next";
import { AdultsImmersiveLanding } from "@/components/landing/immersive/AdultsImmersiveLanding";
import { EXPERIMENT_IDS } from "@/lib/experiments/landing-page-experiment";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { tistraHealthGraph, SITE_URL } from "@/lib/seo/structured-data";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Family | Support a Loved One’s Nutrition From Anywhere",
    description:
      "Help a parent, partner, or family member log meals through WhatsApp and see simple nutrition summaries with permission.",
    alternates: { canonical: "/family" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Clean, stable route for the family/parent-support marketing flow — the
// existing family.tistrahealth.com subdomain and the neutral-host `/` with
// ?product=adults keep working unchanged (see resolve-product.ts); this is
// an additive route, not a replacement.
//
// Deliberately static (no server-side auth check, no edge runtime) — the
// logged-in→dashboard logo link is resolved client-side by MarketingHeader
// via /api/dashboard-href instead. Making this dynamic/edge would push it
// into the much larger Cloudflare Pages edge-function bundle bucket,
// which has a 25 MiB total-across-all-functions limit; adding 3 dynamic
// marketing pages (family/coach/me) tipped that over in production.
export default function FamilyMarketingPage() {
  return (
    <>
      {/* Entity graph only — no FAQPage here. The FAQ answers are rendered
          on the homepage, and claiming FAQPage on a page that doesn't show
          the matching copy is a structured-data policy violation. Adding a
          JSON-LD script keeps this page static; it renders at build time. */}
      <JsonLd data={tistraHealthGraph(`${SITE_URL}/family`)} />
      <MarketingHeader variant="family" />
      <AdultsImmersiveLanding variant="immersive" experimentId={EXPERIMENT_IDS.adults} showNav={false} />
    </>
  );
}
