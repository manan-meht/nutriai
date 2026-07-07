import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { AddUserExplainer } from "@/components/landing/shared/AddUserExplainer";
import { getSignupUrl } from "@/lib/landing/routes";

export function generateMetadata(): Metadata {
  return {
    title: "How Invites Work | Tistra Health",
    description:
      "See how to add a parent or family member to Tistra Health — invite them over WhatsApp, they choose what to share, then start nutrition tracking simply.",
    alternates: { canonical: "/family/add-users" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Dedicated page for the Family invite/setup explainer — linked from a
// short teaser on /family, right after its meal-tracking "how it works"
// section. Static, same reasoning as every other public marketing page
// (see /family/page.tsx) — Cloudflare Pages edge-function bundle limit.
export default function FamilyAddUsersPage() {
  const signupUrl = getSignupUrl({
    product: "adults",
    source: "family_add_users_page",
    variant: "standard",
    productParam: "family",
  });

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="family" />
      <main className="pt-8">
        <AddUserExplainer variant="family" ctaHref={signupUrl} ctaLabel="Add a family member" />
      </main>
      <MarketingFooter variant="family" />
    </div>
  );
}
