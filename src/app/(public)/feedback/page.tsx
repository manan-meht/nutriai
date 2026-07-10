import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";

export function generateMetadata(): Metadata {
  return {
    title: "Feedback — Tistra Health",
    description: "Tell the Tistra Health team what's working, what's not, and what you'd like to see.",
    alternates: { canonical: "/feedback" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Public feedback page — reached from the footer on every marketing page
// (see MarketingFooter / LandingFooter). Reuses the exact same FeedbackForm
// as the logged-in dashboard's modal (see FeedbackModal), just embedded
// directly on the page instead of inside a dialog, since wiring modal
// state through every public marketing page (several of which are plain
// server components) isn't worth it for one link in the footer.
//
// Deliberately a plain static page (no session lookup, no edge runtime) —
// a logged-in visitor doesn't get their email prefilled here the way they
// do in the dashboard's FeedbackModal, but every dynamic route costs a
// near-fixed ~1-1.5MB of framework overhead in the compiled Cloudflare
// Worker (see next-on-pages build output / commit history), and this app
// has already hit that 25MB platform limit once — not worth spending a
// route's worth of budget on a minor convenience for the small overlap of
// visitors who are both logged in and land on the public footer link.
export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Feedback</h1>
        <p className="text-gray-500 text-sm mb-10">
          Tell us what&apos;s working, what&apos;s not, or what you&apos;d like to see next — we read every
          submission.
        </p>

        <FeedbackForm source="website" />
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
