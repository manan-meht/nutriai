"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OBSIDIAN_TOKENS as O } from "@/components/coach/tokens";
import { trackClubEvent } from "@/lib/club/analytics";

// The club homepage and coach deck, as ONE vertical surface.
//
// The Stitch redesign's core idea: the homepage is not a separate screen
// the user leaves — the first coach is already peeking at the bottom of the
// initial viewport, and the first swipe simply finishes revealing them.
// Implemented by geometry, not duplication: the cover section is 72dvh
// tall inside a mandatory snap container, so the top ~28% of the REAL first
// coach card shows below it. There is no preview component and no second
// render of coach #1 — what peeks is the card itself.
//
// Filtering is client-side over the already-loaded page of coaches (the
// same membership rule the server applies, on the same ranked data), so
// tapping a chip updates the count and the peeking coach in place: no
// navigation, no scroll reset, no second query.
//
// Coach meta (name, skills, rating, price) is anchored to the TOP of each
// card rather than the bottom precisely so the peek contains it — the
// mobile Stitch mock shows exactly this information in the docked preview,
// and anchoring it top lets the peek and the full card be one render.
//
// Deliberately not a Tinder deck: swiping back is always possible and no
// coach is discarded. With a pool of a dozen coaches, a dismissal
// mechanic would empty the marketplace in twelve flicks.

export interface SwipeCoach {
  id: string;
  name: string;
  headline: string | null;
  skills: string[];
  skillSlugs: string[];
  neighbourhood: string | null;
  rating: string | null;
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

export function SwipeFeed({
  skills,
  primaryCount,
  coaches,
  initialSkill,
  marketName,
}: {
  /** Already ordered: priority skills first, the rest after. */
  skills: SwipeSkill[];
  /** How many of `skills` are shown before the More control. */
  primaryCount: number;
  coaches: SwipeCoach[];
  initialSkill: string | null;
  marketName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [skill, setSkill] = useState<string | null>(initialSkill);
  const [showAllChips, setShowAllChips] = useState(false);
  const [index, setIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);

  const filtered = useMemo(
    () => (skill ? coaches.filter((c) => c.skillSlugs.includes(skill)) : coaches),
    [coaches, skill]
  );

  useEffect(() => {
    trackClubEvent("homepage_viewed", { coaches: coaches.length });
    if (coaches.length > 0) trackClubEvent("first_coach_preview_seen");
    // Once, on mount — the counts at load are what "viewed" means.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // The cover is shorter than a viewport, so index 0 ends at the cover's
    // own height, not at one full screen.
    const coverH = (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? el.clientHeight;
    const top = el.scrollTop;
    const i = top < coverH / 2 ? 0 : 1 + Math.round((top - coverH) / el.clientHeight);
    setIndex((prev) => {
      if (prev === i) return prev;
      if (i > 0) {
        setHasInteracted((was) => {
          if (!was) trackClubEvent("coach_feed_started");
          return true;
        });
      }
      return i;
    });
  }, []);

  const selectSkill = useCallback((next: string | null) => {
    setSkill(next);
    trackClubEvent("skill_selected", { skill: next ?? "all" });
    // Keep the URL shareable without a navigation (which would refetch and
    // reset scroll). The path differs by host (clean on club hosts), so
    // reuse whatever it already is.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `${window.location.pathname}${next ? `?skill=${next}` : ""}`);
    }
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const visibleSkills = showAllChips ? skills : skills.slice(0, primaryCount);
  const hiddenCount = skills.length - primaryCount;

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      tabIndex={0}
      role="feed"
      aria-label="Coaches, one per screen — swipe up or press arrow keys for the next"
      className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ background: O.backdrop, backgroundAttachment: "fixed", color: O.onSurface }}
    >
      {/* Overlay chrome once inside the deck. */}
      {index > 0 && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          <button
            type="button"
            onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            className="pointer-events-auto rounded-full px-4 py-2 text-[13px] font-medium backdrop-blur"
            style={{ backgroundColor: "rgba(11,19,38,0.6)", color: O.onSurface }}
          >
            ↑ Filters
          </button>
          <span
            className="rounded-full px-3 py-1.5 text-[12px] font-medium tabular-nums backdrop-blur"
            style={{ backgroundColor: "rgba(11,19,38,0.6)", color: O.onSurface }}
            aria-live="polite"
          >
            {Math.min(index, filtered.length)} / {filtered.length}
          </span>
        </div>
      )}

      {/* ---- Cover: 72dvh, so the first real coach peeks below it ---- */}
      <section
        className="relative flex h-[72dvh] w-full snap-start snap-always flex-col overflow-hidden px-5 sm:px-10"
        aria-label="Choose a skill"
      >
        {/* Branding + location */}
        <div
          className="flex items-center justify-between"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 18px)" }}
        >
          <p className="text-[15px] font-bold uppercase tracking-[0.12em]" style={{ color: O.onSurface }}>
            Tistra Club
          </p>
          <p className="flex items-center gap-1.5 text-[14px] font-medium" style={{ color: O.onSurface }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 21s-7-5.7-7-11a7 7 0 1 1 14 0c0 5.3-7 11-7 11Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {marketName}
          </p>
        </div>

        {/* Hero — identical copy on every breakpoint. */}
        <div className="flex flex-1 flex-col justify-center">
          <h1
            className="mx-auto max-w-[22ch] text-center text-[34px] font-bold leading-[1.12] tracking-[-0.02em] sm:text-[52px] lg:text-[60px]"
            style={{ color: "#FFFFFF", textWrap: "balance" as any }}
          >
            What do you want to get better at?
          </h1>
          <p
            className="mx-auto mt-4 max-w-md text-center text-[16px] leading-relaxed sm:text-[18px]"
            style={{ color: O.onSurfaceVariant }}
          >
            Choose a skill, meet the right coach, and start moving forward.
          </p>

          {/* Skill filters: priority chips first, the rest behind More.
              Mobile scrolls the row; desktop wraps and centres. */}
          <div
            className="-mx-5 mt-7 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-auto sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
            role="group"
            aria-label="Filter by skill"
          >
            <SkillChip label="All skills" selected={skill === null} onSelect={() => selectSkill(null)} />
            {visibleSkills.map((s) => (
              <SkillChip
                key={s.slug}
                label={s.name}
                selected={skill === s.slug}
                onSelect={() => selectSkill(s.slug)}
              />
            ))}
            {!showAllChips && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllChips(true)}
                aria-expanded={false}
                aria-label={`Show ${hiddenCount} more skills`}
                className="shrink-0 rounded-full px-4 py-2.5 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: O.onSurface }}
              >
                More
              </button>
            )}
          </div>

          {/* Count + list view. The Stitch mock says "available this week";
              the deck deliberately includes coaches without a slot this
              week, so that claim would overcount or undercount — the count
              states only what is true of the cards below it. */}
          <div className="mx-auto mt-6 flex w-full max-w-xl items-center justify-between gap-4">
            <p className="text-[15px]" style={{ color: O.onSurface }} aria-live="polite">
              {filtered.length === 1 ? "1 coach" : `${filtered.length} coaches`} in {marketName}
            </p>
            <Link
              href="/"
              onClick={() => trackClubEvent("list_view_clicked")}
              className="rounded-full px-2 py-1 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ color: O.primary }}
            >
              Browse all
            </Link>
          </div>
        </div>

        {/* Swipe affordance, attached to the peeking card below. Retires
            itself once the deck has been used. */}
        <div
          className={`flex flex-col items-center gap-0.5 pb-3 transition-opacity duration-500 ${
            hasInteracted || filtered.length === 0 ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={hasInteracted || filtered.length === 0}
        >
          <span aria-hidden="true" className="swipe-nudge text-lg leading-none" style={{ color: O.onSurfaceVariant }}>
            ⌃
          </span>
          <span className="text-[13px] font-medium" style={{ color: O.onSurfaceVariant }}>
            <span className="sm:hidden">Swipe up to meet your first coach</span>
            <span className="hidden sm:inline">Meet your first coach</span>
          </span>
        </div>
      </section>

      {/* ---- The deck: one real coach per screen, first one peeking ---- */}
      {filtered.length === 0 ? (
        <section
          className="h-[100dvh] w-full snap-start snap-always px-5 sm:px-10"
          aria-label="No matching coaches"
        >
          {/* Content sits in the top third so the peek under the cover
              shows the message, never a blank slab. */}
          <div
            className="mx-auto flex max-w-md flex-col items-center rounded-t-[28px] px-6 pb-10 pt-9 text-center sm:rounded-3xl"
            style={{ backgroundColor: O.surfaceContainerLow }}
          >
            <p className="text-[19px] font-semibold" style={{ color: O.onSurface }}>
              No coaches for this skill yet.
            </p>
            <button
              type="button"
              onClick={() => selectSkill(null)}
              className="mt-5 rounded-full px-6 py-3 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ backgroundColor: O.primaryContainer, color: O.onPrimaryContainer }}
            >
              Browse all coaches
            </button>
          </div>
        </section>
      ) : (
        filtered.map((c, i) => (
          <section
            key={c.id}
            className="h-[100dvh] w-full snap-start snap-always sm:flex sm:justify-center sm:px-8 sm:py-5"
            aria-label={c.name}
          >
            <article
              className="relative h-full w-full overflow-hidden rounded-t-[28px] sm:max-w-4xl sm:rounded-3xl"
              style={{ backgroundColor: O.surfaceContainerLow }}
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
                <div className="absolute inset-0" style={{ background: O.backdrop }} />
              )}

              {/* Meta lives at the TOP so the 28% peek carries it; heavier
                  scrim up there, lighter middle, enough at the foot for the
                  CTA. */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(6,10,26,0.88) 0%, rgba(6,10,26,0.38) 30%, rgba(6,10,26,0.06) 55%, rgba(6,10,26,0.72) 100%)",
                }}
              />

              {/* A swipe is a scroll, never a click — paging past a coach
                  cannot trigger this. */}
              <Link
                href={`/coaches/${c.id}`}
                className="absolute inset-0 z-10"
                aria-label={`${c.name} — view profile and book`}
              />

              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-5 pt-6 sm:px-7">
                <h2 className="text-[28px] font-bold leading-tight tracking-[-0.015em] text-white sm:text-[32px]">
                  {c.name}
                </h2>
                <p className="mt-1 text-[15px] font-medium" style={{ color: O.primary }}>
                  {c.skills.join(" & ") || c.headline}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[14px] text-white/85">
                  {c.rating ? (
                    <>
                      <span aria-hidden="true" style={{ color: O.star }}>★</span>
                      <span>{c.rating}</span>
                    </>
                  ) : (
                    <span>New coach</span>
                  )}
                  {c.priceLabel && (
                    <>
                      <span aria-hidden="true" className="text-white/40">·</span>
                      <span>{c.priceLabel}</span>
                    </>
                  )}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-white/60">
                  {c.neighbourhood && <span>{c.neighbourhood}</span>}
                  {c.verified && <span>✓ Verified</span>}
                  {c.travels && <span>Travels to you</span>}
                  <span>{c.nextLabel === "No open slots" ? c.nextLabel : `Next ${c.nextLabel}`}</span>
                </p>
              </div>

              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex px-5 sm:justify-end sm:px-7"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
              >
                <Link
                  href={`/coaches/${c.id}`}
                  className="pointer-events-auto flex w-full items-center justify-center rounded-full py-3.5 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto sm:px-8"
                  style={{ backgroundColor: O.primaryContainer, color: O.onPrimaryContainer }}
                >
                  View Profile
                </Link>
              </div>
            </article>
          </section>
        ))
      )}
    </div>
  );
}

function SkillChip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="shrink-0 rounded-full px-4 py-2.5 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      style={
        selected
          ? { backgroundColor: "#FFFFFF", color: "#1E1B4B" }
          : { backgroundColor: "rgba(255,255,255,0.08)", color: O.onSurface }
      }
    >
      {label}
    </button>
  );
}
