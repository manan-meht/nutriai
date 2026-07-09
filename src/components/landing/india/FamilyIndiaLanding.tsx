"use client";

import Link from "next/link";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { Reveal } from "@/components/motion/Reveal";
import { ProductMechanicSteps } from "@/components/landing/shared/ProductMechanicSteps";
import { WhatsAppDemoBlock } from "@/components/landing/shared/WhatsAppDemoBlock";
import { DashboardPreviewBlock } from "@/components/landing/shared/DashboardPreviewBlock";
import { getSignupUrl, trackLandingEvent, storeLandingAttribution } from "@/lib/landing/routes";

export function FamilyIndiaLanding() {
  const signupUrl = getSignupUrl({ product: "adults", source: "family_india", variant: "immersive", productParam: "family" });

  function handleCta() {
    storeLandingAttribution({ product: "adults", variant: "immersive", clickedAt: Date.now() });
    trackLandingEvent("landing_hero_cta_clicked", {
      product: "adults", variant: "immersive", experimentId: "",
      selectionMode: "immersive_only", deviceCategory: "desktop",
    });
  }

  return (
    <div className="bg-white text-gray-900">
      <MarketingHeader variant="family" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <Reveal>
          <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-4">Family · India</p>
        </Reveal>
        <Reveal delay={100}>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
            Worried about your parents&apos; meals in India?
          </h1>
        </Reveal>
        <Reveal delay={200}>
          <p className="text-base md:text-xl text-gray-700 mb-8 leading-relaxed max-w-2xl mx-auto">
            Your parent sends meal photos on WhatsApp. Tistra identifies Indian meals, estimates protein and
            calories, and gives you a calm weekly picture of how they&apos;re eating — with their permission.
          </p>
        </Reveal>
        <Reveal delay={300}>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={signupUrl} onClick={handleCta}
              className="bg-[#6750A4] text-white font-bold rounded-full px-8 py-4 text-base hover:bg-[#4F378A] transition-colors shadow-lg shadow-[#E9DDFF] text-center">
              Start with your parent →
            </Link>
            <a href="mailto:tistrahealth@gmail.com?subject=Join%20the%20India%20Family%20waitlist"
              className="border-2 border-[#6750A4] text-[#4F378A] font-bold rounded-full px-8 py-4 text-base hover:bg-[#F3EEFB] transition-colors text-center">
              Join the India Family waitlist
            </a>
          </div>
        </Reveal>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <ProductMechanicSteps
        eyebrow="How it works"
        heading="Simple for them. Reassuring for you."
        className="bg-[#F3EEFB]"
        steps={[
          { title: "Your parent sends a food photo on WhatsApp", description: "One message, no app to open." },
          { title: "Tistra identifies Indian meals", description: "Dal, rice, roti, sabzi, curd, poha, dosa, idli, paneer, chicken curry, and snacks." },
          { title: "Your parent confirms or corrects the estimate", description: "One reply, or a quick correction." },
          { title: "You see simple weekly insights", description: "Without constantly checking on them." },
        ]}
      />

      {/* ── Demo ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <WhatsAppDemoBlock
            senderLine="Sends lunch photo"
            reply="Looks like rice, dal, sabzi, and curd. Estimated: 18g protein · 520 kcal. Reply Yes to save."
            confirmLine="Yes"
            confirmReply="Saved as lunch."
          />
          <DashboardPreviewBlock
            heading="This week"
            lines={[
              "16 meals logged",
              "Protein was low on 4 days",
              "Breakfast was skipped twice",
              "Good dal/curd intake",
              "Vegetable variety could improve",
            ]}
          />
        </div>
      </section>

      {/* ── Emotional copy ───────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#F3EEFB]">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal>
            <h2 className="text-2xl md:text-3xl font-bold mb-10">Awareness, without making them feel monitored</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            {[
              "You do not need to ask “Did you eat properly?” every day",
              "They do not need to use a complicated app",
              "WhatsApp is enough",
              "You get awareness without making them feel monitored",
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

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold mb-5 leading-tight">Start with one meal.</h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="text-gray-600 text-lg mb-10">Free to try. Your parent sets their own sharing preferences.</p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={signupUrl} onClick={handleCta}
                className="bg-[#6750A4] text-white font-bold rounded-full px-10 py-5 text-lg hover:bg-[#4F378A] transition-colors shadow-xl shadow-[#E9DDFF] inline-block">
                Start with your parent →
              </Link>
              <a href="mailto:tistrahealth@gmail.com?subject=Join%20the%20India%20Family%20waitlist"
                className="border-2 border-[#6750A4] text-[#4F378A] font-bold rounded-full px-10 py-5 text-lg hover:bg-[#F3EEFB] transition-colors inline-block">
                Join the India Family waitlist
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <MarketingFooter variant="family" />
    </div>
  );
}
