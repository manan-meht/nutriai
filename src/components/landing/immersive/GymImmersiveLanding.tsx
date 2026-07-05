"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { LandingVariant } from "@/types";
import {
  getSignupUrl,
  getLoginUrl,
  trackLandingEvent,
  storeLandingAttribution,
} from "@/lib/landing/routes";
import { LandingNav } from "../shared/LandingNav";
import { LandingFooter } from "../shared/LandingFooter";
import { Reveal } from "@/components/motion/Reveal";
import dynamic from "next/dynamic";

const GymShaderBackground = dynamic(
  () => import("@/components/motion/GymShaderBackground").then((m) => ({ default: m.GymShaderBackground })),
  { ssr: false }
);

interface GymImmersiveLandingProps {
  variant: LandingVariant;
  experimentId?: string;
}

const STEPS = [
  {
    number: "01",
    heading: "Client logs from WhatsApp",
    body: "They send a photo of their meal — chicken curry, dal, idli, whatever they ate. No app to open. No form to fill.",
    photo: "/landing/steps/gym-step-01.jpeg",
    photoAlt: "Indian fitness client photographing his meal",
  },
  {
    number: "02",
    heading: "AI identifies the food",
    body: "The system recognises Indian dishes and cross-references the national nutrition database. Protein, calories, macros — as honest ranges, not false precision.",
    photo: "/landing/steps/gym-step-02.jpeg",
    photoAlt: "Overhead flat-lay of a home-cooked Indian meal",
  },
  {
    number: "03",
    heading: "You see who needs attention",
    body: "Your dashboard shows every client's week at a glance. Rohan hasn't logged in 3 days. Priya's protein is low. Your attention goes exactly where it should.",
    photo: "/landing/steps/gym-step-03.jpeg",
    photoAlt: "Fitness coach reviewing client progress on a tablet",
  },
] as const;

const MEALS = [
  { name: "Dal, Rice & Sabzi", protein: "22–28g protein", src: "/landing/gym/immersive/meals/dal-rice-sabzi.jpeg" },
  { name: "Paneer Roti", protein: "18–24g protein", src: "/landing/gym/immersive/meals/paneer-roti.jpeg" },
  { name: "Idli Sambar", protein: "8–12g protein", src: "/landing/gym/immersive/meals/idli-sambar.jpeg" },
  { name: "Poha & Eggs", protein: "20–26g protein", src: "/landing/gym/immersive/meals/poha-eggs.jpeg" },
  { name: "Chicken Curry Rice", protein: "32–40g protein", src: "/landing/gym/immersive/meals/chicken-curry-rice.jpeg" },
  { name: "Whey + Banana Smoothie", protein: "28–32g protein", src: "/landing/gym/immersive/meals/whey-smoothie.jpeg" },
];

export function GymImmersiveLanding({ variant, experimentId }: GymImmersiveLandingProps) {
  const signupUrl = getSignupUrl({ product: "gym", source: "landing", variant, experimentId });
  const loginUrl = getLoginUrl({ product: "gym", source: "landing" });

  function handleCta() {
    storeLandingAttribution({ product: "gym", variant, experimentId, clickedAt: Date.now() });
    trackLandingEvent("landing_hero_cta_clicked", {
      product: "gym", variant, experimentId: experimentId ?? "",
      selectionMode: "ab_test", deviceCategory: "desktop",
    });
  }

  return (
    <div className="bg-white text-gray-900">
      <LandingNav product="gym" variant={variant} experimentId={experimentId} />

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
              For Indian fitness coaches
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
              Your clients eat.<br />
              <span className="text-[#6750A4]">You coach smarter.</span>
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-base md:text-xl text-gray-700 mb-8 leading-relaxed max-w-md">
              Indian meals, AI identification, WhatsApp logging. A dashboard
              that shows you who needs attention — before they ask.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href={signupUrl} onClick={handleCta}
                className="bg-[#6750A4] text-white font-bold rounded-full px-8 py-4 text-base hover:bg-[#4F378A] transition-colors shadow-lg shadow-[#E9DDFF] text-center">
                Start with your clients
              </Link>
              <Link href={loginUrl}
                className="text-gray-600 font-medium underline underline-offset-2 hover:text-gray-900 self-center text-sm">
                Sign in
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Hero image — right */}
        <div className="relative w-full md:w-[52%] h-72 md:h-auto flex-shrink-0">
          <Image
            src="/landing/gym/immersive/hero/gym-hero.jpeg"
            alt="Indian fitness client photographing his meal at the gym"
            fill priority
            sizes="(max-width: 768px) 100vw, 52vw"
            className="object-cover object-center"
          />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-3 text-center">How it works</p>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Three steps. Zero friction.</h2>
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

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Built for how India eats</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-gray-500 text-center text-lg mb-14 max-w-xl mx-auto">
              Not adapted from Western apps. Designed from the ground up for Indian fitness coaching.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "📸",
                title: "WhatsApp logging",
                desc: "Clients log by sending a photo or a message. No new app to learn. Compliance is 3× higher than form-based logging.",
              },
              {
                icon: "🧠",
                title: "Indian food AI",
                desc: "Recognises regional dishes, home-cooked thalis, street food, and Indian brand products. Cross-referenced with ICMR-NIN nutrition data.",
              },
              {
                icon: "📊",
                title: "Coach dashboard",
                desc: "See every client's week in one view. Flagged when protein dips, when logging drops, or when a client needs a check-in.",
              },
            ].map((f) => (
              <Reveal key={f.title}>
                <div className="bg-gray-50 rounded-2xl p-7">
                  <p className="text-3xl mb-4">{f.icon}</p>
                  <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Meal grid ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-950 text-white">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">Knows every meal your clients actually eat</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-gray-400 text-center text-lg mb-12">Not Western meal plans. Real Indian food.</p>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {MEALS.map((meal, i) => (
              <Reveal key={meal.name} delay={i * 60}>
                <div className="bg-gray-800 rounded-2xl overflow-hidden">
                  <div className="relative w-full h-36">
                    <Image src={meal.src} alt={meal.name} fill
                      className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-white text-sm mb-1">{meal.name}</p>
                    <p className="text-gray-400 text-xs">{meal.protein}</p>
                  </div>
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
            &ldquo;I used to guess what my clients were eating. Now I know — and they barely have to do anything extra.&rdquo;
          </blockquote>
          <p className="text-sm text-gray-500">— Vikram S., fitness coach, Pune</p>
        </Reveal>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <GymShaderBackground className="w-full h-full opacity-40" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight">
              Ready to coach every client,<br />not just the ones who message you?
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="text-gray-600 text-lg mb-10">Free to start. No credit card. Invite your first client in minutes.</p>
          </Reveal>
          <Reveal delay={300}>
            <Link href={signupUrl} onClick={handleCta}
              className="bg-[#6750A4] text-white font-bold rounded-full px-10 py-5 text-lg hover:bg-[#4F378A] transition-colors shadow-xl shadow-[#E9DDFF] inline-block">
              Create your coach account →
            </Link>
          </Reveal>
        </div>
      </section>

      <LandingFooter product="gym" />
    </div>
  );
}
