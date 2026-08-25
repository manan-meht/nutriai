import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/club/config";
import { coachPreview, type CoachPreview } from "@/lib/landing/coach-preview";
import { ProfileMock } from "./ProfileMock";
import { TrackedCta } from "./TrackedCta";
import { StickyMobileCta } from "./StickyMobileCta";
import { OfferDetails } from "./OfferDetails";

/** The commercial model, stated the same way everywhere it appears.
 *
 * Built from the same constant the marketplace charges with, so the page
 * cannot advertise one number while checkout takes another. Previously the
 * page said "a small percentage", which a coach deciding whether to join
 * cannot act on — and which reads as evasive next to a competitor quoting
 * a figure.
 *
 * "card processing included" is the load-bearing half: the 10% absorbs
 * Stripe's fee, so there is no second deduction to discover later. */
const PRICING_LINE =
  `Free to set up. No monthly fee. We take ${DEFAULT_PLATFORM_FEE_PERCENT}% only when you get paid ` +
  `— card processing included.`;

/** How many bookings a founding coach keeps in full.
 *
 * A number, not "your first few": a coach deciding whether to join has to be
 * able to work out what the offer is worth to them.
 *
 * IMPORTANT: this is a commercial promise the checkout does not yet keep —
 * splitAmount still applies DEFAULT_PLATFORM_FEE_PERCENT to every booking.
 * Until that is implemented, every founding coach's first ten bookings have
 * to be reconciled by hand. */
const FOUNDING_FREE_BOOKINGS = 10;

// Marketing page for Tistra Coach — the coaching business platform served
// at coach.tistrahealth.com and coach.tistra.club.
//
// Rebuilt around one promise: Tistra gets you clients. The previous version
// led with "run your entire coaching practice from one place", which is
// practice-management software positioning — true, but it answers a question
// a coach only asks AFTER they have enough clients to need managing. Cold ad
// traffic has not asked it yet. The page now tells one story above the fold,
// get discovered -> get booked -> get paid, and everything below it is that
// story again in more detail.
//
// Visual language is unchanged: warm off-white ground, deep charcoal type
// (never pure black), Tistra purple reserved for high-intent actions only,
// and generous editorial spacing. Tokens are scoped to this subtree rather
// than added globally, since Tistra Health's own surfaces use a different
// palette.

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

/** The three-line promise, repeated as chips under the hero copy so it is
 * skimmable in the two seconds before someone decides to scroll. */
const HERO_CHIPS = ["Find new clients", "Manage bookings", "Get paid"] as const;

/** The funnel, as the coach experiences it. One section, three steps, in
 * the order money actually moves. */
const FUNNEL = [
  {
    n: "01",
    kicker: "Get discovered",
    title: "Your profile, in front of people searching",
    body:
      "Create your coach profile with your skills, pricing, location and availability. " +
      "Potential clients find you through Tistra Club.",
  },
  {
    n: "02",
    kicker: "Get booked",
    title: "They pick a time that actually works",
    body:
      "Clients choose a session and an available time without endless messages back and forth. " +
      "Connect your Google Calendar and Tistra reads only your free/busy times, so it never " +
      "offers a slot you cannot make.",
  },
  {
    n: "03",
    kicker: "Get paid",
    title: "Money arrives without you chasing it",
    body:
      "Clients pay when they book. Tistra handles payment processing and keeps your bookings " +
      "and session records organised automatically.",
  },
] as const;

function formatFrom(cents: number | null, currency: string): string | null {
  if (cents == null) return null;
  const symbol = currency === "SGD" ? "S$" : `${currency} `;
  return `${symbol}${Math.round(cents / 100)}`;
}

/** Benefits, written as outcomes rather than features. */
const BENEFITS = [
  {
    title: "More ways to get clients",
    body:
      "Your profile is discoverable through Tistra Club, and through the client acquisition " +
      "campaigns we run to bring people to it.",
  },
  {
    title: "Less admin",
    body:
      "Availability, booking and scheduling happen without endless WhatsApp messages, and " +
      "without you holding your week in your head.",
  },
  {
    title: "Simple payments",
    body:
      "Clients pay when they book, and your session records stay organised automatically — " +
      "no invoices, no chasing, no spreadsheet.",
  },
] as const;

/** The reassurance strip. Every line is a commitment the product already
 * keeps — nothing aspirational, because a coach who finds one of these
 * untrue will not believe the other four. */
const REASSURANCE = [
  "No monthly fee",
  "No long-term contract",
  "Publish or unpublish anytime",
  "Google Calendar shows free/busy only",
  "Secure payment processing",
] as const;

/** The six surfaces of the product, in the order a coach actually meets
 * them: get found, get booked, run the day, get paid, keep clients
 * improving, and — last — nutrition. */
const CAPABILITIES = [
  {
    label: "Marketplace",
    title: "Get found by people looking for your skill",
    body: "A profile that shows your services, rates and genuine availability. Clients filter by skill, neighbourhood and time, and book the slot themselves.",
  },
  {
    label: "Scheduling",
    title: "Availability that understands travel",
    body: "Connect your Google Calendar and set your hours. Tistra reads only your free/busy times, so it never offers a slot you can't physically reach — it accounts for where your last session was and how long it takes to get across town.",
  },
  {
    label: "Clients",
    title: "Every client, in one place",
    body: "Session history, notes, homework and goals. Pick up exactly where you left off, even when it's been three weeks.",
  },
  {
    label: "Payments",
    title: "Paid without chasing anyone",
    body: "Clients pay when they book. Payouts land in your account on a schedule you can see, with a clear record of every session, fee and refund.",
  },
  {
    label: "Progress",
    title: "Show clients they're getting better",
    body: "Track the things that actually motivate people — first freestanding handstand, ten seconds, a kilo on the bar — and let clients watch their own timeline fill in.",
  },
  {
    label: "Nutrition",
    title: "Nutrition guidance, when it's relevant",
    body: "If a client chooses to share it, you'll see a simple summary of how their week's eating is going — powered by Tistra Health. One feature among several, and only ever with their explicit permission.",
  },
] as const;

export async function CoachLanding() {
  // Three is enough to read as a marketplace without turning the section
  // into a directory that competes with the signup CTA.
  const coaches = await coachPreview(3);

  const signupHref = getSignupUrl({
    product: "gym",
    source: "coach_landing",
    variant: "standard",
    productParam: "coach",
  });
  const loginHref = getLoginUrl({ product: "gym", source: "coach_landing" });

  return (
    <div
      style={{ backgroundColor: TOKENS.surface, color: TOKENS.onSurface }}
      className="min-h-screen font-[system-ui,-apple-system,'Segoe_UI',sans-serif] antialiased"
    >
      <Nav signupHref={signupHref} loginHref={loginHref} />

      {/* ---- Hero: get clients, in five seconds ---- */}
      <header className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 pt-10 pb-14 md:grid-cols-12 md:gap-16 md:px-16 md:pt-16 md:pb-16">
        {/* Copy first in the DOM, so on a phone the headline and CTA occupy
            the first viewport and the mockup follows. A large image before
            the CTA is the single most reliable way to lose mobile ad
            traffic. */}
        <Reveal className="md:col-span-6">
          <p
            className="text-xs font-semibold uppercase tracking-[0.05em]"
            style={{ color: TOKENS.primary }}
          >
            Now signing up our first coaches in Singapore
          </p>

          <h1 className="mt-4 max-w-2xl text-[2.125rem] font-semibold leading-[2.5rem] tracking-[-0.02em] text-balance md:text-[3.25rem] md:leading-[3.5rem]">
            Get more coaching clients.
            <br />
            <span style={{ color: TOKENS.primary }}>We handle the rest.</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
            Get discovered by people looking for your skills. Let them book, pay and schedule
            sessions with you — all in one place.
          </p>

          {/* Chips, not cards: three words each, scannable without reading. */}
          <ul className="mt-6 flex flex-wrap gap-2">
            {HERO_CHIPS.map((chip) => (
              <li
                key={chip}
                className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px]"
                style={{
                  borderColor: TOKENS.outlineVariant,
                  backgroundColor: TOKENS.surfaceLowest,
                  color: TOKENS.onSurface,
                }}
              >
                <span aria-hidden="true" style={{ color: TOKENS.primary }}>
                  ✓
                </span>
                {chip}
              </li>
            ))}
          </ul>

          {/* One dominant action. The secondary is a text link, deliberately
              not an outlined button of equal size — two equal buttons make a
              visitor choose between them instead of clicking the one that
              matters. */}
          <div className="mt-8 flex flex-col items-start gap-3">
            <TrackedCta
              href={signupHref}
              event="hero_get_listed_click"
              className="inline-flex w-full items-center justify-center rounded-full px-8 py-4 text-[16px] font-semibold text-white transition-colors sm:w-auto"
              style={{ backgroundColor: TOKENS.primary }}
            >
              Get listed for free →
            </TrackedCta>
            <p className="text-[13px]" style={{ color: TOKENS.onSurfaceVariant }}>
              No monthly fees · Quick setup
            </p>
            <TrackedCta
              href="#how-it-works"
              event="see_how_it_works_click"
              className="text-[15px] underline underline-offset-4"
              style={{ color: TOKENS.onSurfaceVariant }}
            >
              See how it works ↓
            </TrackedCta>
          </div>

          {/* The offer, compressed. It answers "why now", which is the second
              question — so it sits below the CTA as one line that expands,
              rather than three paragraphs someone has to read past. */}
          <OfferDetails
            freeBookings={FOUNDING_FREE_BOOKINGS}
            feePercent={DEFAULT_PLATFORM_FEE_PERCENT}
          />

          <p className="mt-4 max-w-xl text-[13px] leading-5" style={{ color: TOKENS.onSurfaceVariant }}>
            {PRICING_LINE}
          </p>
        </Reveal>

        <Reveal className="md:col-span-6" direction="right" delay={120}>
          <ProfileMock />
        </Reveal>
      </header>

      {/* ---- The funnel ---- */}
      <Section id="how-it-works">
        <Reveal>
          <SectionLabel>How Tistra works</SectionLabel>
          <h2 className="mt-4 max-w-2xl text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
            From profile to paying client.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
            Discover → Book → Pay. Three steps, and Tistra does the middle one for you.
          </p>
        </Reveal>

        <ol className="mt-10 grid gap-6 md:grid-cols-3 md:gap-8">
          {FUNNEL.map((s, i) => (
            <li key={s.n} className="relative flex">
              <Reveal delay={i * 90} className="flex w-full">
                <div
                  className="h-full rounded-2xl border p-6"
                  style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums"
                      style={{ backgroundColor: TOKENS.primaryContainer, color: TOKENS.primary }}
                    >
                      {s.n}
                    </span>
                    <span className="text-[13px] font-semibold uppercase tracking-[0.04em]" style={{ color: TOKENS.primary }}>
                      {s.kicker}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-medium leading-6 text-balance">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                    {s.body}
                  </p>
                </div>
              </Reveal>
              {/* The connector that makes three cards read as one funnel.
                  Decorative, so it is hidden from assistive tech and drops
                  away entirely when the cards stack on a phone. */}
              {i < FUNNEL.length - 1 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-[-1.35rem] top-1/2 hidden -translate-y-1/2 text-xl md:block"
                  style={{ color: TOKENS.outlineVariant }}
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </Section>

      {/* ---- What the client sees ----

          Real listings, not mockups: these are the coaches genuinely live on
          Tistra Club right now, rendered from the same query the marketplace
          itself runs. A coach reading this is looking at the page their own
          profile will join, which is a stronger argument than any
          illustration of one.

          The whole section disappears when there are no live coaches. An
          empty marketplace shown to a prospective coach argues against
          joining, and a fabricated one would be a lie they discover on day
          two. */}
      {coaches.length > 0 && (
        <Section>
          <Reveal>
            <SectionLabel>The marketplace</SectionLabel>
            <h2 className="mt-4 max-w-2xl text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
              This is what clients see.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
              Clients browse Tistra Club by skill, neighbourhood and when they&rsquo;re free. These
              coaches are live today &mdash; your profile sits alongside them, with your own
              skills, rates and neighbourhood.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {coaches.map((c: CoachPreview, i: number) => {
              const from = formatFrom(c.startingPriceCents, c.currency);
              return (
                <Reveal key={c.id} delay={i * 70} className="flex">
                  <div
                    className="flex w-full flex-col overflow-hidden rounded-2xl border"
                    style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceLowest }}
                  >
                    {/* Square. Coach portraits are shot portrait or square —
                        these three are 1.00, 0.89 and 0.86 — so the landscape
                        strip this replaced was discarding more than half the
                        image height and cutting heads off. A square keeps
                        essentially all of Jo's photo and around 88% of the
                        other two.

                        The marketplace itself uses 4:5, which is better still
                        for a portrait, but at this width that makes a 722px
                        card and roughly 2,200px of scroll on a phone — too
                        much for a section whose job is to sell the idea, not
                        to be browsed. */}
                    <div className="aspect-square w-full overflow-hidden" style={{ backgroundColor: TOKENS.primaryContainer }}>
                      {c.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.photoUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                          // Same bias the marketplace itself uses (SwipeFeed):
                          // coach portraits put the face in the upper third, so a
                          // centred crop takes the top of the head off.
                          style={{ objectPosition: "center 35%" }}
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-[16px] font-semibold">{c.displayName}</p>
                      {c.skills.length > 0 && (
                        <p className="mt-1 text-[13px] leading-5" style={{ color: TOKENS.onSurfaceVariant }}>
                          {c.skills.join(" · ")}
                        </p>
                      )}
                      {c.neighbourhood && (
                        <p className="mt-1 text-[13px] leading-5" style={{ color: TOKENS.onSurfaceVariant }}>
                          {c.neighbourhood}
                        </p>
                      )}
                      {/* No rating and no "next available" chip. Nobody here
                          has been reviewed yet, and a live availability chip
                          costs a Google Calendar round-trip per coach on a
                          paid-traffic landing page — see lib/landing/coach-preview. */}
                      <div className="mt-auto pt-4">
                        {from && <p className="text-[15px] font-semibold">From {from}/session</p>}
                        <div
                          className="mt-3 w-full rounded-full border py-2 text-center text-[13px] font-medium"
                          style={{ borderColor: TOKENS.outlineVariant, color: TOKENS.onSurfaceVariant }}
                          aria-hidden="true"
                        >
                          View profile
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <p className="mt-5 text-[13px]" style={{ color: TOKENS.onSurfaceVariant }}>
            Live coaches on Tistra Club. Ratings appear once clients start leaving them.
          </p>
        </Section>
      )}

      {/* ---- Benefits ---- */}
      <Section id="features">
        <Reveal>
          <SectionLabel>Why coaches join</SectionLabel>
          <h2 className="mt-4 max-w-2xl text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
            Spend less time finding and managing clients.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3 md:gap-8">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 90}>
              <h3
                className="border-t pt-4 text-lg font-medium"
                style={{ borderColor: TOKENS.outlineVariant }}
              >
                {b.title}
              </h3>
              <p className="mt-2 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                {b.body}
              </p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---- The differentiator, given its own room ---- */}
      <Section>
        <div
          className="rounded-3xl px-7 py-10 md:px-16 md:py-12"
          style={{ backgroundColor: TOKENS.primaryContainer }}
        >
          <div className="grid gap-10 md:grid-cols-12 md:gap-16">
            <div className="md:col-span-6">
              <SectionLabel>Why coaches stay</SectionLabel>
              <h2 className="mt-4 text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
                It knows you can&apos;t be in two places at once.
              </h2>
              <p className="mt-5 text-lg leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
                Most booking tools treat your day as a row of empty boxes. Tistra checks the
                journey between sessions, so a client in Bukit Timah can&apos;t book the slot
                straight after your East Coast session.
              </p>
            </div>
            <div className="md:col-span-6">
              <ul className="space-y-4">
                {CAPABILITIES.map((c) => (
                  <li key={c.label}>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.04em]" style={{ color: TOKENS.primary }}>
                      {c.label}
                    </p>
                    <p className="mt-1 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                      <span className="font-medium" style={{ color: TOKENS.onSurface }}>
                        {c.title}.
                      </span>{" "}
                      {c.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* ---- Reassurance ---- */}
      <Section>
        <div
          className="rounded-3xl border px-6 py-8 md:px-10 md:py-10"
          style={{ borderColor: TOKENS.outlineVariant, backgroundColor: TOKENS.surfaceContainer }}
        >
          <Reveal>
            <SectionLabel>No surprises</SectionLabel>
            <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              {REASSURANCE.map((r) => (
                <li key={r} className="inline-flex items-center gap-2 text-[15px]">
                  <span aria-hidden="true" style={{ color: TOKENS.primary }}>
                    ✓
                  </span>
                  {r}
                </li>
              ))}
            </ul>
            {/* Kept verbatim for Google's brand review, which rejected this
                page twice for not explaining what the app is or what it does
                with Google data. Below the fold, where it informs rather than
                interrupts the pitch. */}
            <p className="mt-6 max-w-3xl text-[14px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
              Tistra Coach is the scheduling, payments and client-management app for independent
              coaches and personal trainers. Connect your Google Calendar and Tistra reads only
              your free/busy times — never your event titles, guests, locations or notes.
              Optional. The rest of Tistra Coach works without it.
            </p>
            <p className="mt-3 max-w-3xl text-[14px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
              {PRICING_LINE}
            </p>
          </Reveal>
        </div>
      </Section>

      {/* ---- Close ---- */}
      <Section>
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="max-w-xl text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
              Ready to get discovered?
            </h2>
            <p className="mt-4 max-w-lg text-lg leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
              Create your coach profile and be among the first coaches clients find on Tistra Club
              Singapore.
            </p>
            <p className="mt-3 max-w-lg text-[14px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
              Founding coaches keep 100% of their first {FOUNDING_FREE_BOOKINGS} bookings.
            </p>
          </div>
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto">
            <TrackedCta
              href={signupHref}
              event="final_get_listed_click"
              className="inline-flex w-full shrink-0 items-center justify-center rounded-full px-8 py-4 text-[16px] font-semibold text-white transition-colors sm:w-auto"
              style={{ backgroundColor: TOKENS.primary }}
            >
              Get listed for free →
            </TrackedCta>
            <p className="text-[13px]" style={{ color: TOKENS.onSurfaceVariant }}>
              No monthly fees · Quick setup
            </p>
          </div>
        </div>
      </Section>

      <footer
        className="mt-10 border-t pb-24 md:pb-0"
        style={{ borderColor: TOKENS.outlineVariant }}
      >
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-5 py-10 text-sm md:flex-row md:items-center md:justify-between md:px-16">
          {/* Tistra Coach is not a feature of Tistra Health. The family is
              Tistra: Club is the consumer marketplace, Coach is the operating
              system behind it, Health is an optional nutrition integration. */}
          <p style={{ color: TOKENS.onSurfaceVariant }}>
            Tistra Coach powers coaches on Tistra Club.{" "}
            <span className="whitespace-nowrap">A Tistra product.</span>
          </p>
          <nav className="flex flex-wrap gap-6" style={{ color: TOKENS.onSurfaceVariant }}>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href={loginHref} className="hover:underline">Sign in</Link>
          </nav>
        </div>
      </footer>

      {/* Phone only, and only after scrolling. */}
      <StickyMobileCta href={signupHref} />
    </div>
  );
}

function Nav({ signupHref, loginHref }: { signupHref: string; loginHref: string }) {
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
            event="nav_get_listed_click"
            className="rounded-full px-4 py-3 text-[14px] font-medium text-white md:px-5 md:py-2.5 md:text-[15px]"
            style={{ backgroundColor: TOKENS.primary }}
          >
            Get listed for free
          </TrackedCta>
        </div>
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
