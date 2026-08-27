import Link from "next/link";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { coachPreview } from "@/lib/landing/coach-preview";
import { foundingSpots } from "@/lib/landing/founding-spots";
import { COACH_MARKET } from "@/lib/landing/coach-market";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/club/config";
// The offer's size comes from the engine that enforces it, so the copy and
// the money cannot drift apart.
import { FOUNDING_FREE_BOOKINGS } from "@/lib/club/founding-offer";
import { ProfileMock } from "./ProfileMock";
import { TrackedCta } from "./TrackedCta";
import { StickyMobileCta } from "./StickyMobileCta";
import { FoundingOfferCard } from "./FoundingOfferCard";
import { FoundingSpotsLine } from "./FoundingSpots";
import { FoundingBadge } from "./FoundingBadge";
import { MarketplacePreview } from "./MarketplacePreview";
import { CoachFaq } from "./CoachFaq";
import { SectionView } from "./SectionView";
import { PageView } from "./PageView";

// Marketing page for Tistra Coach, served at coach.tistra.club.
//
// Sells one thing above the fold: Tistra helps you get more clients. The
// previous version led with practice management — scheduling, payments,
// client records — which is a real product but answers a question a coach
// only asks AFTER their calendar is full. Cold ad traffic has not asked it.
// Those features are still here, in section nine, under a heading that says
// as much.
//
// The Founding Coach offer is the conversion mechanism and it is stated in
// full rather than teased: 0% on the first bookings, funded promotion,
// personal setup help, no subscription, no exclusivity. What it deliberately
// does NOT say is that clients are guaranteed. We can commit to spending on
// promotion; we cannot commit to outcomes, and a coach who joins believing
// otherwise leaves within a month and tells other coaches why.
//
// Market-specific copy comes from lib/landing/coach-market.ts so that
// opening Bengaluru is editing one object, not grepping for "Singapore".
//
// Visual language is unchanged: warm off-white ground, deep charcoal type
// (never pure black), Tistra purple reserved for high-intent actions only.

/** The commercial model, stated the same way wherever it appears.
 *
 * Built from the constant the marketplace actually charges with, so the page
 * cannot advertise one number while checkout takes another. "Card processing
 * included" is the load-bearing half: the fee absorbs Stripe's cut, so there
 * is no second deduction to discover later.
 *
 * It no longer leads the page — the Founding Coach offer does — but it is
 * stated plainly rather than softened. A coach who has to hunt for the
 * number assumes the worst, and is right to. */
const PRICING_LINE =
  `Free to set up. No monthly fee. We take ${DEFAULT_PLATFORM_FEE_PERCENT}% only when you get paid ` +
  `— card processing included.`;

const TOKENS = {
  surface: "#FBF8FF",
  surfaceContainer: "#F4F2FD",
  surfaceLowest: "#FFFFFF",
  onSurface: "#1A1B22",
  onSurfaceVariant: "#4A4455",
  outlineVariant: "#CCC3D8",
  primary: "#630ED4",
  primaryHover: "#4F0BAA",
  primaryContainer: "#EDE0FF",
} as const;

/** What a coach otherwise has to do alone. Named specifically, because
 * "marketing is hard" persuades nobody who is already doing it. */
const BURDENS = [
  "Build and maintain a website",
  "Post constantly to stay visible",
  "Work out Google Ads",
  "Chase leads through DMs",
  "Juggle scheduling and payments",
] as const;

/** The funnel, in the order money moves. */
const FUNNEL = [
  {
    n: "01",
    kicker: "Get discovered",
    body: "People find you based on the skills you teach, your location, availability and profile.",
  },
  {
    n: "02",
    kicker: "Get booked",
    body: "Clients choose a session and book without endless WhatsApp back-and-forth.",
  },
  {
    n: "03",
    kicker: "Get paid",
    body: "Tistra handles payment and keeps the booking organised.",
  },
] as const;

/** Practice management, kept but demoted. Every line is something the
 * product does today. */
const CAPABILITIES = [
  {
    label: "Scheduling",
    title: "Availability that understands travel",
    body: "Connect your Google Calendar and set your hours. Tistra reads only your free/busy times, and accounts for how long it takes to get across town — so it never offers a slot you can't physically reach.",
  },
  {
    label: "Payments",
    title: "Paid without chasing anyone",
    body: "Clients pay when they book. Payouts land in your own account on a schedule you can see, with a clear record of every session, fee and refund.",
  },
  {
    label: "Clients",
    title: "Every client, in one place",
    body: "Session history, notes, homework and goals. Pick up exactly where you left off, even when it's been three weeks.",
  },
  {
    label: "Progress",
    title: "Show clients they're getting better",
    body: "Track the things that actually motivate people — first freestanding handstand, ten seconds, a kilo on the bar — and let clients watch their own timeline fill in.",
  },
  {
    label: "Nutrition",
    title: "Nutrition guidance, when it's relevant",
    body: "If a client chooses to share it, you'll see a simple summary of how their week's eating is going, powered by Tistra Health — and only ever with their explicit permission.",
  },
] as const;

export async function CoachLanding() {
  // Both cheap and both safe to fail: the preview degrades to no section,
  // the count degrades to no scarcity line. Neither can 500 an ads landing.
  const [coaches, spots] = await Promise.all([coachPreview(3), foundingSpots()]);

  const signupHref = getSignupUrl({
    product: "gym",
    source: "coach_landing",
    variant: "standard",
    productParam: "coach",
  });
  const loginHref = getLoginUrl({ product: "gym", source: "coach_landing" });
  const ctaProps = { foundingSpotsRemaining: spots.remaining };

  return (
    <div style={{ backgroundColor: TOKENS.surface, color: TOKENS.onSurface }}>
      <PageView spotsRemaining={spots.remaining} />
      <Nav signupHref={signupHref} loginHref={loginHref} spotsRemaining={spots.remaining} />

      {/* ---------------------------------------------------------- 1. Hero */}
      <SectionView event="founding_offer_view" props={ctaProps}>
        <section className="mx-auto max-w-[1280px] px-5 pb-12 pt-8 md:px-16 md:pb-16 md:pt-14">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.06em]"
                style={{ color: TOKENS.onSurfaceVariant }}
              >
                {COACH_MARKET.eyebrow}
              </p>

              <h1
                className="mt-3 max-w-2xl text-[2.375rem] font-semibold leading-[2.75rem] tracking-[-0.02em] text-balance md:text-[3.5rem] md:leading-[3.75rem]"
                style={{ color: TOKENS.onSurface }}
              >
                Get more coaching clients.
              </h1>

              <p
                className="mt-4 max-w-xl text-[17px] leading-7 md:text-[19px] md:leading-8"
                style={{ color: TOKENS.onSurfaceVariant }}
              >
                Join Tistra Club as a Founding Coach and get discovered by people looking for the
                skills you teach.
              </p>

              <p
                className="mt-4 max-w-xl rounded-2xl px-4 py-3.5 text-[16px] leading-6 md:text-[17px]"
                style={{ backgroundColor: TOKENS.primaryContainer, color: TOKENS.onSurface }}
              >
                We&rsquo;ll help build your profile and{" "}
                <span className="font-semibold">
                  actively promote you to potential clients using Tistra&rsquo;s own marketing
                  budget.
                </span>
              </p>

              {/* On desktop the offer card carries the CTA. On a phone the
                  card sits below the fold, so the hero needs its own. */}
              <div className="mt-6 lg:hidden">
                <TrackedCta
                  href={signupHref}
                  event="founding_cta_click"
                  props={{ ...ctaProps, placement: "hero" }}
                  className="flex w-full items-center justify-center rounded-full px-6 py-4 text-[16px] font-medium text-white"
                  style={{ backgroundColor: TOKENS.primary }}
                >
                  Claim my Founding Coach spot
                </TrackedCta>
                <p className="mt-3 text-center text-[13px]" style={{ color: TOKENS.onSurfaceVariant }}>
                  Free to join · No card required · No monthly fee
                </p>
                <FoundingSpotsLine spots={spots} className="mt-3 text-center" />
              </div>
            </div>

            <FoundingOfferCard spots={spots} signupHref={signupHref} className="lg:mt-1" />
          </div>
        </section>
      </SectionView>

      {/* ------------------------------------------------ 2. We promote you */}
      <div style={{ backgroundColor: TOKENS.surfaceContainer }}>
        <Section>
          <h2
            className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]"
            style={{ color: TOKENS.onSurface }}
          >
            You coach. We&rsquo;ll work on getting you discovered.
          </h2>

          <div className="mt-8 grid gap-8 md:grid-cols-2 md:gap-12">
            <div>
              <p className="text-[15px] font-medium" style={{ color: TOKENS.onSurface }}>
                Working independently usually means doing all of this yourself:
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {BURDENS.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                    <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: TOKENS.outlineVariant }} />
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[16px] leading-7 md:text-[17px]" style={{ color: TOKENS.onSurface }}>
                When people search for skills like {COACH_MARKET.skillExamples.slice(0, -1).join(", ")} or{" "}
                {COACH_MARKET.skillExamples.slice(-1)[0]}, Tistra will actively promote relevant
                coaches and skill pages.{" "}
                <span className="font-semibold">
                  Founding Coaches benefit from this promotion at Tistra&rsquo;s cost.
                </span>
              </p>
              <p className="mt-4 text-[13px] leading-5" style={{ color: TOKENS.onSurfaceVariant }}>
                Promotion does not guarantee enquiries or bookings.
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* ------------------------------------------- 3. The consumer surface */}
      <Section>
        <MarketplacePreview coaches={coaches} />
      </Section>

      {/* -------------------------------------------------- 4. Three steps */}
      <div style={{ backgroundColor: TOKENS.surfaceContainer }}>
        <Section>
          <h2
            className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]"
            style={{ color: TOKENS.onSurface }}
          >
            From profile to paid booking.
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3 md:gap-6">
            {FUNNEL.map((step) => (
              <div
                key={step.n}
                className="flex h-full flex-col rounded-2xl border p-5"
                style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}
              >
                <span className="text-[13px] font-semibold" style={{ color: TOKENS.primary }}>
                  {step.n}
                </span>
                <h3 className="mt-2 text-[18px] font-semibold leading-6" style={{ color: TOKENS.onSurface }}>
                  {step.kicker}
                </h3>
                <p className="mt-2 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ------------------------------------------ 5. Concierge onboarding */}
      <Section>
        <div className="grid items-center gap-8 md:grid-cols-[1.1fr_0.9fr] md:gap-12">
          <div>
            <h2
              className="max-w-xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]"
              style={{ color: TOKENS.onSurface }}
            >
              Don&rsquo;t have time to build your profile? We&rsquo;ll help.
            </h2>
            <p className="mt-4 max-w-xl text-[16px] leading-7 md:text-[17px]" style={{ color: TOKENS.onSurfaceVariant }}>
              Send us your Instagram, website or basic coaching details and we&rsquo;ll help get your
              Tistra profile ready — photos, services, pricing and availability. Our first coaches
              get this personally, from us.
            </p>
            <TrackedCta
              href={`${signupHref}&help=1`}
              event="onboarding_help_click"
              props={{ ...ctaProps, placement: "onboarding" }}
              className="mt-6 inline-flex items-center justify-center rounded-full border px-6 py-3 text-[15px] font-medium"
              style={{ borderColor: TOKENS.primary, color: TOKENS.primary }}
            >
              Help me set it up
            </TrackedCta>
          </div>
          <div className="lg:justify-self-end">
            <ProfileMock />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------- 6. Pricing */}
      <SectionView event="pricing_section_view" props={ctaProps}>
        <div style={{ backgroundColor: TOKENS.surfaceContainer }}>
          <Section id="pricing">
            <h2
              className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]"
              style={{ color: TOKENS.onSurface }}
            >
              Your first {FOUNDING_FREE_BOOKINGS} bookings: 0%.
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2 md:gap-12">
              <div>
                <p className="text-[17px] leading-7" style={{ color: TOKENS.onSurface }}>
                  After your first {FOUNDING_FREE_BOOKINGS} bookings, Tistra takes {DEFAULT_PLATFORM_FEE_PERCENT}% only
                  when you get paid.
                </p>
                <p className="mt-3 text-[16px] leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
                  No monthly subscription. No upfront fee. No payment to stay listed.
                </p>
                <p className="mt-3 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                  {PRICING_LINE}
                </p>
              </div>
              <div>
                <p className="text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                  That {DEFAULT_PLATFORM_FEE_PERCENT}% is what funds the marketplace: bringing clients in,
                  making coaches findable, running bookings and payments, and keeping the platform
                  going. Card processing is included in it, so there is no second deduction to
                  discover later.
                </p>
                <p className="mt-3 text-[13px] leading-5" style={{ color: TOKENS.onSurfaceVariant }}>
                  Card and PayLah charges are set by the payment provider, not by Tistra.
                </p>
              </div>
            </div>
          </Section>
        </div>
      </SectionView>

      {/* -------------------------------------------------- 7. The badge */}
      <Section>
        <div
          className="rounded-3xl border p-6 md:p-8"
          style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}
        >
          <FoundingBadge />
          <h2
            className="mt-4 max-w-xl text-[1.5rem] font-semibold leading-8 tracking-[-0.02em] text-balance md:text-[1.875rem] md:leading-10"
            style={{ color: TOKENS.onSurface }}
          >
            Founding Coaches are marked as such.
          </h2>
          <p className="mt-3 max-w-2xl text-[16px] leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
            Your profile carries a Founding Coach mark, recognising you as one of the first coaches
            on Tistra Club. It&rsquo;s a note of who was here early — it doesn&rsquo;t change how you
            rank or how clients book.
          </p>
        </div>
      </Section>

      {/* ------------------------------------------ 8. Practice management */}
      <div style={{ backgroundColor: TOKENS.surfaceContainer }}>
        <Section id="features">
          <h2
            className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]"
            style={{ color: TOKENS.onSurface }}
          >
            And once clients start booking, Tistra helps you run the rest.
          </h2>
          {/* One plain sentence saying what this app is. Google's brand
              review rejected an earlier version of this page twice for not
              explaining the product's purpose, so this must not be dropped
              in a future rewrite. */}
          <p className="mt-4 max-w-2xl text-[16px] leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
            Tistra Coach is the scheduling, payments and client-management app for independent
            coaches — {PRICING_LINE}
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2 md:gap-6">
            {CAPABILITIES.map((c) => (
              <div
                key={c.label}
                className="flex h-full flex-col rounded-2xl border p-5"
                style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}
              >
                <SectionLabel>{c.label}</SectionLabel>
                <h3 className="mt-2 text-[17px] font-semibold leading-6" style={{ color: TOKENS.onSurface }}>
                  {c.title}
                </h3>
                <p className="mt-2 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                  {c.body}
                </p>
              </div>
            ))}
          </div>
          {/* Named integration and named scope. A reviewer must be able to
              see which calendar and exactly what is read from it. */}
          <p className="mt-6 max-w-2xl text-[14px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
            <span className="font-medium" style={{ color: TOKENS.onSurface }}>Optional.</span>{" "}
            Connect your Google Calendar and Tistra reads only your free/busy times —
            {" "}
            never your event titles, guests, locations or notes. You can disconnect it at any time.
          </p>
        </Section>
      </div>

      {/* ------------------------------------------------------- 9. Trust */}
      <Section>
        <div className="max-w-2xl">
          <h2
            className="text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]"
            style={{ color: TOKENS.onSurface }}
          >
            Built for independent coaches.
          </h2>
          <p className="mt-4 text-[17px] leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
            We built Tistra because great coaches shouldn&rsquo;t have to become full-time marketers
            just to fill their calendars.
          </p>
          <p className="mt-4 text-[17px] leading-7 font-medium" style={{ color: TOKENS.onSurface }}>
            We&rsquo;re personally onboarding our first group of coaches — which is why there are
            only {COACH_MARKET.foundingCoachLimit} Founding Coach places to begin with.
          </p>
        </div>
      </Section>

      {/* --------------------------------------------------------- 10. FAQ */}
      <div style={{ backgroundColor: TOKENS.surfaceContainer }}>
        <Section>
          <CoachFaq />
        </Section>
      </div>

      {/* -------------------------------------------------- 11. Final CTA */}
      <Section>
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_0.85fr] lg:gap-14">
          <div>
            <h2
              className="max-w-xl text-[2rem] font-semibold leading-10 tracking-[-0.02em] text-balance md:text-[2.5rem] md:leading-[3rem]"
              style={{ color: TOKENS.onSurface }}
            >
              Be one of Tistra&rsquo;s Founding Coaches.
            </h2>
            <p className="mt-4 max-w-lg text-[17px] leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
              Join our first group of independent coaches and let us help you get discovered.
            </p>
          </div>
          <FoundingOfferCard spots={spots} signupHref={signupHref} placement="final" />
        </div>
      </Section>

      <Footer />

      <StickyMobileCta href={signupHref} spotsRemaining={spots.available ? spots.remaining : null} />
    </div>
  );
}

function Nav({
  signupHref,
  loginHref,
  spotsRemaining,
}: {
  signupHref: string;
  loginHref: string;
  spotsRemaining: number;
}) {
  return (
    <div
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{ borderColor: TOKENS.outlineVariant, backgroundColor: "rgba(251,248,255,0.85)" }}
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 md:px-16">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.01em]">
          Tistra <span style={{ color: TOKENS.primary }}>Coach</span>
        </Link>
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            href="#features"
            className="hidden px-3 py-2 text-[15px] md:inline-flex"
            style={{ color: TOKENS.onSurfaceVariant }}
          >
            Features
          </Link>
          <Link href={loginHref} className="px-3 py-2 text-[15px]" style={{ color: TOKENS.onSurfaceVariant }}>
            Sign in
          </Link>
          <TrackedCta
            href={signupHref}
            event="navbar_signup_click"
            props={{ foundingSpotsRemaining: spotsRemaining, placement: "navbar" }}
            className="rounded-full px-4 py-3 text-[14px] font-medium text-white md:px-5 md:py-2.5 md:text-[15px]"
            style={{ backgroundColor: TOKENS.primary }}
          >
            Join as a Founding Coach
          </TrackedCta>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="border-t" style={{ borderColor: TOKENS.outlineVariant }}>
      <div
        className="mx-auto max-w-[1280px] px-5 py-8 pb-24 text-[13px] md:px-16 md:pb-8"
        style={{ color: TOKENS.onSurfaceVariant }}
      >
        {/* pb-24 on mobile clears the sticky CTA, so the last line of the
            page is never sitting underneath it. */}
        <p>
          Tistra Coach powers coaches on Tistra Club. A Tistra product.
        </p>
        <p className="mt-2">
          Coaches keep their own clients, rates and channels. Tistra does not guarantee enquiries or
          bookings.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>
          <Link href="https://tistra.club" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Tistra Club
          </Link>
        </p>
      </div>
    </div>
  );
}

function Section({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-[1280px] scroll-mt-20 px-5 py-10 md:px-16 md:py-14">
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.05em]" style={{ color: TOKENS.onSurfaceVariant }}>
      {children}
    </p>
  );
}
