"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { getSignupUrl, trackLandingEvent, storeLandingAttribution } from "@/lib/landing/routes";
import { Reveal } from "@/components/motion/Reveal";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { AddUserExplainer } from "../shared/AddUserExplainer";

const STEPS = [
  {
    number: "01",
    heading: "Snap and send",
    body: "No opening clunky apps or searching databases. Just snap a quick photo of your plate and send it to our WhatsApp bot. It takes exactly 3 seconds.",
    photo: "/landing/steps/self-step-01.jpeg",
    photoAlt: "A person opening WhatsApp on their phone at home",
  },
  {
    number: "02",
    heading: "The big picture, simplified",
    body: "Our AI looks at your meal to track the balance. No calorie scoreboards, no gram-counting anxiety.",
    photo: "/landing/steps/self-step-02.jpeg",
    photoAlt: "A person photographing their own lunch plate",
  },
  {
    number: "03",
    heading: "Clear, weekly trends",
    body: "Get a comprehensive weekly summary. Build consistent self-awareness and confidently guide your own goals.",
    photo: "/landing/steps/self-step-03.jpeg",
    photoAlt: "A person reviewing their weekly progress on their phone",
  },
] as const;

export function SelfImmersiveLanding() {
  const signupUrl =
    getSignupUrl({ product: "adults", source: "landing", variant: "immersive" }) +
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
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-[80vh] flex flex-col md:flex-row">
        <div className="relative z-10 flex-1 flex flex-col justify-center px-6 md:px-14 py-16 md:py-24">
          <Reveal>
            <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-4">
              For tracking yourself
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
              Mindful tracking.<br />
              <span className="text-[#6750A4]">Zero food guilt.</span>
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-base md:text-xl text-gray-700 mb-8 leading-relaxed max-w-md">
              The simplest way to stay accountable to yourself, right inside WhatsApp.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href={signupUrl} onClick={handleCta}
                className="bg-[#6750A4] text-white font-bold rounded-full px-8 py-4 text-base hover:bg-[#4F378A] transition-colors shadow-lg shadow-[#E9DDFF] text-center">
                Get Started →
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="relative w-full md:w-[52%] h-72 md:h-auto flex-shrink-0">
          <Image
            src="/landing/self/immersive/hero/self-hero.jpeg"
            alt="A person at home photographing their own meal to send on WhatsApp"
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
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Three steps. Just for you.</h2>
          </Reveal>

          <div className="flex flex-col gap-16">
            {STEPS.map((step, i) => (
              <Reveal key={step.number} delay={i * 100}>
                <div className={`flex flex-col ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} gap-8 md:gap-14 items-center`}>
                  <div className="w-full md:w-1/2 rounded-3xl overflow-hidden shadow-xl flex-shrink-0">
                    <div className="relative w-full h-60 md:h-80">
                      <Image src={step.photo} alt={step.photoAlt} fill
                        sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                    </div>
                  </div>
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

      {/* ── Set up your own tracking (setup/invite, separate from meal-tracking steps above) ── */}
      <AddUserExplainer variant="self" ctaHref={signupUrl} ctaLabel="Start tracking myself" />

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Built to be easy to keep up with</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-gray-500 text-center text-lg mb-14 max-w-xl mx-auto">
              No streak-shaming, no calorie scoreboard. Just a clear, honest overview of your daily habits.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "📸",
                title: "WhatsApp logging",
                desc: "Log a meal by sending a photo or text message. No new app to download, no sign-in required.",
              },
              {
                icon: "🌱",
                title: "Gentle, honest ranges",
                desc: "Food groups, wholesome ingredients, balance. No obsessive tracking required.",
              },
              {
                icon: "📈",
                title: "Your own dashboard",
                desc: "See your weekly summary - meals logged, nutritional balance, insights to improve your routine.",
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

      {/* ── Quote ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 text-center max-w-2xl mx-auto">
        <Reveal>
          <blockquote className="text-2xl md:text-3xl font-medium text-gray-800 leading-relaxed mb-4">
            &ldquo;I just send a photo when I remember. I didn&apos;t expect to actually keep it up for two months.&rdquo;
          </blockquote>
          <p className="text-sm text-gray-500">— Ananya R., tracking herself since March</p>
        </Reveal>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center bg-[#F3EEFB]">
        <div className="max-w-2xl mx-auto">
          <Reveal>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight">
              Ready for stress-free nutrition awareness?<br />Take control.
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="text-gray-600 text-lg mb-10">Free to start. No credit card. Add your number in minutes.</p>
          </Reveal>
          <Reveal delay={300}>
            <Link href={signupUrl} onClick={handleCta}
              className="bg-[#6750A4] text-white font-bold rounded-full px-10 py-5 text-lg hover:bg-[#4F378A] transition-colors shadow-xl shadow-[#E9DDFF] inline-block">
              Get Started →
            </Link>
          </Reveal>
        </div>
      </section>

      <MarketingFooter variant="me" />
    </div>
  );
}
