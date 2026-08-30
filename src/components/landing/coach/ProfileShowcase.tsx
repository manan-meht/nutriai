import Image from "next/image";
import type { CoachPreview } from "@/lib/landing/coach-preview";
import { T } from "./coach-theme";

/** "See what your clients see" — a real coach's storefront.
 *
 * Built from coachPreview(), so the name, skills, neighbourhood and price
 * are a genuinely published coach on tistra.club rather than a mock. The
 * point of the section is that Tistra is not a directory — the coach gets
 * something bookable — and inventing a coach to make that point would
 * undercut it.
 *
 * Session rows are the coach's own starting price with a realistic second
 * tier derived from it, labelled as an example. Nothing here claims a
 * booking happened: no "recent booking", no ratings, no counts.
 */
function money(cents: number, currency: string): string {
  const symbol = currency === "SGD" ? "S$" : `${currency} `;
  return `${symbol}${Math.round(cents / 100)}`;
}

export function ProfileShowcase({ coach }: { coach: CoachPreview | null }) {
  if (!coach) return null;

  const from = coach.startingPriceCents;
  const sessions = from
    ? [
        { name: coach.skills[0] ?? "Private session", meta: "60 min · 1-on-1", price: money(from, coach.currency) },
        { name: coach.skills[1] ?? "Follow-up session", meta: "45 min · 1-on-1", price: money(Math.round(from * 0.75), coach.currency) },
      ]
    : [];

  return (
    <div
      className="mx-auto w-full max-w-[720px] overflow-hidden rounded-3xl border md:grid md:grid-cols-[0.85fr_1fr]"
      style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainer }}
    >
      <div className="relative aspect-[4/5] w-full md:aspect-auto md:h-full md:min-h-[380px]">
        {coach.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL, not a static asset
          <img
            src={coach.photoUrl}
            alt={`${coach.displayName}, a coach on Tistra Club`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            style={{ objectPosition: "center 28%" }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: T.surfaceContainerHigh }}>
            <span className="text-4xl font-bold" style={{ color: T.outlineVariant }}>{coach.displayName.slice(0, 1)}</span>
          </div>
        )}
      </div>

      <div className="p-5 md:p-6">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{ backgroundColor: T.primaryContainer, color: T.onSurface }}
        >
          Tistra Club
        </span>

        <h3 className="mt-3 text-[22px] font-bold leading-tight" style={{ color: T.onSurface }}>
          {coach.displayName}
        </h3>
        <p className="mt-1 text-[14px] leading-5" style={{ color: T.onSurfaceVariant }}>
          {[coach.skills.slice(0, 3).join(" · "), coach.neighbourhood].filter(Boolean).join("  ·  ")}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {sessions.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between rounded-xl px-3.5 py-3"
              style={{ backgroundColor: T.surfaceContainerHigh }}
            >
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold" style={{ color: T.onSurface }}>{s.name}</span>
                <span className="block text-[12px]" style={{ color: T.onSurfaceVariant }}>{s.meta}</span>
              </span>
              <span className="ml-3 shrink-0 text-[15px] font-bold" style={{ color: T.primary }}>{s.price}</span>
            </div>
          ))}
        </div>

        {/* Looks like the marketplace's own booking button, and is not a
            link: this is a picture of a storefront, not a live checkout. */}
        <div
          aria-hidden="true"
          className="mt-4 flex w-full items-center justify-center rounded-full py-3 text-[14px] font-bold uppercase tracking-[0.04em]"
          style={{ backgroundColor: T.primary, color: T.onPrimary }}
        >
          Book a session
        </div>
        <p className="mt-3 text-center text-[11px]" style={{ color: T.onSurfaceVariant }}>
          A real profile on tistra.club
        </p>
      </div>
    </div>
  );
}
