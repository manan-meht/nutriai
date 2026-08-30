import Link from "next/link";
import Image from "next/image";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { showcaseCoach } from "@/lib/landing/coach-preview";
import { foundingSpotsFor } from "@/lib/landing/founding-spots";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/club/config";
import { COACH_MARKET, cityForMarket, type CoachMarket } from "@/lib/landing/coach-market";
// The offer's size comes from the engine that enforces it, so the copy and
// the money cannot drift apart.
import { FOUNDING_FREE_BOOKINGS } from "@/lib/club/founding-offer";
import { display, T } from "./coach-theme";
import { TrackedCta } from "./TrackedCta";
import { StickyMobileCta } from "./StickyMobileCta";
import { FoundingSpotsLine } from "./FoundingSpots";
import { CategoryCards } from "./CategoryCards";
import { ProfileShowcase } from "./ProfileShowcase";
import { CoachFaq } from "./CoachFaq";
import { SectionView } from "./SectionView";
import { PageView } from "./PageView";

// Tistra Coach's homepage, on the Momentum Dark Premium design.
//
// Sells one thing: you teach a skill, and Tistra helps people find and book
// you. Everything the product also does — calendars, payouts, client
// records — is deliberately absent from the top half. A coach arriving from
// an ad has not yet asked how the software works.
//
// Photography carries the page, so the two genuinely coach-and-client
// images in public/marketing do the heavy lifting: the hero and the closing
// band. The discipline cards use the marketplace's own placeholder
// photography, which depicts each discipline honestly but shows one person
// rather than someone teaching — flagged for replacement.
//
// Nothing here invents social proof. No testimonials, no ratings, no coach
// counts, no "recent booking" tickers. The one number on the page is the
// Founding Coach allocation, which is counted from real profiles.

const PRICING_LINE =
  `Free to set up. No monthly fee. We take ${DEFAULT_PLATFORM_FEE_PERCENT}% only when you get paid ` +
  `— card processing included.`;

const STEPS = [
  { n: "01", title: "Get discovered", body: "People find your profile and your private sessions on Tistra Club." },
  { n: "02", title: "Get booked", body: "They choose the session, the place and the time that suits them." },
  { n: "03", title: "Get paid", body: "They pay when they book. No chasing, no cash at the end of a session." },
] as const;

const RULES = [
  "You choose what you teach.",
  "You set the price.",
  "You decide where you coach.",
  "You choose your availability.",
] as const;

export async function CoachLanding({
  market = COACH_MARKET,
  city,
}: {
  /** One page, two markets. Everything that differs — copy, imagery,
   * discipline cards, the FAQ set, whether bookings are live — comes from
   * this object, so the two never drift into separate designs again. */
  market?: CoachMarket;
  /** Visitor city from the edge, named in the eyebrow when we serve it. */
  city?: string | null;
} = {}) {
  const [showcase, spots] = await Promise.all([showcaseCoach(), foundingSpotsFor(market)]);
  const named = cityForMarket(market, city);

  const signupHref = getSignupUrl({
    product: "gym",
    source: market.signupSource,
    variant: "standard",
    productParam: "coach",
  });
  const loginHref = getLoginUrl({ product: "gym", source: market.signupSource });
  const ctaProps = { foundingSpotsRemaining: spots.remaining };

  return (
    <div className={display.variable} style={{ backgroundColor: T.surface, color: T.onSurface }}>
      <PageView spotsRemaining={spots.remaining} />
      <Nav signupHref={signupHref} loginHref={loginHref} ctaProps={ctaProps} />

      {/* ------------------------------------------------------------ Hero */}
      <SectionView event="founding_offer_view" props={ctaProps}>
        <section className="mx-auto max-w-[1280px] px-5 pb-14 pt-10 md:px-12 md:pb-20 md:pt-16">
          {/* Below lg this is one column ordered headline -> photograph ->
              copy, so a phone sees the coaching image without scrolling.
              At lg it becomes an explicit 2x2 grid: the headline and the
              copy stack in column one, and the photograph spans both rows
              in column two. Explicit placement rather than source order —
              with three children in a two-column grid the copy took the
              top-right cell and pushed the photograph onto its own row,
              leaving a dead quarter of the hero. */}
          <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[0.92fr_1.08fr] lg:grid-rows-[auto_auto] lg:items-center lg:gap-x-14 lg:gap-y-6">
            <div className="order-1 lg:col-start-1 lg:row-start-1 lg:self-end">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: T.primary }}>
                For personal trainers, sports &amp; skill coaches
                {named ? ` in ${named}` : market.live ? "" : ` in ${market.name}`}
              </p>

              <h1
                className="mt-5 font-[family-name:var(--coach-display)] text-[2.75rem] font-bold leading-[1.04] tracking-[-0.02em] md:text-[4.25rem]"
                style={{ color: T.onSurface }}
              >
                Teach your skill.
                <br />
                Get more clients.
              </h1>

            </div>

            <div className="order-3 lg:col-start-1 lg:row-start-2 lg:self-start">
              <HeroCopy signupHref={signupHref} ctaProps={ctaProps} spots={spots} market={market} />
            </div>

            <div className="relative order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <div className="relative aspect-[16/11] w-full overflow-hidden rounded-3xl sm:aspect-[4/5] lg:aspect-[5/6]">
                <Image
                  src={market.images.hero}
                  alt={`A coach guiding a client through a session in ${market.name}`}
                  fill
                  // The LCP image: eager, high priority, and sized so a
                  // phone never downloads the desktop asset.
                  priority
                  sizes="(max-width: 1024px) 92vw, 52vw"
                  className="object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.10) 45%, rgba(10,10,10,0) 65%)" }}
                />
              </div>

              {/* What can be sold through Tistra — not a claim that anyone
                  booked it. No "recent booking", no invented activity. */}
              <div
                // Narrow and short on a phone: at 16/11 the card was
                // covering most of the photograph it is meant to annotate.
                className="absolute bottom-3 left-3 right-3 rounded-2xl border px-3.5 py-2.5 backdrop-blur sm:right-auto sm:max-w-[300px] md:bottom-5 md:left-5 md:px-4 md:py-3.5"
                style={{ borderColor: T.outlineVariant, backgroundColor: "rgba(28,28,28,0.86)" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: T.primary }}>
                  Example session
                </p>
                <p className="mt-1 text-[14px] font-bold leading-tight md:mt-1.5 md:text-[15px]" style={{ color: T.onSurface }}>
                  {market.exampleSession.name}
                </p>
                <p className="mt-0.5 text-[12px] md:mt-1 md:text-[13px]" style={{ color: T.onSurfaceVariant }}>
                  {market.exampleSession.price} · {market.exampleSession.duration}
                </p>
              </div>
            </div>
          </div>
        </section>
      </SectionView>

      {/* ------------------------------------------------ What do you coach */}
      <div style={{ backgroundColor: T.surfaceDim }}>
        <Section>
          <H2>What do you coach?</H2>
          <p className="mt-3 max-w-lg text-[16px] leading-7" style={{ color: T.onSurfaceVariant }}>
            Private sessions in the skill you already teach.
          </p>
          <div className="mt-8">
            <CategoryCards market={market} />
          </div>
        </Section>
      </div>

      {/* Said once, plainly, near the offer rather than buried at the
          bottom. Only for a market where we cannot yet take a booking —
          the page must never imply a client can pay us in India today. */}
      {!market.live && (
        <Section>
          <div
            className="rounded-2xl border px-5 py-4"
            style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainer }}
          >
            <p className="text-[15px] leading-6" style={{ color: T.onSurfaceVariant }}>
              <span className="font-semibold" style={{ color: T.onSurface }}>Where we are:</span>{" "}
              Tistra Club is live in Singapore and opening in {market.name}. Clients cannot book and
              pay through Tistra in {market.name} yet — we&rsquo;re building that now, and Founding
              Coaches are the profiles it opens with.
            </p>
          </div>
        </Section>
      )}

      {/* ------------------------------------------------ We promote you */}
      <Section id="why-tistra">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div>
            <H2>You coach. We&rsquo;ll work on getting you discovered.</H2>
            <p className="mt-5 max-w-xl text-[17px] leading-7 md:text-[19px]" style={{ color: T.onSurface }}>
              When people search for skills like {market.skillExamples.slice(0, -1).join(", ")} or{" "}
              {market.skillExamples.slice(-1)[0]},{" "}
              <span className="font-semibold" style={{ color: T.primary }}>
                we&rsquo;ll actively promote relevant coaches using Tistra&rsquo;s own marketing budget.
              </span>{" "}
              Founding Coaches benefit from that promotion at Tistra&rsquo;s cost.
            </p>
            <p className="mt-4 text-[13px] leading-5" style={{ color: T.onSurfaceVariant }}>
              Promotion does not guarantee enquiries or bookings.
            </p>
          </div>

          <div
            className="rounded-3xl border p-6"
            style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainer }}
          >
            <h3 className="text-[20px] font-bold leading-tight" style={{ color: T.onSurface }}>
              Don&rsquo;t have time to build your profile?
            </h3>
            <p className="mt-3 text-[15px] leading-6" style={{ color: T.onSurfaceVariant }}>
              Send us your Instagram, website or a few details about what you teach, and we&rsquo;ll
              help get your profile ready. Our first coaches get this personally.
            </p>
            <TrackedCta
              href={`${signupHref}&help=1`}
              event="onboarding_help_click"
              props={{ ...ctaProps, placement: "onboarding" }}
              className="mt-5 inline-flex items-center justify-center rounded-full border px-6 py-3 text-[14px] font-bold uppercase tracking-[0.04em]"
              style={{ borderColor: T.primary, color: T.primary }}
            >
              Help me set it up
            </TrackedCta>
          </div>
        </div>
      </Section>

      {/* -------------------------------------------- See what clients see */}
      <SectionView event="marketplace_preview_view" props={ctaProps}>
        <Section>
          <H2>See what your clients see.</H2>
          <p className="mt-3 max-w-xl text-[16px] leading-7 md:text-[17px]" style={{ color: T.onSurfaceVariant }}>
            Your profile becomes your storefront. Show what you teach, set your prices and
            availability, and let clients book you directly.
          </p>
          {!market.live && (
            <p className="mt-2 text-[14px]" style={{ color: T.onSurfaceVariant }}>
              This is Tistra Club running in Singapore today. {market.name} profiles will work the
              same way.
            </p>
          )}
          <div className="mt-9">
            <ProfileShowcase coach={showcase} />
          </div>
        </Section>
      </SectionView>

      {/* -------------------------------------------------- How it works */}
      <div id="how-it-works" className="scroll-mt-20" style={{ backgroundColor: T.surfaceDim }}>
        <Section>
          <H2>
            You coach.
            <br />
            Tistra brings the rest together.
          </H2>
          <ol className="mt-9 grid gap-7 md:grid-cols-3 md:gap-8">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span
                  className="block font-[family-name:var(--coach-display)] text-[3rem] font-bold leading-none md:text-[3.75rem]"
                  style={{ color: T.primaryContainer }}
                >
                  {s.n}
                </span>
                <h3 className="mt-3 text-[19px] font-bold" style={{ color: T.onSurface }}>{s.title}</h3>
                <p className="mt-2 text-[15px] leading-6" style={{ color: T.onSurfaceVariant }}>{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* ------------------------------------------------ 0% commission */}
      <SectionView event="pricing_section_view" props={ctaProps}>
        <Section id="pricing">
          <div
            className="rounded-[28px] px-6 py-12 text-center md:px-12 md:py-16"
            style={{ background: `linear-gradient(160deg, ${T.primary} 0%, #B99BFF 100%)` }}
          >
            <p
              className="font-[family-name:var(--coach-display)] text-[2.5rem] font-black uppercase leading-[0.95] tracking-[-0.02em] md:text-[4.5rem]"
              style={{ color: T.onPrimary }}
            >
              {FOUNDING_FREE_BOOKINGS} first bookings
              <br />
              0% commission
            </p>
            <p className="mx-auto mt-6 max-w-lg text-[16px] font-semibold leading-7 md:text-[18px]" style={{ color: T.onPrimary }}>
              Join as an early Tistra Coach and keep 100% of your first {FOUNDING_FREE_BOOKINGS}{" "}
              bookings{market.live ? "" : " once bookings open in " + market.name}.
            </p>
            <p className="mx-auto mt-3 max-w-md text-[14px] leading-6" style={{ color: "#5A1AA8" }}>
              {PRICING_LINE}
            </p>
            <TrackedCta
              href={signupHref}
              event="founding_cta_click"
              props={{ ...ctaProps, placement: "offer_card" }}
              className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-[15px] font-bold uppercase tracking-[0.04em]"
              style={{ backgroundColor: T.onPrimary, color: T.onSurface }}
            >
              Start coaching
              <span aria-hidden="true" className="transition-transform duration-200 motion-safe:group-hover:translate-x-1">→</span>
            </TrackedCta>
            <p className="mt-4 text-[13px]" style={{ color: "#5A1AA8" }}>
              Card and PayLah charges are set by the payment provider, not by Tistra.
            </p>
          </div>
        </Section>
      </SectionView>

      {/* -------------------------------------------- Your coaching, your rules */}
      <div style={{ backgroundColor: T.surfaceDim }}>
        <Section>
          <div className="grid items-center gap-9 lg:grid-cols-2 lg:gap-14">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-3xl">
              <Image
                src={market.images.closing}
                alt={`A coach guiding a small outdoor group in ${market.name}`}
                fill
                loading="lazy"
                sizes="(max-width: 1024px) 92vw, 46vw"
                className="object-cover"
              />
            </div>
            <div>
              <H2>
                Your coaching.
                <br />
                Your rules.
              </H2>
              <ul className="mt-6 flex flex-col gap-3">
                {RULES.map((r) => (
                  <li key={r} className="text-[17px] leading-7 md:text-[19px]" style={{ color: T.onSurfaceVariant }}>
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[15px] leading-6" style={{ color: T.onSurfaceVariant }}>
                Keep your existing clients and channels. There is no exclusivity.
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* ------------------------------------------------- What else it does */}
      <Section id="features">
        <H2>And once clients start booking, Tistra helps you run the rest.</H2>
        <p className="mt-4 max-w-2xl text-[16px] leading-7" style={{ color: T.onSurfaceVariant }}>
          Tistra Coach is the scheduling, payments and client-management app for independent
          coaches — {PRICING_LINE}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border p-5"
              style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainer }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.primary }}>{c.label}</p>
              <h3 className="mt-2 text-[17px] font-bold" style={{ color: T.onSurface }}>{c.title}</h3>
              <p className="mt-2 text-[15px] leading-6" style={{ color: T.onSurfaceVariant }}>{c.body}</p>
            </div>
          ))}
        </div>
        {/* Named integration and named scope. Google's brand review rejected
            an earlier version of this page twice for not explaining the
            product's purpose or its Google data use — both must survive any
            future rewrite. */}
        <p className="mt-6 max-w-2xl text-[14px] leading-6" style={{ color: T.onSurfaceVariant }}>
          <span className="font-semibold" style={{ color: T.onSurface }}>Optional.</span>{" "}
          Connect your Google Calendar and Tistra reads only your free/busy times —
          {" "}
          never your event titles, guests, locations or notes. You can disconnect it at any time.
        </p>
      </Section>

      {/* --------------------------------------------------------- FAQ */}
      <div style={{ backgroundColor: T.surfaceDim }}>
        <Section>
          <CoachFaq market={market} />
        </Section>
      </div>

      {/* ---------------------------------------------------- Final CTA */}
      <section className="relative isolate overflow-hidden">
        <div className="relative min-h-[420px] w-full md:min-h-[520px]">
          <Image
            src={market.images.closing}
            alt=""
            aria-hidden="true"
            fill
            loading="lazy"
            sizes="100vw"
            className="object-cover"
          />
          {/* Dark enough for AA contrast on the headline over any crop. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(10,10,10,0.82) 0%, rgba(10,10,10,0.72) 55%, rgba(10,10,10,0.92) 100%)" }}
          />
          <div className="relative mx-auto flex min-h-[420px] max-w-[1280px] flex-col items-center justify-center px-5 py-16 text-center md:min-h-[520px] md:px-12">
            <h2
              className="font-[family-name:var(--coach-display)] text-[2.25rem] font-bold leading-[1.08] tracking-[-0.02em] md:text-[3.5rem]"
              style={{ color: T.onSurface }}
            >
              {market.live ? (
                <>
                  Ready for more
                  <br />
                  coaching clients?
                </>
              ) : (
                <>Be one of {market.name}&rsquo;s first Tistra Coaches.</>
              )}
            </h2>
            <TrackedCta
              href={signupHref}
              event="founding_cta_click"
              props={{ ...ctaProps, placement: "final" }}
              className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-[15px] font-bold uppercase tracking-[0.04em]"
              style={{ backgroundColor: T.primaryContainer, color: T.onSurface }}
            >
              Start coaching
              <span aria-hidden="true" className="transition-transform duration-200 motion-safe:group-hover:translate-x-1">→</span>
            </TrackedCta>
            <p className="mt-4 text-[13px]" style={{ color: T.onSurfaceVariant }}>
              Free to join · No monthly fee
            </p>
          </div>
        </div>
      </section>

      <Footer />
      <StickyMobileCta href={signupHref} spotsRemaining={spots.available ? spots.remaining : null} />
    </div>
  );
}

/** The hero's supporting copy and CTA.
 *
 * Extracted because the mobile hero puts the photograph between the
 * headline and this block, while desktop keeps them in one column — and
 * two hand-maintained copies of a conversion CTA is how they end up
 * saying different things. */
function HeroCopy({
  signupHref,
  ctaProps,
  spots,
  market,
}: {
  signupHref: string;
  ctaProps: Record<string, string | number>;
  spots: Awaited<ReturnType<typeof foundingSpotsFor>>;
  market: CoachMarket;
}) {
  return (
    <>
      <p className="max-w-md text-[16px] leading-7 md:text-[18px]" style={{ color: T.onSurfaceVariant }}>
{market.heroSupport}
      </p>
      <TrackedCta
        href={signupHref}
        event="founding_cta_click"
        props={{ ...ctaProps, placement: "hero" }}
        className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-4 text-[15px] font-bold uppercase tracking-[0.04em] sm:w-auto"
        style={{ backgroundColor: T.primaryContainer, color: T.onSurface }}
      >
        Start coaching
        <span aria-hidden="true" className="transition-transform duration-200 motion-safe:group-hover:translate-x-1">→</span>
      </TrackedCta>
      <p className="mt-4 text-[13px]" style={{ color: T.onSurfaceVariant }}>
        Free to join · No monthly fee · 0% on your first {FOUNDING_FREE_BOOKINGS} bookings
        {market.live ? "" : " once we launch"}
      </p>
      <FoundingSpotsLine spots={spots} tone="dark" className="mt-2.5" />
    </>
  );
}

const CAPABILITIES = [
  { label: "Scheduling", title: "Availability that understands travel", body: "Connect your Google Calendar and set your hours. Tistra accounts for how long it takes to get across town, so it never offers a slot you can't reach." },
  { label: "Payments", title: "Paid without chasing anyone", body: "Clients pay when they book. Payouts land in your own account on a schedule you can see." },
  { label: "Clients", title: "Every client, in one place", body: "Session history, notes and goals. Pick up where you left off, even weeks later." },
  { label: "Nutrition", title: "Nutrition guidance, when it's relevant", body: "If a client chooses to share it, you'll see a simple summary of their week's eating, powered by Tistra Health — and only ever with their explicit permission." },
] as const;

function Nav({
  signupHref,
  loginHref,
  ctaProps,
}: {
  signupHref: string;
  loginHref: string;
  ctaProps: Record<string, string | number>;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{ borderColor: "rgba(74,68,85,0.5)", backgroundColor: "rgba(10,10,10,0.82)" }}
    >
      {/* Three columns rather than flex/justify-between: 1fr | auto | 1fr
          centres the section links on the viewport regardless of how wide
          the logo or the action group are. Below md the middle column
          collapses to zero width and the two outer columns still pin the
          logo left and the CTA right. */}
      <nav className="mx-auto grid max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-4 md:px-12">
        <Link
          href="/"
          className="whitespace-nowrap font-[family-name:var(--coach-display)] text-[13px] font-bold uppercase tracking-[0.08em] md:text-[15px]"
          style={{ color: T.onSurface }}
        >
          Tistra <span style={{ color: T.primary }}>Coach</span>
        </Link>

        {/* Ordered to match the page: "why" (we promote you) comes before
            "how" (the three steps), so neither link scrolls backwards. */}
        <div className="hidden items-center justify-center gap-8 md:flex">
          <Link href="#why-tistra" className="px-1 py-2 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors hover:text-white" style={{ color: T.onSurfaceVariant }}>
            Why Tistra
          </Link>
          <Link href="#how-it-works" className="px-1 py-2 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors hover:text-white" style={{ color: T.onSurfaceVariant }}>
            How it works
          </Link>
        </div>

        <div className="flex items-center justify-end gap-1 md:gap-4">
          <Link href={loginHref} className="px-3 py-2 text-[14px]" style={{ color: T.onSurfaceVariant }}>
            Sign in
          </Link>
          <TrackedCta
            href={signupHref}
            event="navbar_signup_click"
            props={{ ...ctaProps, placement: "navbar" }}
            className="rounded-full px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] md:px-5"
            style={{ backgroundColor: T.primaryContainer, color: T.onSurface }}
          >
            Start coaching
          </TrackedCta>
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: "rgba(74,68,85,0.5)", backgroundColor: T.surface }}>
      <div className="mx-auto max-w-[1280px] px-5 py-9 pb-28 text-[13px] md:px-12 md:pb-9" style={{ color: T.onSurfaceVariant }}>
        {/* pb-28 on mobile clears the sticky CTA. */}
        <p>Tistra Coach powers coaches on Tistra Club. A Tistra product.</p>
        <p className="mt-2">
          Coaches keep their own clients, rates and channels. Tistra does not guarantee enquiries or
          bookings.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
          <Link href="/terms" className="underline underline-offset-2">Terms</Link>
          <Link href="https://tistra.club" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Tistra Club</Link>
        </p>
      </div>
    </footer>
  );
}

function Section({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-[1280px] scroll-mt-20 px-5 py-14 md:px-12 md:py-20">
      {children}
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-[family-name:var(--coach-display)] text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-balance md:text-[2.75rem]"
      style={{ color: T.onSurface }}
    >
      {children}
    </h2>
  );
}
