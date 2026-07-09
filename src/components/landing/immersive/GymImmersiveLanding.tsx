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
import { Reveal } from "@/components/motion/Reveal";
import { DashboardPreviewBlock } from "../shared/DashboardPreviewBlock";
import dynamic from "next/dynamic";

const GymShaderBackground = dynamic(
  () => import("@/components/motion/GymShaderBackground").then((m) => ({ default: m.GymShaderBackground })),
  { ssr: false }
);

interface GymImmersiveLandingProps {
  variant: LandingVariant;
  experimentId?: string;
  /** The /coach route renders its own shared MarketingHeader above this
   * component instead — set false there to avoid stacking two navs.
   * Defaults true so the coach.tistrahealth.com subdomain (which doesn't
   * pass this) keeps its existing standalone nav unchanged. */
  showNav?: boolean;
}

const STEPS = [
  {
    number: "01",
    heading: "Client sends a meal photo on WhatsApp",
    body: "No app to download, no forms to fill.",
  },
  {
    number: "02",
    heading: "Tistra estimates food, portions, calories, protein, and meal patterns",
    body: "Honest ranges, not false precision.",
  },
  {
    number: "03",
    heading: "Client confirms, and you see who needs attention",
    body: "Your dashboard shows exactly where to focus.",
  },
] as const;

const WORKFLOW_CARDS = [
  {
    icon: "📸",
    title: "WhatsApp-first logging",
    desc: "Clients send photos or messages. No new app, no long food diary.",
  },
  {
    icon: "📊",
    title: "Coach dashboard",
    desc: "See missed logs, meal balance, consistency, and nutrition gaps across your roster.",
  },
  {
    icon: "✅",
    title: "Better check-ins",
    desc: "Spend less time chasing updates and more time coaching the clients who need support.",
  },
] as const;

export function GymImmersiveLanding({ variant, experimentId, showNav = true }: GymImmersiveLandingProps) {
  const signupUrl = getSignupUrl({ product: "gym", source: "coach_landing", variant, experimentId, productParam: "coach" });

  function handleCta() {
    storeLandingAttribution({ product: "gym", variant, experimentId, clickedAt: Date.now() });
    trackLandingEvent("landing_hero_cta_clicked", {
      product: "gym", variant, experimentId: experimentId ?? "",
      selectionMode: "ab_test", deviceCategory: "desktop",
    });
  }

  return (
    <div className="bg-white text-gray-900">
      {showNav && <LandingNav product="gym" variant={variant} experimentId={experimentId} />}

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
              For coaches, anywhere
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
              AI food logging that<br />
              <span className="text-[#6750A4]">gives coaches an edge.</span>
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-base md:text-xl text-gray-700 mb-4 leading-relaxed max-w-md">
              Clients send meal photos on WhatsApp. Tistra turns them into nutrition insights, so
              you can give specific, data-backed guidance instead of guessing what they ate.
            </p>
          </Reveal>
          <Reveal delay={250}>
            <p className="text-sm md:text-base text-gray-500 mb-8 leading-relaxed max-w-md">
              See meal balance, calories, protein, consistency, and who needs a timely check-in —
              all from one coach dashboard.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href={signupUrl} onClick={handleCta}
                className="bg-[#6750A4] text-white font-bold rounded-full px-8 py-4 text-base hover:bg-[#4F378A] transition-colors shadow-lg shadow-[#E9DDFF] text-center">
                Start coaching smarter →
              </Link>
              <Link href="#how-it-works"
                className="text-[#6750A4] font-bold rounded-full px-8 py-4 text-base border border-[#E9DDFF] hover:bg-[#F3EEFB] transition-colors text-center">
                See how it works
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Hero image — right */}
        <div className="relative w-full md:w-[52%] h-72 md:h-auto flex-shrink-0">
          <Image
            src="/landing/gym/immersive/hero/gym-hero.jpeg"
            alt="Fitness client photographing his meal at the gym"
            fill priority
            sizes="(max-width: 768px) 100vw, 52vw"
            className="object-cover object-center"
          />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-14 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-3 text-center">How it works</p>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-10">Three steps. Zero friction.</h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <Reveal key={step.number} delay={i * 100}>
                <div>
                  <p className="text-4xl font-black text-[#E9DDFF] mb-2 leading-none">{step.number}</p>
                  <h3 className="text-lg font-bold mb-1">{step.heading}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for real coaching workflows (merged features + benefits + dashboard demo) ── */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Built for real coaching workflows</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-gray-500 text-center text-lg mb-10 max-w-2xl mx-auto">
              Tistra helps you see which clients are consistent, which meals need attention, and who
              needs a timely check-in — without chasing manual food logs.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {WORKFLOW_CARDS.map((f) => (
              <Reveal key={f.title}>
                <div className="bg-gray-50 rounded-2xl p-6">
                  <p className="text-3xl mb-3">{f.icon}</p>
                  <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <DashboardPreviewBlock
            heading="Today's roster"
            lines={[
              "Rohan: missed 3 logs",
              "Priya: meals low on protein and variety",
              "Alex: consistent this week",
              "Sara: needs check-in",
            ]}
          />
        </div>
      </section>

      {/* ── Quote ─────────────────────────────────────────────────────────── */}
      <section className="py-12 px-6 text-center max-w-xl mx-auto">
        <Reveal>
          <blockquote className="text-xl md:text-2xl font-medium text-gray-800 leading-relaxed mb-3">
            &ldquo;I used to guess what my clients were eating. Now I know — and they barely have to do anything extra.&rdquo;
          </blockquote>
          <p className="text-sm text-gray-500">— Vikram S., fitness coach</p>
        </Reveal>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <GymShaderBackground className="w-full h-full opacity-40" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
              Ready to coach your roster with less chasing?
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="text-gray-600 text-lg mb-8">Start with your first client. No credit card required.</p>
          </Reveal>
          <Reveal delay={300}>
            <Link href={signupUrl} onClick={handleCta}
              className="bg-[#6750A4] text-white font-bold rounded-full px-10 py-5 text-lg hover:bg-[#4F378A] transition-colors shadow-xl shadow-[#E9DDFF] inline-block">
              Start free →
            </Link>
          </Reveal>
        </div>
      </section>

      <MarketingFooter variant="coach" />
    </div>
  );
}
