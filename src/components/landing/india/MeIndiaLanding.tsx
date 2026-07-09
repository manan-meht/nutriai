"use client";

import Link from "next/link";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { Reveal } from "@/components/motion/Reveal";
import { ProductMechanicSteps } from "@/components/landing/shared/ProductMechanicSteps";
import { WhatsAppDemoBlock } from "@/components/landing/shared/WhatsAppDemoBlock";
import { DashboardPreviewBlock } from "@/components/landing/shared/DashboardPreviewBlock";
import { getSignupUrl, trackLandingEvent, storeLandingAttribution } from "@/lib/landing/routes";

export function MeIndiaLanding() {
  const signupUrl =
    getSignupUrl({ product: "adults", source: "me_india", variant: "immersive", productParam: "me" }) +
    "&next=" + encodeURIComponent("/adults/dashboard?self=1");

  function handleCta() {
    storeLandingAttribution({ product: "adults", variant: "immersive", clickedAt: Date.now() });
    trackLandingEvent("landing_hero_cta_clicked", {
      product: "adults", variant: "immersive", experimentId: "",
      selectionMode: "immersive_only", deviceCategory: "desktop",
    });
  }

  return (
    <div className="bg-white text-gray-900">
      <MarketingHeader variant="me" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <Reveal>
          <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-4">Me · India</p>
        </Reveal>
        <Reveal delay={100}>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
            Track Indian meals from WhatsApp.
          </h1>
        </Reveal>
        <Reveal delay={200}>
          <p className="text-base md:text-xl text-gray-700 mb-8 leading-relaxed max-w-2xl mx-auto">
            Send photos of dal, rice, roti, sabzi, dosa, idli, poha, paneer, chicken curry, snacks, tea, and
            more. Tistra estimates protein and calories, then helps you understand your eating patterns.
          </p>
        </Reveal>
        <Reveal delay={300}>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={signupUrl} onClick={handleCta}
              className="bg-[#6750A4] text-white font-bold rounded-full px-8 py-4 text-base hover:bg-[#4F378A] transition-colors shadow-lg shadow-[#E9DDFF] text-center">
              Start tracking Indian meals →
            </Link>
            <a href="mailto:tistrahealth@gmail.com?subject=Join%20the%20India%20Personal%20waitlist"
              className="border-2 border-[#6750A4] text-[#4F378A] font-bold rounded-full px-8 py-4 text-base hover:bg-[#F3EEFB] transition-colors text-center">
              Join the India personal waitlist
            </a>
          </div>
        </Reveal>
      </section>

      {/* ── Why it helps ─────────────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-[#F3EEFB]">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Why it helps</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              "Indian meals are hard to log manually",
              "Home-cooked portions vary",
              "Protein is easy to underestimate",
              "You do not need to search for every food item",
              "WhatsApp makes it simple",
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
        heading="Four steps, every meal."
        className="bg-white"
        steps={[
          { title: "Send your meal photo on WhatsApp", description: "No app to open." },
          { title: "Tistra estimates the food and portions", description: "Built for Indian dishes." },
          { title: "You confirm or correct it", description: "One reply, or a quick fix." },
          { title: "Get daily and weekly nutrition summaries", description: "No calorie scoreboard." },
        ]}
      />

      {/* ── Demo ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#F3EEFB]">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <WhatsAppDemoBlock
            senderLine="Sends thali photo"
            reply="Looks like rice, dal, mixed sabzi, curd, and 1 roti. Estimated: 21g protein · 610 kcal. Reply Yes to save."
          />
          <DashboardPreviewBlock
            heading="Today"
            lines={[
              "62g protein",
              "1,540 kcal",
              "3 meals logged",
              "Protein still needed: 28g",
            ]}
          />
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center bg-white">
        <div className="max-w-2xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold mb-10 leading-tight">Ready for stress-free nutrition awareness?</h2>
          </Reveal>
          <Reveal delay={150}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={signupUrl} onClick={handleCta}
                className="bg-[#6750A4] text-white font-bold rounded-full px-10 py-5 text-lg hover:bg-[#4F378A] transition-colors shadow-xl shadow-[#E9DDFF] inline-block">
                Start tracking Indian meals →
              </Link>
              <a href="mailto:tistrahealth@gmail.com?subject=Join%20the%20India%20Personal%20waitlist"
                className="border-2 border-[#6750A4] text-[#4F378A] font-bold rounded-full px-10 py-5 text-lg hover:bg-[#F3EEFB] transition-colors inline-block">
                Join the India personal waitlist
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <MarketingFooter variant="me" />
    </div>
  );
}
