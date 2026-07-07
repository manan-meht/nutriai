import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { AddUserExplainer } from "@/components/landing/shared/AddUserExplainer";
import { getSignupUrl } from "@/lib/landing/routes";

export function generateMetadata(): Metadata {
  return {
    title: "How Invites Work | Tistra Health",
    description:
      "See how to invite clients to Tistra Health — they get a WhatsApp invite, accept and start logging meals, and their progress shows up in your coach dashboard.",
    alternates: { canonical: "/coach/add-users" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Dedicated page for the Coach invite/setup explainer — linked from a
// short teaser on /coach, right after its meal-tracking "how it works"
// section. Static, same reasoning as every other public marketing page
// (see /coach/page.tsx) — Cloudflare Pages edge-function bundle limit.
export default function CoachAddUsersPage() {
  const signupUrl = getSignupUrl({
    product: "gym",
    source: "coach_add_users_page",
    variant: "standard",
    productParam: "coach",
  });

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="coach" />
      <main className="pt-8">
        <AddUserExplainer variant="coach" ctaHref={signupUrl} ctaLabel="Invite a client" />
      </main>
      <MarketingFooter variant="coach" />
    </div>
  );
}
