export const dynamic = "force-dynamic";
export const runtime = "edge";

import type { Metadata } from "next";
import Link from "next/link";
import { faviconForProduct } from "@/lib/product/icons";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";

export function generateMetadata(): Metadata {
  return {
    title: "Tistra Health — Track your own meals through WhatsApp",
    description:
      "Track your own meals through WhatsApp. No calorie counting. No complicated app. See your own weekly progress dashboard.",
    alternates: { canonical: "/me" },
    icons: { icon: faviconForProduct("adults") },
  };
}

// Self-tracking marketing page. Reuses the adults product's signup/login
// (same account system, dashboard, and WhatsApp bot) — the "self" flag
// only controls which onboarding step runs after signup (creating a
// tracked profile for the signed-up user themself, relationship "self",
// instead of inviting someone else). See SELF_TRACKING_ENABLED.
export default function TrackMyselfPage() {
  const signupUrl =
    getSignupUrl({ product: "adults", source: "landing", variant: "standard" }) +
    "&next=" + encodeURIComponent("/adults/dashboard?self=1");
  const loginUrl = getLoginUrl({ product: "adults", source: "landing" });

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-gray-900">Tistra Health</Link>
          <Link href={loginUrl} className="text-sm font-medium text-gray-600 hover:text-purple-700">Login</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
          Track your own meals through WhatsApp.
        </h1>
        <p className="text-lg text-gray-600 mb-10">
          No calorie counting. No complicated app. Send a photo or a few words whenever you eat, and see your own
          weekly progress dashboard.
        </p>
        <Link
          href={signupUrl}
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-10 py-4 rounded-full font-semibold transition-colors"
        >
          Start tracking myself
        </Link>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="bg-gray-50 rounded-2xl p-6">
            <div className="text-2xl mb-3">💬</div>
            <h3 className="font-bold text-gray-900 mb-2">Connect WhatsApp</h3>
            <p className="text-sm text-gray-600">Add your own number — no app install needed.</p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-6">
            <div className="text-2xl mb-3">🍽️</div>
            <h3 className="font-bold text-gray-900 mb-2">Log meals easily</h3>
            <p className="text-sm text-gray-600">Send a photo or describe what you ate — that&apos;s it.</p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-6">
            <div className="text-2xl mb-3">📈</div>
            <h3 className="font-bold text-gray-900 mb-2">See your progress</h3>
            <p className="text-sm text-gray-600">A calm weekly summary of your own eating patterns.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
