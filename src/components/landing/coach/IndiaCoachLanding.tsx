import Link from "next/link";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { foundingSpotsFor } from "@/lib/landing/founding-spots";
import { IN_COACH_MARKET, cityForMarket } from "@/lib/landing/coach-market";
import { FOUNDING_FREE_BOOKINGS } from "@/lib/club/founding-offer";
import { TrackedCta } from "./TrackedCta";
import { StickyMobileCta } from "./StickyMobileCta";
import { FoundingSpotsLine, FoundingSpotsReason } from "./FoundingSpots";
import { FoundingBadge } from "./FoundingBadge";
import { SectionView } from "./SectionView";
import { PageView } from "./PageView";

// The India coach landing.
//
// A SEPARATE component from CoachLanding on purpose. That page is the live
// Google Ads destination for Singapore and must not move; keeping India out
// of it means the ads page cannot be broken by an India change, and the
// guarantee is verifiable rather than promised — see
// __tests__/coach-market-isolation.test.ts, which asserts CoachLanding
// carries no India market at all.
//
// The other reason is honesty. Tistra cannot take a booking in India yet:
// payments run on Stripe Connect and the Razorpay Route work is not built.
// So this page recruits coaches for an opening market and says so. It does
// NOT promise clients can pay through Tistra tomorrow, because they cannot,
// and a coach who signs up believing otherwise finds out within a week.
//
// Visual language is shared with the Singapore page deliberately — same
// tokens, same rhythm — so the two read as one product in two markets.

const TOKENS = {
  surface: "#FBF8FF",
  surfaceContainer: "#F4F2FD",
  surfaceLowest: "#FFFFFF",
  onSurface: "#1A1B22",
  onSurfaceVariant: "#4A4455",
  outlineVariant: "#CCC3D8",
  primary: "#630ED4",
  primaryContainer: "#EDE0FF",
} as const;

const MARKET = IN_COACH_MARKET;

/** What a Founding Coach gets here. Every line is something we can do
 * before payments exist: a profile, promotion, and help building it. The
 * commission line is stated as what happens WHEN bookings open, not as
 * something available now. */
const OFFER_LINES = [
  { strong: `0% commission on your first ${FOUNDING_FREE_BOOKINGS} bookings`, rest: " once bookings open in India" },
  { strong: "Tistra-funded promotion", rest: " of your profile" },
  { strong: "Personal help", rest: " setting up your profile" },
  { strong: "No monthly subscription", rest: "" },
  { strong: "No exclusivity", rest: "" },
] as const;

const BURDENS = [
  "Build and maintain a website",
  "Post constantly to stay visible",
  "Work out Google Ads",
  "Chase leads through DMs",
  "Juggle scheduling and payments",
] as const;

const FUNNEL = [
  { n: "01", kicker: "Get discovered", body: "People find you by the skills you teach, your area, your availability and your profile." },
  { n: "02", kicker: "Get booked", body: "Clients pick a session and book it, without endless WhatsApp back-and-forth." },
  { n: "03", kicker: "Get paid", body: "Tistra handles payment and keeps the booking organised." },
] as const;

const FAQ = [
  {
    q: "Is Tistra live in India yet?",
    a: "Not for bookings. We're signing up our first Indian coaches now and building the profile and discovery side around them. Payments in India are still being built, so nobody can book and pay through Tistra here yet.",
  },
  {
    q: "So what am I signing up for?",
    a: "A Founding Coach place: we build your profile with you, promote it at our cost as we open the market, and you keep 100% of your first ten bookings once booking goes live.",
  },
  {
    q: "What will it cost?",
    a: "Nothing to join and nothing monthly. When bookings open, Tistra takes a commission only when you get paid — and your first ten bookings are free of it.",
  },
  {
    q: "Am I guaranteed clients?",
    a: "No. Tistra does not guarantee enquiries or bookings. We can commit to promoting Founding Coaches at our own cost; we cannot commit to how many people book.",
  },
  {
    q: "Do I need to leave Instagram or my existing clients?",
    a: "No. Keep every client and channel you have. Tistra is an extra way to be found, not a replacement, and there is no exclusivity.",
  },
  {
    q: "Which cities are you opening in?",
    a: "We're starting with coaches in Mumbai, Delhi NCR, Bengaluru, Pune, Hyderabad and Chennai. If you coach elsewhere in India, sign up anyway — where our coaches are is what decides where we open next.",
  },
  {
    q: "Who can join as a coach?",
    a: "Independent coaches and instructors — strength, yoga, movement, sport and mobility. We verify identity before any profile goes live.",
  },
] as const;

export async function IndiaCoachLanding({ city }: { city?: string | null }) {
  const spots = await foundingSpotsFor(MARKET);
  const named = cityForMarket(MARKET, city);

  const signupHref = getSignupUrl({
    product: "gym",
    source: "coach_landing_in",
    variant: "standard",
    productParam: "coach",
  });
  const loginHref = getLoginUrl({ product: "gym", source: "coach_landing_in" });
  const ctaProps = { foundingSpotsRemaining: spots.remaining, landingVariant: "in" };

  return (
    <div style={{ backgroundColor: TOKENS.surface, color: TOKENS.onSurface }}>
      <PageView spotsRemaining={spots.remaining} />
      <Nav signupHref={signupHref} loginHref={loginHref} ctaProps={ctaProps} />

      {/* ------------------------------------------------------------ Hero */}
      <SectionView event="founding_offer_view" props={ctaProps}>
        <section className="mx-auto max-w-[1280px] px-5 pb-12 pt-8 md:px-16 md:pb-16 md:pt-14">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: TOKENS.onSurfaceVariant }}>
                {named ? `For independent coaches in ${named}` : MARKET.eyebrow}
              </p>

              <h1
                className="mt-3 max-w-2xl text-[2.375rem] font-semibold leading-[2.75rem] tracking-[-0.02em] text-balance md:text-[3.5rem] md:leading-[3.75rem]"
                style={{ color: TOKENS.onSurface }}
              >
                Get more coaching clients.
              </h1>

              <p className="mt-4 max-w-xl text-[17px] leading-7 md:text-[19px] md:leading-8" style={{ color: TOKENS.onSurfaceVariant }}>
                Tistra Club is opening in {named ?? MARKET.name}. Join as a Founding Coach and be one of
                the first people clients find when we launch.
              </p>

              <p
                className="mt-4 max-w-xl rounded-2xl px-4 py-3.5 text-[16px] leading-6 md:text-[17px]"
                style={{ backgroundColor: TOKENS.primaryContainer, color: TOKENS.onSurface }}
              >
                We&rsquo;ll help build your profile and{" "}
                <span className="font-semibold">
                  actively promote you to potential clients using Tistra&rsquo;s own marketing budget.
                </span>
              </p>

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

            {/* The offer, restated so nothing here implies bookings work today. */}
            <div className="rounded-3xl border p-6 md:p-7 lg:mt-1" style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em]" style={{ color: TOKENS.primary }}>
                Founding Coach offer
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {OFFER_LINES.map((line) => (
                  <li key={line.strong} className="flex items-start gap-2.5 text-[15px] leading-6">
                    <svg width="16" height="16" viewBox="0 0 16 16" className="mt-1 shrink-0" aria-hidden="true"
                      fill="none" stroke={TOKENS.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8.5l3.2 3.2L13 5" />
                    </svg>
                    <span style={{ color: TOKENS.onSurface }}>
                      <span className="font-semibold">{line.strong}</span>
                      {line.rest}
                    </span>
                  </li>
                ))}
              </ul>

              <TrackedCta
                href={signupHref}
                event="founding_cta_click"
                props={{ ...ctaProps, placement: "offer_card" }}
                className="mt-6 flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[16px] font-medium text-white"
                style={{ backgroundColor: TOKENS.primary }}
              >
                Claim my Founding Coach spot
              </TrackedCta>
              <p className="mt-3 text-center text-[13px]" style={{ color: TOKENS.onSurfaceVariant }}>
                Free to join · No card required · No monthly fee
              </p>

              {spots.available && (
                <div className="mt-5 border-t pt-4" style={{ borderColor: TOKENS.outlineVariant }}>
                  <FoundingSpotsLine spots={spots} />
                  <FoundingSpotsReason className="mt-1.5" />
                </div>
              )}
            </div>
          </div>

          {/* Said plainly, near the offer rather than buried at the bottom. */}
          <p className="mt-8 max-w-2xl text-[14px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
            <span className="font-medium" style={{ color: TOKENS.onSurface }}>Where we are:</span>{" "}
            Tistra Club is live in Singapore and opening in {MARKET.name}. Clients cannot book and pay
            through Tistra in India yet — we&rsquo;re building that now, and Founding Coaches are the
            profiles it opens with.
          </p>
        </section>
      </SectionView>

      {/* -------------------------------------------------- We promote you */}
      <div style={{ backgroundColor: TOKENS.surfaceContainer }}>
        <Section>
          <h2 className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]" style={{ color: TOKENS.onSurface }}>
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
                When people search for skills like {MARKET.skillExamples.slice(0, -1).join(", ")} or{" "}
                {MARKET.skillExamples.slice(-1)[0]}, Tistra will actively promote relevant coaches and
                skill pages.{" "}
                <span className="font-semibold">Founding Coaches benefit from this promotion at Tistra&rsquo;s cost.</span>
              </p>
              <p className="mt-4 text-[13px] leading-5" style={{ color: TOKENS.onSurfaceVariant }}>
                Promotion does not guarantee enquiries or bookings.
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* -------------------------------------------------------- The funnel */}
      <Section>
        <h2 className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]" style={{ color: TOKENS.onSurface }}>
          From profile to paid booking.
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3 md:gap-6">
          {FUNNEL.map((step) => (
            <div key={step.n} className="flex h-full flex-col rounded-2xl border p-5" style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}>
              <span className="text-[13px] font-semibold" style={{ color: TOKENS.primary }}>{step.n}</span>
              <h3 className="mt-2 text-[18px] font-semibold leading-6" style={{ color: TOKENS.onSurface }}>{step.kicker}</h3>
              <p className="mt-2 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>{step.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[14px]" style={{ color: TOKENS.onSurfaceVariant }}>
          This is how Tistra Club works in Singapore today.{" "}
          <Link href="https://tistra.club/coaches" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2" style={{ color: TOKENS.primary }}>
            See the live marketplace
          </Link>
        </p>
      </Section>

      {/* ------------------------------------------------------ Concierge */}
      <div style={{ backgroundColor: TOKENS.surfaceContainer }}>
        <Section>
          <h2 className="max-w-xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]" style={{ color: TOKENS.onSurface }}>
            Don&rsquo;t have time to build your profile? We&rsquo;ll help.
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-7 md:text-[17px]" style={{ color: TOKENS.onSurfaceVariant }}>
            Send us your Instagram, website or basic coaching details and we&rsquo;ll help get your
            Tistra profile ready. Our first coaches get this personally, from us.
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
        </Section>
      </div>

      {/* ---------------------------------------------------------- Badge */}
      <Section>
        <div className="rounded-3xl border p-6 md:p-8" style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}>
          <FoundingBadge />
          <h2 className="mt-4 max-w-xl text-[1.5rem] font-semibold leading-8 tracking-[-0.02em] text-balance md:text-[1.875rem] md:leading-10" style={{ color: TOKENS.onSurface }}>
            Founding Coaches are marked as such.
          </h2>
          <p className="mt-3 max-w-2xl text-[16px] leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
            Your profile carries a Founding Coach mark, recognising you as one of the first coaches on
            Tistra Club in {MARKET.name}. It&rsquo;s a note of who was here early — it doesn&rsquo;t
            change how you rank or how clients book.
          </p>
        </div>
      </Section>

      {/* ------------------------------------------------------------ FAQ */}
      <div style={{ backgroundColor: TOKENS.surfaceContainer }}>
        <Section>
          <SectionView event="faq_view" props={ctaProps} id="faq">
            <h2 className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]" style={{ color: TOKENS.onSurface }}>
              Questions coaches ask us.
            </h2>
            <dl className="mt-8 flex flex-col gap-5">
              {FAQ.map((item) => (
                <div key={item.q} className="rounded-2xl border p-5" style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}>
                  <dt className="text-[16px] font-semibold leading-6" style={{ color: TOKENS.onSurface }}>{item.q}</dt>
                  <dd className="mt-2 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>{item.a}</dd>
                </div>
              ))}
            </dl>
          </SectionView>
        </Section>
      </div>

      {/* ------------------------------------------------------ Final CTA */}
      <Section>
        <div className="max-w-2xl">
          <h2 className="text-[2rem] font-semibold leading-10 tracking-[-0.02em] text-balance md:text-[2.5rem] md:leading-[3rem]" style={{ color: TOKENS.onSurface }}>
            Be one of Tistra&rsquo;s Founding Coaches in {named ?? MARKET.name}.
          </h2>
          <p className="mt-4 text-[17px] leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
            Join our first group of independent coaches and let us help you get discovered.
          </p>
          <TrackedCta
            href={signupHref}
            event="founding_cta_click"
            props={{ ...ctaProps, placement: "final" }}
            className="mt-6 inline-flex items-center justify-center rounded-full px-7 py-3.5 text-[16px] font-medium text-white"
            style={{ backgroundColor: TOKENS.primary }}
          >
            Claim my Founding Coach spot
          </TrackedCta>
          <p className="mt-3 text-[13px]" style={{ color: TOKENS.onSurfaceVariant }}>
            Free profile · No subscription · No exclusivity
          </p>
          <FoundingSpotsLine spots={spots} className="mt-3" />
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
  ctaProps,
}: {
  signupHref: string;
  loginHref: string;
  ctaProps: Record<string, string | number>;
}) {
  return (
    <div className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: TOKENS.outlineVariant, backgroundColor: "rgba(251,248,255,0.85)" }}>
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 md:px-16">
        <Link href="/india" className="text-[15px] font-semibold tracking-[-0.01em]">
          Tistra <span style={{ color: TOKENS.primary }}>Coach</span>
        </Link>
        <div className="flex items-center gap-2 md:gap-4">
          <Link href={loginHref} className="px-3 py-2 text-[15px]" style={{ color: TOKENS.onSurfaceVariant }}>Sign in</Link>
          <TrackedCta
            href={signupHref}
            event="navbar_signup_click"
            props={{ ...ctaProps, placement: "navbar" }}
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
      <div className="mx-auto max-w-[1280px] px-5 py-8 pb-24 text-[13px] md:px-16 md:pb-8" style={{ color: TOKENS.onSurfaceVariant }}>
        <p>Tistra Coach powers coaches on Tistra Club. A Tistra product.</p>
        <p className="mt-2">
          Coaches keep their own clients, rates and channels. Tistra does not guarantee enquiries or
          bookings. Bookings and payments are not yet available in {MARKET.name}.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
          <Link href="/terms" className="underline underline-offset-2">Terms</Link>
          <Link href="https://tistra.club" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Tistra Club</Link>
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
