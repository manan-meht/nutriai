import React from "react";
import Link from "next/link";
import type { LandingVariant } from "@/types";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { LandingNav } from "../shared/LandingNav";
import { LandingFooter } from "../shared/LandingFooter";

interface AdultsStandardLandingProps {
  variant: LandingVariant;
  experimentId?: string;
}

/**
 * Older Adults / Family — Variant A — standard landing page.
 * Warm, calm, reassuring. Accessible. Fast.
 */
export function AdultsStandardLanding({ variant, experimentId }: AdultsStandardLandingProps) {
  const signupUrl = getSignupUrl({ product: "adults", source: "landing", variant, experimentId });
  const loginUrl = getLoginUrl({ product: "adults", source: "landing" });

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingNav product="adults" variant={variant} experimentId={experimentId} />

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 text-center max-w-3xl mx-auto">
        <p className="text-sm font-semibold text-rose-600 uppercase tracking-widest mb-4">
          For families and older adults
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-6">
          Stay gently connected to
          <br />
          <span className="text-rose-600">how Mum or Dad is eating.</span>
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
          Your parent shares a quick photo or description of what they ate. You see a calm
          weekly summary — no numbers, no scoring, just a reassuring picture of how things
          are going. All on their terms.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={signupUrl}
            className="bg-rose-600 text-white font-semibold rounded-full px-8 py-4 text-base hover:bg-rose-700 transition-colors"
          >
            Support a family member
          </Link>
          <Link
            href={loginUrl}
            className="text-gray-600 font-medium underline underline-offset-2 hover:text-gray-900"
          >
            Sign in to your account
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-rose-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">How it works</h2>
          <ol className="space-y-8">
            {[
              {
                step: "1",
                title: "They share a photo or a few words",
                body: "Your parent takes a quick photo of their thali, or just types \"had idli and sambar for breakfast\". That's all they need to do.",
              },
              {
                step: "2",
                title: "They confirm what they had",
                body: "The app shows what it identified and asks if that looks right. They can correct anything. Their meal, their words.",
              },
              {
                step: "3",
                title: "You see a calm weekly picture",
                body: "Each week you get a simple summary — are they eating regularly? Are there any gentle patterns worth knowing about? Nothing alarming, just awareness.",
              },
              {
                step: "4",
                title: "Their privacy, always",
                body: "They choose exactly what to share with you. Photos, descriptions, summaries — all controlled by them, not you.",
              },
            ].map((s) => (
              <li key={s.step} className="flex gap-5 items-start">
                <span className="shrink-0 w-9 h-9 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-sm">
                  {s.step}
                </span>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">{s.title}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Reassurance section */}
      <section className="py-16 px-6 max-w-3xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-6">Not a medical app. Not a diet tracker.</h2>
        <p className="text-gray-600 leading-relaxed">
          This isn&apos;t about calories or macros or ideal meals. It&apos;s about gentle
          awareness — knowing that your parent is eating something warm and regular, that their
          appetite seems okay, that nothing feels like it&apos;s quietly changing. The kind of
          thing you&apos;d know if you lived nearby.
        </p>
      </section>

      {/* Quote */}
      <section className="py-16 px-6 bg-rose-50 text-center max-w-3xl mx-auto">
        <blockquote className="text-xl font-medium text-gray-800 mb-4">
          &ldquo;My mother lives in Pune, I live in Singapore. This is the closest I&apos;ve
          felt to her daily life in years.&rdquo;
        </blockquote>
        <p className="text-sm text-gray-500">— Ananya K., daughter</p>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-rose-600 text-white text-center">
        <h2 className="text-3xl font-bold mb-4">Start with one family member</h2>
        <p className="text-rose-200 mb-8 max-w-xl mx-auto">
          Free to try. Invite your parent when you&apos;re ready. They set their own sharing
          preferences.
        </p>
        <Link
          href={signupUrl}
          className="bg-white text-rose-700 font-bold rounded-full px-8 py-4 hover:bg-rose-50 transition-colors inline-block"
        >
          Create a family account
        </Link>
      </section>

      <LandingFooter product="adults" />
    </div>
  );
}
