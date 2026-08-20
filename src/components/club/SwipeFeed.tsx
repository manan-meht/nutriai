"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CLUB_BRANDING } from "@/lib/club/config";

// Full-screen swipe discovery: one coach per screen, swipe up for the next.
//
// This is NOT a regular scroll. The container snaps a full viewport per
// coach (scroll-snap-type: y mandatory), so a swipe always lands cleanly on
// exactly one profile — the story/deck feel — while staying an ordinary
// scroll underneath: reversible, no dismissal, works with a mouse wheel and
// keyboard, and never throws a coach away the way a true Tinder deck would.
// With eleven coaches, a discarded profile is gone from a very small pool.
//
// Screen one is a cover: greeting, one motivating line, and the skill
// filters. Swiping up from it reveals the first coach. Tapping any coach
// goes to their full profile, where booking already lives — this surface
// only has to make someone curious, not close the sale.
//
// The palette is deliberately dark, unlike the rest of the club: this is a
// photo-led surface and photos read better on black. Single-theme by
// design, so every colour is painted explicitly.

export interface SwipeCoach {
  id: string;
  name: string;
  headline: string | null;
  skills: string[];
  neighbourhood: string | null;
  ratingLabel: string;
  priceLabel: string | null;
  nextLabel: string;
  photo: string | null;
  verified: boolean;
  travels: boolean;
}

export interface SwipeSkill {
  slug: string;
  name: string;
}

const INK = "#14091F";

export function SwipeFeed({
  greeting,
  message,
  skills,
  coaches,
  activeSkill,
}: {
  greeting: string;
  message: string;
  skills: SwipeSkill[];
  coaches: SwipeCoach[];
  activeSkill: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    setIndex((prev) => (prev === i ? prev : i));
  }, []);

  const backToFilters = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      role="feed"
      aria-label="Coaches, one per screen — swipe up for the next"
      className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ backgroundColor: INK }}
    >
      {/* Overlay chrome, only once past the cover. Fixed, so it doesn't
          scroll with the sections beneath it. */}
      {index > 0 && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          <button
            type="button"
            onClick={backToFilters}
            className="pointer-events-auto rounded-full px-4 py-2 text-[13px] font-medium text-white backdrop-blur"
            style={{ backgroundColor: "rgba(20,9,31,0.55)" }}
          >
            ↑ Filters
          </button>
          <span
            className="rounded-full px-3 py-1.5 text-[12px] font-medium tabular-nums text-white/90 backdrop-blur"
            style={{ backgroundColor: "rgba(20,9,31,0.55)" }}
            aria-live="polite"
          >
            {Math.min(index, coaches.length)} / {coaches.length}
          </span>
        </div>
      )}

      {/* ---- Screen 1: the cover ---- */}
      <section
        className="relative flex h-[100dvh] w-full snap-start snap-always flex-col justify-between overflow-hidden px-6"
        style={{ background: "linear-gradient(165deg, #1C0838 0%, #45129E 55%, #630ED4 100%)" }}
        aria-label="Welcome and filters"
      >
        <p
          className="text-[13px] font-semibold tracking-[0.08em] text-white/60 uppercase"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}
        >
          {CLUB_BRANDING.productName}
        </p>

        <div>
          <h1 className="max-w-sm text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-white text-balance">
            {greeting}
          </h1>
          <p className="mt-3 max-w-sm text-[16px] leading-relaxed text-white/80">{message}</p>

          <div className="mt-7 flex flex-wrap gap-2" role="group" aria-label="Filter by skill">
            <FilterChip href="/browse" active={!activeSkill} label="All skills" />
            {skills.map((s) => (
              <FilterChip
                key={s.slug}
                href={`/browse?skill=${s.slug}`}
                active={activeSkill === s.slug}
                label={s.name}
              />
            ))}
          </div>

          <p className="mt-5 text-sm text-white/60">
            {coaches.length === 1
              ? activeSkill ? "1 coach teaches this" : "1 coach ready when you are"
              : `${coaches.length} coaches ${activeSkill ? "teach this" : "ready when you are"}`}{" "}
            ·{" "}
            <Link href="/" className="underline underline-offset-2 text-white/80">
              list view
            </Link>
          </p>
        </div>

        <div
          className="flex flex-col items-center gap-1 text-white/85"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)" }}
        >
          <span aria-hidden="true" className="text-xl leading-none motion-safe:animate-bounce">⌃</span>
          <span className="text-[13px] font-medium">Swipe up to meet your coaches</span>
        </div>
      </section>

      {/* ---- One coach per screen ---- */}
      {coaches.length === 0 ? (
        <section
          className="relative flex h-[100dvh] w-full snap-start snap-always flex-col items-center justify-center px-8 text-center"
          style={{ backgroundColor: INK }}
        >
          <p className="text-lg font-semibold text-white">No coaches teach that yet.</p>
          <p className="mt-2 max-w-xs text-sm text-white/70">
            Try another skill, or see everyone.
          </p>
          <Link
            href="/browse"
            className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-semibold"
            style={{ color: INK }}
          >
            Show all coaches
          </Link>
        </section>
      ) : (
        coaches.map((c, i) => (
          <section
            key={c.id}
            className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden"
            style={{ backgroundColor: INK }}
            aria-label={c.name}
          >
            {c.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs and local placeholders
              <img
                src={c.photo}
                alt=""
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(165deg, #2A0B5E 0%, #630ED4 100%)" }}
              />
            )}

            {/* Scrim: heavy at the foot where the text sits, faint at the
                top so the progress chip stays readable over bright photos. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(10,4,18,0.92) 0%, rgba(10,4,18,0.45) 38%, rgba(10,4,18,0.05) 62%, rgba(10,4,18,0.35) 100%)",
              }}
            />

            {/* Whole screen opens the profile; a swipe is a scroll, not a
                click, so paging past never triggers this. */}
            <Link
              href={`/coaches/${c.id}`}
              className="absolute inset-0 z-10"
              aria-label={`${c.name} — view profile and book`}
            />

            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 22px)" }}
            >
              <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.015em] text-white">
                {c.name}
              </h2>
              <p className="mt-1 text-[15px] text-white/85">
                {c.skills.join(" · ") || c.headline}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/75">
                <span>{c.ratingLabel}</span>
                {c.neighbourhood && <span>{c.neighbourhood}</span>}
                {c.verified && <span>✓ Verified</span>}
                {c.travels && <span>Travels to you</span>}
              </p>
              <p className="mt-2.5 text-[15px] font-medium text-white">
                {c.priceLabel}
                {c.priceLabel && " · "}
                {c.nextLabel === "No open slots" ? c.nextLabel : `Next ${c.nextLabel}`}
              </p>

              <Link
                href={`/coaches/${c.id}`}
                className="pointer-events-auto mt-5 flex w-full items-center justify-center rounded-full bg-white py-4 text-[15px] font-semibold"
                style={{ color: INK }}
              >
                View profile &amp; book
              </Link>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className="rounded-full px-4 py-2 text-[13px] font-medium"
      style={
        active
          ? { backgroundColor: "#FFFFFF", color: "#2A0B5E" }
          : { backgroundColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.92)" }
      }
    >
      {label}
    </Link>
  );
}
