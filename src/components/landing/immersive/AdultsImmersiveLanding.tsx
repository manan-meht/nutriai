"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { LandingVariant } from "@/types";
import {
  getSignupUrl,
  trackLandingEvent,
  storeLandingAttribution,
} from "@/lib/landing/routes";
import { LandingNav } from "../shared/LandingNav";
import { LandingFooter } from "../shared/LandingFooter";
import { Reveal } from "@/components/motion/Reveal";
import dynamic from "next/dynamic";

const AdultsShaderBackground = dynamic(
  () => import("@/components/motion/AdultsShaderBackground").then((m) => ({ default: m.AdultsShaderBackground })),
  { ssr: false }
);

interface AdultsImmersiveLandingProps {
  variant: LandingVariant;
  experimentId?: string;
  /** The /family route renders its own shared MarketingHeader above this
   * component instead — set false there to avoid stacking two navs.
   * Defaults true so the family.tistrahealth.com subdomain (which doesn't
   * pass this) keeps its existing standalone nav unchanged. */
  showNav?: boolean;
}

const STEPS = [
  {
    number: "01",
    heading: "A parent shares a photo of their meal",
    body: "They photograph their thali — dal, roti, sabzi, dahi. One WhatsApp message. No app to open, no sign-in required.",
    photo: "/landing/steps/adults-step-01.jpeg",
    photoAlt: "Older Indian woman photographing her steel thali at home",
  },
  {
    number: "02",
    heading: "AI highlights the essentials",
    body: "The system identifies the foods — without demanding gram-level precision. It notes what's there: protein sources, vegetables, grains. No calorie scoreboard.",
    photo: "/landing/steps/adults-step-02.jpeg",
    photoAlt: "A home-cooked steel thali with dal, roti and sabzi",
  },
  {
    number: "03",
    heading: "Big picture, actionable data",
    body: "Meals shared on 5 of 7 days. Get a clear overview of their weekly trends to stay proactive — whether sharing a nutrition tip or suggesting a professional check up.",
    photo: "/landing/steps/adults-step-03.jpeg",
    photoAlt: "A daughter checking on her mother's wellbeing remotely",
  },
] as const;

export function AdultsImmersiveLanding({ variant, experimentId, showNav = true }: AdultsImmersiveLandingProps) {
  const signupUrl = getSignupUrl({ product: "adults", source: "landing", variant, experimentId });

  function handleCta() {
    storeLandingAttribution({ product: "adults", variant, experimentId, clickedAt: Date.now() });
    trackLandingEvent("landing_hero_cta_clicked", {
      product: "adults", variant, experimentId: experimentId ?? "",
      selectionMode: "ab_test", deviceCategory: "desktop",
    });
  }

  return (
    <div className="bg-white text-gray-900">
      {showNav && <LandingNav product="adults" variant={variant} experimentId={experimentId} />}

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-[90vh] flex flex-col md:flex-row">
        {/* Background shader fills left panel */}
        <div className="absolute inset-0 md:w-1/2" aria-hidden="true">
          <AdultsShaderBackground className="w-full h-full" />
        </div>

        {/* Text — left */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-6 md:px-14 pt-24 pb-12 md:py-32">
          <Reveal>
            <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-4">
              For families across India
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
              Know they&apos;re eating well.<br />
              <span className="text-[#6750A4]">Without the worry.</span>
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-base md:text-xl text-gray-700 mb-8 leading-relaxed max-w-md">
              Your parents simply snap a photo of their meal. You get daily awareness and a weekly
              nutrition summary, giving you the exact insights to take timely action for their health.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href={signupUrl} onClick={handleCta}
                className="bg-[#6750A4] text-white font-bold rounded-full px-8 py-4 text-base hover:bg-[#4F378A] transition-colors shadow-lg shadow-[#E9DDFF] text-center">
                Help a parent →
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Hero image — right */}
        <div className="relative w-full md:w-[52%] h-72 md:h-auto flex-shrink-0">
          <Image
            src="/landing/adults/immersive/hero/adults-hero.jpeg"
            alt="An older Indian woman at home, photographing her meal"
            fill priority
            sizes="(max-width: 768px) 100vw, 52vw"
            className="object-cover object-center"
          />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#F3EEFB]">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-3 text-center">How it works</p>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Simple for them. Reassuring for you.</h2>
          </Reveal>

          <div className="flex flex-col gap-16">
            {STEPS.map((step, i) => (
              <Reveal key={step.number} delay={i * 100}>
                <div className={`flex flex-col ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} gap-8 md:gap-14 items-center`}>
                  {/* Photo */}
                  <div className="w-full md:w-1/2 rounded-3xl overflow-hidden shadow-xl flex-shrink-0">
                    <div className="relative w-full h-60 md:h-80">
                      <Image src={step.photo} alt={step.photoAlt} fill
                        sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                    </div>
                  </div>
                  {/* Text */}
                  <div className="flex-1">
                    <p className="text-5xl font-black text-[#E9DDFF] mb-3 leading-none">{step.number}</p>
                    <h3 className="text-2xl md:text-3xl font-bold mb-4">{step.heading}</h3>
                    <p className="text-base md:text-lg text-gray-600 leading-relaxed">{step.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Their privacy. Their choice. Always.</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-gray-500 text-center text-lg mb-14 max-w-xl mx-auto">
              The older adult controls exactly what gets shared. Family supporters see only what they&apos;re allowed to see.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                what: "Meal photos",
                who: "Off by default",
                detail: "They choose to share photos — or just descriptions. Changeable any time.",
              },
              {
                what: "Weekly summaries",
                who: "Only if they agree",
                detail: "They control what the summary includes, and who can see it.",
              },
              {
                what: "Goals",
                who: "They accept or decline",
                detail: "A family member may suggest a goal. Only the parent can activate it.",
              },
            ].map((item) => (
              <Reveal key={item.what}>
                <div className="bg-[#F3EEFB] rounded-2xl p-7 border border-[#E9DDFF]">
                  <p className="font-bold text-gray-900 text-lg mb-1">{item.what}</p>
                  <p className="text-sm font-semibold text-[#4F378A] mb-3">{item.who}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quote ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 text-center max-w-2xl mx-auto">
        <Reveal>
          <blockquote className="text-2xl md:text-3xl font-medium text-gray-800 leading-relaxed mb-4">
            &ldquo;My mother lives alone in Hyderabad. This gives me peace of mind without making her feel watched.&rdquo;
          </blockquote>
          <p className="text-sm text-gray-500">— Sanjana R., daughter, Dubai</p>
        </Reveal>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <AdultsShaderBackground className="w-full h-full opacity-60" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight">
              Start with one meal.<br />
              <span className="text-[#6750A4]">Stay connected, effortlessly.</span>
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="text-gray-600 text-lg mb-10">Free to try. Your parent sets their own sharing preferences.</p>
          </Reveal>
          <Reveal delay={300}>
            <Link href={signupUrl} onClick={handleCta}
              className="bg-[#6750A4] text-white font-bold rounded-full px-10 py-5 text-lg hover:bg-[#4F378A] transition-colors shadow-xl shadow-[#E9DDFF] inline-block">
              Help a parent →
            </Link>
          </Reveal>
        </div>
      </section>

      <LandingFooter product="adults" />
    </div>
  );
}
