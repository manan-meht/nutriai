"use client";

import Link from "next/link";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { Reveal } from "@/components/motion/Reveal";
import { ProductMechanicSteps } from "@/components/landing/shared/ProductMechanicSteps";
import { WhatsAppDemoBlock } from "@/components/landing/shared/WhatsAppDemoBlock";
import { DashboardPreviewBlock } from "@/components/landing/shared/DashboardPreviewBlock";
import { getSignupUrl, trackLandingEvent, storeLandingAttribution } from "@/lib/landing/routes";

export function CoachIndiaLanding() {
  const signupUrl = getSignupUrl({ product: "gym", source: "coach_india", variant: "immersive", productParam: "coach" });

  function handleCta() {
    storeLandingAttribution({ product: "gym", variant: "immersive", clickedAt: Date.now() });
    trackLandingEvent("landing_hero_cta_clicked", {
      product: "gym", variant: "immersive", experimentId: "",
      selectionMode: "immersive_only", deviceCategory: "desktop",
    });
  }

  return (
    <div className="bg-white text-gray-900">
      <MarketingHeader variant="coach" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <Reveal>
          <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-4">Coach · India</p>
        </Reveal>
        <Reveal delay={100}>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
            AI food logging for Indian fitness coaches.
          </h1>
        </Reveal>
        <Reveal delay={200}>
          <p className="text-base md:text-xl text-gray-700 mb-8 leading-relaxed max-w-2xl mx-auto">
            Your clients send meal photos on WhatsApp. Tistra identifies Indian meals, estimates protein and
            calories, and shows you who needs attention in your coach dashboard.
          </p>
        </Reveal>
        <Reveal delay={300}>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={signupUrl} onClick={handleCta}
              className="bg-[#6750A4] text-white font-bold rounded-full px-8 py-4 text-base hover:bg-[#4F378A] transition-colors shadow-lg shadow-[#E9DDFF] text-center">
              Start tracking clients →
            </Link>
            <a href="mailto:tistrahealth@gmail.com?subject=Join%20the%20India%20Coach%20waitlist"
              className="border-2 border-[#6750A4] text-[#4F378A] font-bold rounded-full px-8 py-4 text-base hover:bg-[#F3EEFB] transition-colors text-center">
              Join the India Coach waitlist
            </a>
          </div>
        </Reveal>
      </section>

      {/* ── Why Indian coaches need this ─────────────────────────────────── */}
      <section className="py-16 px-6 bg-[#F3EEFB]">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Why Indian coaches need this</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              "Clients do not consistently fill food diaries",
              "Indian meals are hard to track in Western calorie apps",
              "Portions vary: katori, roti, rice, sabzi, dal, paneer, poha, dosa, idli, biryani, snacks",
              "WhatsApp is already where clients communicate",
            ].map((item) => (
              <Reveal key={item}>
                <div className="flex items-start gap-3 bg-white rounded-xl px-5 py-4 border border-[#E9DDFF]">
                  <span className="text-[#6750A4] font-bold flex-shrink-0">✓</span>
                  <span className="text-gray-800 text-sm">{item}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <ProductMechanicSteps
        eyebrow="How it works"
        heading="Zero friction for your clients."
        className="bg-white"
        steps={[
          { title: "Client sends meal photo on WhatsApp", description: "No app, no forms." },
          { title: "Tistra identifies Indian food and estimates macros", description: "Honest ranges, not false precision." },
          { title: "Client confirms or corrects", description: "One reply, or a quick fix." },
          { title: "Coach sees compliance and nutrition risks", description: "Straight to your dashboard." },
        ]}
      />

      {/* ── Demo ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#F3EEFB]">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <WhatsAppDemoBlock
            senderLine="Sends dinner photo"
            reply="Looks like 2 rotis, dal, paneer sabzi, and salad. Estimated: 31g protein · 690 kcal. Reply Yes to save."
          />
          <DashboardPreviewBlock
            heading="Today"
            lines={[
              "8 clients below protein target",
              "5 clients missed lunch logs",
              "3 clients had high-calorie snacks",
              "12 clients fully logged meals",
            ]}
          />
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold mb-3 leading-tight">Ready to coach your entire roster?</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-gray-600 text-lg mb-10">Built especially well for Indian meals, but flexible enough for mixed diets.</p>
          </Reveal>
          <Reveal delay={200}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={signupUrl} onClick={handleCta}
                className="bg-[#6750A4] text-white font-bold rounded-full px-10 py-5 text-lg hover:bg-[#4F378A] transition-colors shadow-xl shadow-[#E9DDFF] inline-block">
                Start tracking clients →
              </Link>
              <a href="mailto:tistrahealth@gmail.com?subject=Join%20the%20India%20Coach%20waitlist"
                className="border-2 border-[#6750A4] text-[#4F378A] font-bold rounded-full px-10 py-5 text-lg hover:bg-[#F3EEFB] transition-colors inline-block">
                Join the India Coach waitlist
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <MarketingFooter variant="coach" />
    </div>
  );
}
