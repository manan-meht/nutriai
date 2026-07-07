import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { AddUserExplainer } from "@/components/landing/shared/AddUserExplainer";
import { getSignupUrl } from "@/lib/landing/routes";

export function generateMetadata(): Metadata {
  return {
    title: "How Setup Works | Tistra Health",
    description:
      "See how to set up your own nutrition tracking on Tistra Health — confirm your WhatsApp number, send your first meal, and start building your own private weekly trends.",
    alternates: { canonical: "/me/add-users" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Dedicated page for the Self setup explainer — linked from a short
// teaser on /me, right after its meal-tracking "how it works" section.
// Static, same reasoning as every other public marketing page (see
// /me/page.tsx) — Cloudflare Pages edge-function bundle limit.
export default function SelfAddUsersPage() {
  const signupUrl =
    getSignupUrl({ product: "adults", source: "self_add_users_page", variant: "standard" }) +
    "&next=" + encodeURIComponent("/adults/dashboard?self=1");

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="me" />
      <main className="pt-8">
        <AddUserExplainer variant="self" ctaHref={signupUrl} ctaLabel="Start tracking myself" />
      </main>
      <MarketingFooter variant="me" />
    </div>
  );
}
