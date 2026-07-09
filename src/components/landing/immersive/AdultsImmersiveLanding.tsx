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
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { AddUserTeaser } from "../shared/AddUserTeaser";
import { Reveal } from "@/components/motion/Reveal";
import { WhatsAppDemoBlock } from "../shared/WhatsAppDemoBlock";
import { DashboardPreviewBlock } from "../shared/DashboardPreviewBlock";
import dynamic from "next/dynamic";

const GymShaderBackground = dynamic(
  () => import("@/components/motion/GymShaderBackground").then((m) => ({ default: m.GymShaderBackground })),
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
    heading: "Your loved one sends a meal photo on WhatsApp",
    body: "One photo of their plate, sent as a normal WhatsApp message. No app to open, no sign-in required.",
    photo: "/landing/steps/adults-step-01.jpeg",
    photoAlt: "A person photographing their home-cooked meal at home",
  },
  {
    number: "02",
    heading: "Tistra estimates food, protein, and calories",
    body: "The system identifies the foods — without demanding gram-level precision. It notes what's there: protein sources, vegetables, grains. No calorie scoreboard.",
    photo: "/landing/steps/adults-step-02.jpeg",
    photoAlt: "A home-cooked meal on a plate",
  },
  {
    number: "03",
    heading: "They confirm or correct the meal, and you see simple summaries",
    body: "Meals shared on 5 of 7 days. Get a clear overview of their weekly trends to stay proactive — whether sharing a nutrition tip or suggesting a professional check up.",
    photo: "/landing/steps/adults-step-03.jpeg",
    photoAlt: "A family member checking on a loved one's wellbeing remotely",
  },
] as const;

export function AdultsImmersiveLanding({ variant, experimentId, showNav = true }: AdultsImmersiveLandingProps) {
  const signupUrl = getSignupUrl({ product: "adults", source: "family_landing", variant, experimentId, productParam: "family" });

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
          <GymShaderBackground className="w-full h-full" />
        </div>

        {/* Text — left */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-6 md:px-14 pt-24 pb-12 md:py-32">
          <Reveal>
            <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-4">
              For families, anywhere
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
              Support a loved one&apos;s<br />
              <span className="text-[#6750A4]">nutrition from anywhere.</span>
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-base md:text-xl text-gray-700 mb-8 leading-relaxed max-w-md">
              Whether your parent, partner, or family member lives across town or across the world, Tistra helps
              them log meals through WhatsApp and gives you simple nutrition summaries with their permission.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href={signupUrl} onClick={handleCta}
                className="bg-[#6750A4] text-white font-bold rounded-full px-8 py-4 text-base hover:bg-[#4F378A] transition-colors shadow-lg shadow-[#E9DDFF] text-center">
                Support a family member →
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Hero image — right */}
        <div className="relative w-full md:w-[52%] h-72 md:h-auto flex-shrink-0">
          <Image
            src="/landing/adults/immersive/hero/adults-hero.jpeg"
            alt="An older adult at home, photographing their meal"
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

      {/* ── Demo: WhatsApp side + family dashboard side ─────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <WhatsAppDemoBlock
            senderLine="Sends a lunch photo"
            reply="Looks like rice, chicken, vegetables, and yogurt. Estimated: 28g protein · 620 kcal. Reply Yes to save."
          />
          <DashboardPreviewBlock
            heading="This week"
            lines={[
              "15 meals logged",
              "Protein low on 3 days",
              "Good vegetable variety",
              "2 missed dinner logs",
            ]}
          />
        </div>
      </section>

      {/* ── Who this is for / what this is not ──────────────────────────────── */}
      <section className="py-20 px-6 bg-[#F3EEFB]">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Who this is for</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              {[
                "Families living in different cities or countries",
                "Adult children supporting aging parents",
                "Partners helping each other stay consistent",
                "Families who want nutrition awareness without constant checking",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-[#6750A4] flex-shrink-0">✓</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">What this is not</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              {[
                "Not an emergency monitoring system",
                "Not a medical device",
                "Not a replacement for a doctor or dietitian",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-gray-400 flex-shrink-0">–</span>{item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Add a family member (setup/invite) — short teaser, full explainer lives on its own page ── */}
      <AddUserTeaser variant="family" href="/family/add-users" />

      {/* ── Consent, not surveillance ────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Built for support, not surveillance</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-gray-500 text-center text-lg mb-14 max-w-xl mx-auto">
              Your parent or family member stays in control, every step of the way.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                heading: "Invite them on WhatsApp",
                body: "Your parent or family member receives a simple invite.",
              },
              {
                step: "2",
                heading: "They choose what to share",
                body: "They approve meal sharing and control what Tistra shows.",
              },
              {
                step: "3",
                heading: "You see gentle weekly patterns",
                body: "You get trends and helpful nudges, not private monitoring.",
              },
            ].map((item) => (
              <Reveal key={item.step}>
                <div className="bg-[#F3EEFB] rounded-2xl p-7 border border-[#E9DDFF] text-center">
                  <div className="w-10 h-10 rounded-full bg-[#6750A4] text-white font-bold flex items-center justify-center mx-auto mb-4">
                    {item.step}
                  </div>
                  <p className="font-bold text-gray-900 text-lg mb-2">{item.heading}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.body}</p>
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
            &ldquo;My mother lives alone. This gives me peace of mind without making her feel watched.&rdquo;
          </blockquote>
          <p className="text-sm text-gray-500">— Sanjana R., daughter</p>
        </Reveal>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <GymShaderBackground className="w-full h-full opacity-60" />
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
              Support a family member →
            </Link>
          </Reveal>
        </div>
      </section>

      <MarketingFooter variant="family" />
    </div>
  );
}
