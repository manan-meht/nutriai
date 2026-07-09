import type { Metadata } from "next";
import { MeIndiaLanding } from "@/components/landing/india/MeIndiaLanding";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Me India | Track Indian Meals From WhatsApp",
    description:
      "Track dal, rice, roti, sabzi, dosa, idli, paneer, snacks, tea, and more through WhatsApp with AI nutrition estimates.",
    alternates: { canonical: "/me/india" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// India-specific campaign wedge off /me — same account system, signup, and
// dashboard as the global self-tracking flow (see MeIndiaLanding), just
// India-first copy and Indian food examples. Deliberately static, matching
// ../page.tsx (Cloudflare Pages edge-function bundle size limit).
export default function MeIndiaMarketingPage() {
  return <MeIndiaLanding />;
}
