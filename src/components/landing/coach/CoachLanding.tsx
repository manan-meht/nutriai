import Link from "next/link";
import { getSignupUrl, getLoginUrl } from "@/lib/landing/routes";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/club/config";

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
  `\u2014 card processing included.`;

// Marketing page for Tistra Coach — the coaching business platform served
// at coach.tistrahealth.com.
//
// This deliberately replaces GymImmersiveLanding, whose entire pitch was
// "track your clients' meals". That framing made nutrition the product,
// which is why the old coach product had seven signups and zero clients
// between them: a coach with no clients has nothing to track. Tistra Coach
// leads with the business — getting found, filling the calendar, getting
// paid — and presents nutrition guidance as one capability among several.
//
// Visual language follows the Stitch "Tistra Editorial Marketplace" system:
// warm off-white ground, deep charcoal type (never pure black), Tistra
// purple reserved for high-intent actions only, and generous editorial
// spacing. Tokens are scoped to this subtree rather than added globally,
// since Tistra Health's own surfaces use a different palette.

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
    body: "Connect your calendar and set your hours. Tistra never offers a slot you can't physically reach — it accounts for where your last session was and how long it takes to get across town.",
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

const STEPS = [
  { n: "01", title: "Build your profile", body: "Skills, services, rates, where you coach and how far you'll travel." },
  { n: "02", title: "Connect your calendar", body: "We read only free/busy — never your event titles, guests or notes." },
  { n: "03", title: "Publish and get booked", body: "Appear in search, take bookings, and get paid automatically." },
] as const;

/** A marketing photo.
 *
 * next/image is deliberately not used: these are fixed, hand-picked assets
 * on a static marketing page, and the optimiser adds a Worker round-trip
 * per request for no gain over a correctly sized webp. Dimensions are
 * stated so the browser reserves the space and the hero does not shift
 * under the CTA as it loads. */
function MarketingImage({
  src,
  alt,
  aspect = "aspect-[4/5]",
  priority,
}: {
  src: string;
  alt: string;
  aspect?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      // eslint-disable-next-line @next/next/no-img-element
      className={`w-full ${aspect} rounded-3xl object-cover`}
      style={{ backgroundColor: TOKENS.surfaceLowest }}
    />
  );
}

export function CoachLanding() {
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

      {/* ---- Hero: the business, not the food log ---- */}
      <header className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 pt-16 pb-20 md:grid-cols-12 md:gap-16 md:px-16 md:pt-28 md:pb-32">
        <div className="md:col-span-7">
        <p
          className="text-xs font-semibold uppercase tracking-[0.05em]"
          style={{ color: TOKENS.primary }}
        >
          For coaches in Singapore
        </p>
        <h1
          className="mt-5 max-w-4xl text-[2rem] font-semibold leading-[2.5rem] tracking-[-0.02em] text-balance md:text-5xl md:leading-[3.5rem]"
        >
          Run your entire coaching practice from one place.
        </h1>
        <p
          className="mt-6 max-w-2xl text-lg leading-7"
          style={{ color: TOKENS.onSurfaceVariant }}
        >
          Get discovered by new clients, fill your calendar without the back-and-forth,
          take payment automatically, and keep every client's progress in one place.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={signupHref}
            className="inline-flex items-center justify-center rounded-full px-8 py-4 text-[15px] font-medium text-white transition-colors"
            style={{ backgroundColor: TOKENS.primary }}
          >
            Start coaching on Tistra
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-full border-2 px-8 py-4 text-[15px] font-medium transition-colors"
            style={{ borderColor: TOKENS.outlineVariant, color: TOKENS.onSurface }}
          >
            See how it works
          </Link>
        </div>

        {/* Sits directly under the CTA, above the fold at both 390px and
            1440px: the commercial model is the first question a coach asks,
            and burying it costs the signup. max-w keeps the sentence to two
            lines on mobile rather than a ragged four. */}
        <p
          className="mt-6 max-w-xl text-sm leading-6"
          style={{ color: TOKENS.onSurfaceVariant }}
        >
          {PRICING_LINE}
        </p>
        </div>

        {/* Ordered AFTER the copy so on mobile it follows the pricing line
            rather than pushing it below the fold — the commercial model is
            the thing that must be seen without scrolling. On desktop it
            takes the right-hand half, which was empty. */}
        <div className="md:col-span-5">
          <MarketingImage
            src="/marketing/coach-hero.webp"
            alt="A trainer coaching a client through a kettlebell squat in a naturally lit gym"
            priority
          />
        </div>
      </header>

      {/* ---- The gap this closes ---- */}
      <Section>
        <div className="grid gap-10 md:grid-cols-12 md:gap-16">
          <div className="md:col-span-5">
            <SectionLabel>The problem</SectionLabel>
            <h2 className="mt-4 text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
              Coaching is the easy part.
            </h2>
          </div>
          <div className="md:col-span-7">
            <p className="text-lg leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
              Finding clients, agreeing times over WhatsApp, remembering who owes you for
              last Tuesday, working out whether you can get from East Coast to Bukit Timah
              in half an hour — that's the part that eats the week.
            </p>
            <p className="mt-4 text-lg leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
              Tistra Coach handles the business so you can spend your time actually coaching.
            </p>
            <div className="mt-8">
              <MarketingImage
                src="/marketing/coach-practice.webp"
                alt="A coach correcting one client's form during a small outdoor group session in a Singapore park"
                aspect="aspect-[16/9]"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ---- Capabilities ---- */}
      <Section id="features">
        <SectionLabel>What you get</SectionLabel>
        <h2 className="mt-4 max-w-2xl text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
          Everything a coaching business needs, and nothing it doesn't.
        </h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <article
              key={c.label}
              className="rounded-2xl border p-7"
              style={{ backgroundColor: TOKENS.surfaceLowest, borderColor: TOKENS.outlineVariant }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-[0.05em]"
                style={{ color: TOKENS.primary }}
              >
                {c.label}
              </p>
              <h3 className="mt-3 text-lg font-medium leading-6 text-balance">{c.title}</h3>
              <p className="mt-3 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                {c.body}
              </p>
            </article>
          ))}
        </div>
      </Section>

      {/* ---- The differentiator, given its own room ---- */}
      <Section>
        <div
          className="rounded-3xl px-7 py-12 md:px-16 md:py-16"
          style={{ backgroundColor: TOKENS.primaryContainer }}
        >
          <div className="grid gap-10 md:grid-cols-12 md:gap-16">
            <div className="md:col-span-6">
              <SectionLabel>Why coaches stay</SectionLabel>
              <h2 className="mt-4 text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
                It knows you can't be in two places at once.
              </h2>
              <p className="mt-5 text-lg leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
                Most booking tools treat your day as a row of empty boxes. Tistra checks the
                journey between them — so a client in Bukit Timah is never offered 3:30pm
                when you're finishing in East Coast at 3:00.
              </p>
            </div>
            <div className="md:col-span-6">
              <div
                className="rounded-2xl border p-6"
                style={{ backgroundColor: TOKENS.surfaceLowest, borderColor: TOKENS.outlineVariant }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.05em]" style={{ color: TOKENS.onSurfaceVariant }}>
                  Tuesday
                </p>
                <ul className="mt-4 space-y-3 text-[15px]">
                  <li className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">2:00 PM · Client session</span>
                    <span style={{ color: TOKENS.onSurfaceVariant }}>East Coast</span>
                  </li>
                  <li
                    className="flex items-baseline gap-2 rounded-lg px-3 py-2 text-[13px]"
                    style={{ backgroundColor: TOKENS.surfaceContainer, color: TOKENS.primary }}
                  >
                    <span aria-hidden="true">→</span>
                    <span>35 min travel — 3:30 PM not offered</span>
                  </li>
                  <li className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">4:00 PM · Bookable</span>
                    <span style={{ color: TOKENS.onSurfaceVariant }}>Bukit Timah</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ---- How it works ---- */}
      <Section id="how-it-works">
        <SectionLabel>Getting started</SectionLabel>
        <h2 className="mt-4 max-w-2xl text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
          Set up once, then get on with coaching.
        </h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-10">
          {STEPS.map((s) => (
            <li key={s.n}>
              <div
                className="text-sm font-semibold tabular-nums"
                style={{ color: TOKENS.primary }}
              >
                {s.n}
              </div>
              <h3 className="mt-3 border-t pt-4 text-lg font-medium" style={{ borderColor: TOKENS.outlineVariant }}>
                {s.title}
              </h3>
              <p className="mt-2 text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---- Privacy, stated plainly rather than buried ---- */}
      <Section>
        <div
          className="rounded-2xl border p-7 md:p-10"
          style={{ backgroundColor: TOKENS.surfaceLowest, borderColor: TOKENS.outlineVariant }}
        >
          <SectionLabel>Your data, and your clients&apos;</SectionLabel>
          <div className="mt-5 grid gap-6 md:grid-cols-3 md:gap-10">
            <p className="text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
              <strong className="font-medium" style={{ color: TOKENS.onSurface }}>
                Your calendar stays private.
              </strong>{" "}
              We read free/busy only. Clients see that a time is unavailable — never what
              you were doing.
            </p>
            <p className="text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
              <strong className="font-medium" style={{ color: TOKENS.onSurface }}>
                Your address stays private.
              </strong>{" "}
              Discovery shows your neighbourhood. An exact address is shared only once a
              booking is confirmed, and only if you choose.
            </p>
            <p className="text-[15px] leading-6" style={{ color: TOKENS.onSurfaceVariant }}>
              <strong className="font-medium" style={{ color: TOKENS.onSurface }}>
                Nutrition is opt-in.
              </strong>{" "}
              You only see a client&apos;s nutrition summary if they explicitly turn it on,
              and they can switch it off at any moment.
            </p>
          </div>
        </div>
      </Section>

      {/* ---- Close ---- */}
      <Section>
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="max-w-xl text-2xl font-medium leading-8 tracking-[-0.01em] text-balance md:text-[2rem] md:leading-10">
              Start taking bookings this week.
            </h2>
            <p className="mt-4 max-w-lg text-lg leading-7" style={{ color: TOKENS.onSurfaceVariant }}>
              {PRICING_LINE}
            </p>
          </div>
          <Link
            href={signupHref}
            className="inline-flex shrink-0 items-center justify-center rounded-full px-8 py-4 text-[15px] font-medium text-white transition-colors"
            style={{ backgroundColor: TOKENS.primary }}
          >
            Create your coach profile
          </Link>
        </div>
      </Section>

      <footer
        className="mt-10 border-t"
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
          <Link
            href={signupHref}
            className="rounded-full px-5 py-2.5 text-[15px] font-medium text-white"
            style={{ backgroundColor: TOKENS.primary }}
          >
            Get started
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Consistent editorial rhythm — the design system's section-gap, applied
 * once here rather than repeated per section. */
function Section({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-[1280px] px-5 py-14 md:px-16 md:py-20">
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
