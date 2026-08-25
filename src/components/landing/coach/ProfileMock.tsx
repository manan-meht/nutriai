/** The hero visual: a Tistra Club profile card with booking and payment
 * notifications layered over it.
 *
 * Replaces the lifestyle photograph that used to sit here. The photo was
 * attractive and said nothing — a coach arriving from an ad could not tell
 * from it what Tistra does. This composition states the whole proposition
 * without a sentence: here is your profile, here is a booking, here is the
 * money.
 *
 * Built from markup rather than exported as an image so it stays sharp on
 * every display, re-flows on a phone instead of scaling down to
 * illegibility, costs no extra download beyond the coach photo already in
 * the bundle, and can be edited when the real product UI changes.
 *
 * The card is illustrative and says so in the caption. It carries a rating
 * because a real profile card does, but no coach on the platform has
 * reviews yet — which is exactly why the marketplace section further down
 * shows the real product without invented numbers.
 */

const TOKENS = {
  surfaceLowest: "#FFFFFF",
  onSurface: "#1A1B22",
  onSurfaceVariant: "#4A4455",
  outlineVariant: "#CCC3D8",
  primary: "#630ED4",
  success: "#0F7A4F",
  successSoft: "#E6F4EC",
} as const;

function Notification({
  title,
  detail,
  className,
  tone = "success",
}: {
  title: string;
  detail: string;
  className?: string;
  tone?: "success" | "neutral";
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_12px_32px_-16px_rgba(26,27,34,0.45)] ${className ?? ""}`}
      style={{ backgroundColor: TOKENS.surfaceLowest, borderColor: TOKENS.outlineVariant }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
        style={{
          backgroundColor: tone === "success" ? TOKENS.successSoft : "#EDE0FF",
          color: tone === "success" ? TOKENS.success : TOKENS.primary,
        }}
        aria-hidden="true"
      >
        {tone === "success" ? "✓" : "◎"}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-4" style={{ color: TOKENS.onSurface }}>
          {title}
        </span>
        <span className="block text-[12px] leading-4" style={{ color: TOKENS.onSurfaceVariant }}>
          {detail}
        </span>
      </span>
    </div>
  );
}

export function ProfileMock() {
  return (
    // Padding on the wrapper, not negative margins on the notifications:
    // the floating cards sit outside the profile card's box, and without
    // room reserved for them they clip on a narrow screen.
    <div className="relative mx-auto w-full max-w-[420px] px-3 py-6 md:px-6 md:py-8">
      {/* The profile card */}
      <div
        className="relative z-10 overflow-hidden rounded-3xl border shadow-[0_24px_64px_-32px_rgba(26,27,34,0.5)]"
        style={{ backgroundColor: TOKENS.surfaceLowest, borderColor: TOKENS.outlineVariant }}
      >
        {/* Plain <img>, matching the rest of this page: next/image would add
            a Worker round-trip per request for no gain over an already
            correctly sized webp. Dimensions are stated so the browser
            reserves the space and the hero does not shift as it loads. */}
        <div className="h-44 w-full overflow-hidden md:h-52">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marketing/coach-hero.webp"
            alt=""
            width={840}
            height={420}
            fetchPriority="high"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-6" style={{ color: TOKENS.onSurface }}>
                Sarah Lim
              </p>
              <p className="mt-1 text-[13px] leading-5" style={{ color: TOKENS.onSurfaceVariant }}>
                Handstands · Strength
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold"
              style={{ backgroundColor: "#EDE0FF", color: TOKENS.primary }}
            >
              ★ 4.9
            </span>
          </div>

          <div
            className="mt-4 flex items-center justify-between border-t pt-4 text-[13px]"
            style={{ borderColor: TOKENS.outlineVariant, color: TOKENS.onSurfaceVariant }}
          >
            <span>Singapore</span>
            <span className="font-semibold" style={{ color: TOKENS.onSurface }}>
              From S$80/session
            </span>
          </div>

          <div
            className="mt-4 w-full rounded-full py-2.5 text-center text-[14px] font-medium text-white"
            style={{ backgroundColor: TOKENS.primary }}
            aria-hidden="true"
          >
            Book Sarah
          </div>
        </div>
      </div>

      {/* Floating proof. Hidden below sm: on a 390px screen they would
          overlap the card itself rather than frame it, and the card alone
          still carries the message. */}
      <Notification
        title="New booking"
        detail="Maya · Tuesday 6:00 PM"
        className="absolute -left-1 top-2 z-20 hidden w-[210px] sm:flex md:-left-8"
      />
      <Notification
        title="Payment received"
        detail="S$80"
        className="absolute -right-1 bottom-16 z-20 hidden w-[180px] sm:flex md:-right-6"
      />
      <Notification
        tone="neutral"
        title="New client"
        detail="Found your profile"
        className="absolute -right-2 top-24 z-20 hidden w-[190px] lg:flex"
      />

      <p
        className="relative z-10 mt-4 text-center text-[12px] leading-4"
        style={{ color: TOKENS.onSurfaceVariant }}
      >
        Example profile
      </p>
    </div>
  );
}
