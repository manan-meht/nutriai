import type { Metadata } from "next";
import { CoachIndiaLanding } from "@/components/landing/india/CoachIndiaLanding";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Coach India | AI Food Logging for Indian Fitness Coaches",
    description:
      "Track Indian client meals through WhatsApp. Tistra identifies Indian food, estimates protein and calories, and gives coaches a simple dashboard.",
    alternates: { canonical: "/coach/india" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// India-specific campaign wedge off /coach — same account system, signup,
// and dashboard as the global coach flow (see CoachIndiaLanding), just
// India-first copy and Indian food examples. Deliberately static, matching
// ../page.tsx (Cloudflare Pages edge-function bundle size limit).
export default function CoachIndiaMarketingPage() {
  return <CoachIndiaLanding />;
}
