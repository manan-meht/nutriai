import Link from "next/link";
import { CoachPhotoPager } from "./CoachPhotoPager";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";
import type { CoachCard } from "@/lib/club/discovery";

// Discovery feed: one large, photo-led card per coach, paged left/right for
// more photos.
//
// Deliberately a scrollable feed rather than a swipe-to-discard deck. A
// deck suits dating, where the pool is effectively infinite and a pass
// costs nothing; here the pool is small, a passed coach is gone from view,
// and the filters above only make sense against a list you can scroll back
// through. So: the size and photo-paging of a deck, the reversibility of a
// list.
//
// Facts stay on the card rather than behind a tap, because the two things
// that decide a booking — when they're next free and what it costs — are
// the two things a photo can't tell you.

const slotFmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
});

function nextAvailableLabel(next: Date | null): string {
  if (!next) return "No open slots";
  const days = Math.round((new Date(next).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  const time = slotFmt.format(next).split(", ").pop();
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return slotFmt.format(next);
}

export function CoachCardList({ coaches }: { coaches: CoachCard[] }) {
  if (coaches.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed px-6 py-14 text-center" style={{ borderColor: T.outlineVariant }}>
        <p className="text-[15px] font-medium">No coaches match that yet.</p>
        <p className="mx-auto mt-2 max-w-xs text-sm" style={{ color: T.onSurfaceVariant }}>
          Try another skill, or clear your filters to see everyone available near you.
        </p>
        <Link href="/club" className="mt-6 inline-flex rounded-full px-6 py-3 text-sm font-medium" style={{ backgroundColor: T.primary, color: T.onPrimary }}>
          Show all coaches
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-5">
      {coaches.map((c, cardIndex) => {
        const next = c.nextSlot ? new Date(c.nextSlot.startsAt) : null;
        return (
          <li
            key={c.coachProfileId}
            className="relative overflow-hidden rounded-3xl"
            style={{ backgroundColor: T.surfaceContainerLowest, boxShadow: "0 1px 2px rgba(26,27,34,0.06), 0 8px 24px -12px rgba(26,27,34,0.28)" }}
          >
            <div className="relative">
              <CoachPhotoPager photos={c.photos} name={c.displayName} eager={cardIndex === 0} />

              {/* Scrim carries the name over the photo without a hard bar.
                  Sits under the pager's tap zones, over the image. */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 pt-16"
                style={{ background: "linear-gradient(to top, rgba(12,10,20,0.82), rgba(12,10,20,0.45) 45%, rgba(12,10,20,0))" }}
              >
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-white">
                      {c.displayName}
                    </p>
                    <p className="mt-1 truncate text-sm text-white/85">
                      {c.skills.slice(0, 3).join(" · ") || c.headline}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums text-white backdrop-blur"
                        style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
                    {c.ratingAverage ? `★ ${c.ratingAverage} (${c.reviewCount})` : "New"}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
                  {c.neighbourhood && (
                    <span>{c.neighbourhood}{c.distanceKm != null ? ` · ${c.distanceKm} km` : ""}</span>
                  )}
                  {c.sessionCount > 0 && <span>{c.sessionCount} sessions</span>}
                  {c.identityVerified && <span>✓ Verified</span>}
                  {c.travelsToClient && <span>Travels to you</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.onSurfaceVariant }}>
                  Next available
                </p>
                <p className="mt-0.5 truncate text-sm font-medium">{nextAvailableLabel(next)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.onSurfaceVariant }}>
                    From
                  </p>
                  <p className="mt-0.5 text-sm font-semibold" style={{ color: T.primary }}>
                    {c.startingPriceCents != null ? formatMoney(c.startingPriceCents, c.currency) : "—"}
                  </p>
                </div>
                <Link
                  href={`/club/coaches/${c.coachProfileId}`}
                  className="rounded-full px-4 py-2.5 text-sm font-medium"
                  style={{ backgroundColor: T.primary, color: T.onPrimary }}
                >
                  View
                </Link>
              </div>
            </div>

            {/* Whole-card target for the profile, sitting beneath the pager's
                tap zones and the View button so neither is swallowed. */}
            <Link
              href={`/club/coaches/${c.coachProfileId}`}
              className="absolute inset-0 z-0"
              aria-label={`${c.displayName}, ${c.skills.slice(0, 3).join(", ")}`}
            />
          </li>
        );
      })}
    </ul>
  );
}
