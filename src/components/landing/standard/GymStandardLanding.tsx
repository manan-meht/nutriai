import React from "react";
import Link from "next/link";
import type { LandingVariant } from "@/types";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { LandingNav } from "../shared/LandingNav";
import { LandingFooter } from "../shared/LandingFooter";

interface GymStandardLandingProps {
  variant: LandingVariant;
  experimentId?: string;
}

/**
 * Gym Variant A — standard landing page.
 * Fast, clear, conventional. Safe fallback.
 */
export function GymStandardLanding({ variant, experimentId }: GymStandardLandingProps) {
  const signupUrl = getSignupUrl({ product: "gym", source: "landing", variant, experimentId });
  const loginUrl = getLoginUrl({ product: "gym", source: "landing" });

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingNav product="gym" variant={variant} experimentId={experimentId} />

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 text-center max-w-4xl mx-auto">
        <p className="text-sm font-semibold text-purple-600 uppercase tracking-widest mb-4">
          For Indian fitness coaches
        </p>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-6">
          Know exactly how your clients eat.
          <br />
          <span className="text-purple-600">Without the spreadsheets.</span>
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
          Your clients log meals from WhatsApp or the web. AI identifies dal, roti, sabzi and
          everything in between. You see who&apos;s on track, who needs a nudge, and what to
          coach next — all in one dashboard.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={signupUrl}
            className="bg-purple-600 text-white font-semibold rounded-full px-8 py-4 text-base hover:bg-purple-700 transition-colors"
          >
            Start with your clients
          </Link>
          <Link
            href={loginUrl}
            className="text-gray-600 font-medium underline underline-offset-2 hover:text-gray-900"
          >
            Sign in to your account
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Built for how Indian clients actually eat
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Knows Indian food",
                body: "AI trained on dal, roti, idli, biryani, sabzi — the actual meals your clients eat. Not Western meal plans.",
              },
              {
                title: "WhatsApp logging",
                body: "Clients share a photo or voice note. AI identifies the meal and asks a quick confirmation. Done in seconds.",
              },
              {
                title: "Coach dashboard",
                body: "See every client at a glance. Spot who's logging consistently, who's hitting protein, who needs your attention this week.",
              },
              {
                title: "Weekly reports you can approve",
                body: "AI drafts a weekly review for each client. You read, edit, add a note, and send. Your voice, their progress.",
              },
              {
                title: "Nutrition as ranges, not exact numbers",
                body: "We don't pretend to know exactly how much oil went into the sabzi. We give honest estimates — min to max.",
              },
              {
                title: "Training-day vs rest-day",
                body: "Set different targets for training days and rest days. Track protein timing around sessions.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-16 px-6 text-center max-w-3xl mx-auto">
        <blockquote className="text-xl font-medium text-gray-800 mb-4">
          &ldquo;Finally a nutrition tool that understands what a katori of dal actually means.&rdquo;
        </blockquote>
        <p className="text-sm text-gray-500">— Priya S., fitness trainer, Bengaluru</p>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 px-6 bg-purple-600 text-white text-center">
        <h2 className="text-3xl font-bold mb-4">
          Ready to coach smarter?
        </h2>
        <p className="text-purple-200 mb-8 max-w-xl mx-auto">
          Free to start. No credit card required. Invite your first client in minutes.
        </p>
        <Link
          href={signupUrl}
          className="bg-white text-purple-700 font-bold rounded-full px-8 py-4 hover:bg-purple-50 transition-colors inline-block"
        >
          Create your coach account
        </Link>
      </section>

      <LandingFooter product="gym" />
    </div>
  );
}
