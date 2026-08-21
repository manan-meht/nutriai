"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OBSIDIAN_TOKENS as O } from "@/components/coach/tokens";
import { trackClubEvent } from "@/lib/club/analytics";
import { COACH_CANONICAL_ORIGIN } from "@/lib/club/host";

/** Where an interested coach goes: the Tistra Coach landing page, not
 * straight into the signup form.
 *
 * Someone who taps this from the club deck has seen a marketplace, not a
 * pitch — they don't yet know what the coach product does or what it
 * costs. Dropping them on an account form asks them to commit before
 * either question is answered; the landing page answers both (including
 * the 10%) and carries its own signup CTA.
 *
 * A different origin, so an absolute URL rather than a Next Link. */
const COACH_LANDING_URL = COACH_CANONICAL_ORIGIN;

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
  demo = false,
}: {
  /** Already ordered: priority skills first, the rest after. */
  skills: SwipeSkill[];
  /** How many of `skills` are shown before the More control. */
  primaryCount: number;
  coaches: SwipeCoach[];
  initialSkill: string | null;
  marketName: string;
  /** Renders the deck as the labelled /demo showcase. Seeded coaches are
   * only ever shown behind this flag, so nothing on the live site can
   * present an invented person as someone you could book. */
  demo?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [skill, setSkill] = useState<string | null>(initialSkill);
  const [showAllChips, setShowAllChips] = useState(false);
  const [index, setIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);

  /** No coaches exist at all — as opposed to none matching a chip. There
   * is nothing to swipe to, so the deck's geometry (a 72dvh cover with the
   * first card peeking below) has nothing to reveal and only creates a
   * scroll that ends in a dead end. The page becomes one screen. */
  const isEmptyMarket = coaches.length === 0;

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

  // Which section is on screen, measured rather than computed.
  //
  // This used to derive the index from scrollTop divided by clientHeight.
  // Sections are sized in dvh, which tracks the DYNAMIC viewport — on a
  // phone it changes as the URL bar collapses — so container height and
  // section height disagree, the error compounds down the deck, and the
  // last two cards both reported "12 / 12". An observer asks the browser
  // what is actually visible instead, which cannot drift.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-deck-index]"));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Most-visible wins, so a half-scrolled position never flickers.
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        const i = Number((best.target as HTMLElement).dataset.deckIndex);
        setIndex((prev) => (prev === i ? prev : i));
        if (i > 0) {
          setHasInteracted((was) => {
            if (!was) trackClubEvent("coach_feed_started");
            return true;
          });
        }
      },
      { root, threshold: [0.5, 0.75] }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // Re-observed when the filtered set changes, since sections are
    // added and removed with it.
  }, [filtered.length]);

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
        data-deck-index="0"
        className={`relative flex w-full snap-start snap-always flex-col overflow-hidden px-5 sm:px-10 ${
          isEmptyMarket ? "h-[100dvh]" : "h-[72dvh]"
        }`}
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

        {/* Says what this page is before anything else is read. Placed in
            the flow rather than as an overlay so it can never sit on top
            of a coach's name the way the Filters pill once did. */}
        {demo && (
          <div
            className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl px-4 py-2.5 text-center text-[13px]"
            style={{ backgroundColor: O.primaryContainer, color: O.onPrimaryContainer }}
          >
            <span className="font-semibold">Demo — these coaches are examples, not real people.</span>
            <a
              href="/"
              className="font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: O.onPrimaryContainer }}
            >
              Go to Tistra Club
            </a>
          </div>
        )}

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

          {/* The marketplace is new and thin. Saying so is better than
              letting a visitor conclude it from a short deck — and it turns
              the honest fact into the reason to keep going, by pointing at
              the coaches who ARE here. Shown only once there is someone to
              scroll to; with nobody at all the empty state below says it
              instead. */}
          {!isEmptyMarket && (
            <p
              className="mx-auto mt-5 max-w-md text-center text-[13.5px] leading-relaxed"
              style={{ color: O.onSurfaceVariant }}
            >
              We&rsquo;re still signing up coaches in {marketName}. Scroll down to meet the ones
              already taking bookings.
            </p>
          )}

          {isEmptyMarket ? (
            /* Sits directly under the hero copy so the whole page is one
               screen: nothing here is reachable by scrolling, because
               there is nothing below it. */
            <div className="mx-auto mt-8 flex max-w-md flex-col items-center text-center">
              <p className="text-[17px] font-semibold" style={{ color: O.onSurface }}>
                We&rsquo;re signing up the first coaches in {marketName}.
              </p>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: O.onSurfaceVariant }}>
                Nobody is bookable yet. If you coach here, this is the moment to claim your spot.
              </p>
              <a
                href={COACH_LANDING_URL}
                onClick={() => trackClubEvent("coach_landing_clicked", { from: "empty_deck" })}
                className="mt-6 rounded-full px-6 py-3 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{ backgroundColor: O.primaryContainer, color: O.onPrimaryContainer }}
              >
                Coach with Tistra
              </a>
              <a
                href="/demo"
                onClick={() => trackClubEvent("demo_clicked", { from: "empty_deck" })}
                className="mt-4 text-[14px] underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: O.onSurfaceVariant }}
              >
                See how it works
              </a>
            </div>
          ) : (
            <>
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
              href={demo ? "/coaches?demo=1" : "/coaches"}
              onClick={() => trackClubEvent("list_view_clicked")}
              className="rounded-full px-2 py-1 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ color: O.primary }}
            >
              Browse all
            </Link>
          </div>
            </>
          )}
        </div>

        {/* Swipe affordance, attached to the peeking card below. Retires
            itself once the deck has been used. */}
        <div
          className={`flex flex-col items-center gap-0.5 pb-3 transition-opacity duration-500 ${
            hasInteracted || filtered.length === 0 ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={hasInteracted || filtered.length === 0}
          hidden={isEmptyMarket}
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
      {isEmptyMarket ? null : filtered.length === 0 ? (
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
            data-deck-index={i + 1}
            className="h-[100dvh] w-full snap-start snap-always sm:flex sm:justify-center sm:px-8 sm:py-5"
            aria-label={c.name}
          >
            <article
              className="relative flex h-full w-full flex-col overflow-hidden rounded-t-[28px] sm:max-w-4xl sm:rounded-3xl"
              style={{ backgroundColor: O.surfaceContainerLow }}
            >
              {/* A swipe is a scroll, never a click — paging past a coach
                  cannot trigger this. Sits beneath the content so the
                  button below stays independently clickable. */}
              <Link
                href={`/coaches/${c.id}`}
                className="absolute inset-0 z-0"
                aria-label={`${c.name} — view profile and book`}
              />

              {/* Meta first, on the card's own surface rather than over the
                  photo. It used to be white text on a scrim, which is why
                  the photo needed to bleed to the edges; with the photo
                  framed below, the text has a solid ground and no scrim is
                  needed at all.

                  Cleared past the fixed Filters/counter row above, which
                  was overlapping the coach's name on mobile. */}
              <div
                className="pointer-events-none relative z-10 px-5 sm:px-7"
                style={{ paddingTop: "calc(env(safe-area-inset-top) + 64px)" }}
              >
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

              {/* The photo: inset on every side so it reads as a portrait
                  of the coach rather than a background. flex-1 lets it take
                  whatever height is left between the name and the button,
                  so it adapts to a long name or a small screen instead of
                  being pinned to a percentage. */}
              <div
                className="pointer-events-none relative z-10 mx-5 mt-5 min-h-0 flex-1 overflow-hidden rounded-2xl sm:mx-7"
                style={{ backgroundColor: O.backdrop }}
              >
                {c.photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs and local placeholders
                  <img
                    src={c.photo}
                    alt=""
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    className="h-full w-full object-cover"
                    style={{ objectPosition: "center 35%" }}
                  />
                )}
              </div>

              <div
                className="relative z-10 flex px-5 pt-5 sm:justify-end sm:px-7"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
              >
                <Link
                  href={`/coaches/${c.id}`}
                  className="flex w-full items-center justify-center rounded-full py-3.5 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto sm:px-8"
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
