import type { Metadata } from "next";
import { FamilyIndiaLanding } from "@/components/landing/india/FamilyIndiaLanding";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Family India | Support Your Parents’ Nutrition in India",
    description:
      "Parents in India send meal photos on WhatsApp. Tistra identifies Indian meals, estimates protein and calories, and shares simple weekly insights with family permission.",
    alternates: { canonical: "/family/india" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// India-specific campaign wedge off /family — same account system, signup,
// and dashboard as the global family flow (see FamilyIndiaLanding), just
// India-first copy and Indian food examples. Deliberately static, matching
// ../page.tsx (Cloudflare Pages edge-function bundle size limit).
export default function FamilyIndiaMarketingPage() {
  return <FamilyIndiaLanding />;
}
