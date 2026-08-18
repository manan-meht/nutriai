import Link from "next/link";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";
import type { CoachCard } from "@/lib/club/discovery";

// Discovery results, following the Stitch card: image/initials block, name
// + rating, skills, neighbourhood and session count, then the two facts a
// consumer actually decides on — next availability and starting price.

const slotFmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
});

function relativeDay(d: Date): string {
  const today = new Date();
  const days = Math.round((d.setHours(0,0,0,0) - today.setHours(0,0,0,0)) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return "";
}

export function CoachCardList({ coaches }: { coaches: CoachCard[] }) {
  if (coaches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-6 py-14 text-center" style={{ borderColor: T.outlineVariant }}>
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
    <ul className="flex flex-col gap-4">
      {coaches.map((c) => {
        const next = c.nextSlot ? new Date(c.nextSlot.startsAt) : null;
        const rel = next ? relativeDay(new Date(next)) : "";
        return (
          <li key={c.coachProfileId} className="overflow-hidden rounded-2xl border" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
            <Link href={`/club/coaches/${c.coachProfileId}`} className="block p-4">
              <div className="flex items-start gap-3">
                <Avatar name={c.displayName} photoUrl={c.photoUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-tight">{c.displayName}</p>
                    <span className="shrink-0 text-sm tabular-nums" style={{ color: T.onSurfaceVariant }}>
                      {c.ratingAverage ? `★ ${c.ratingAverage}` : "New"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm" style={{ color: T.onSurfaceVariant }}>
                    {c.skills.slice(0, 3).join(" · ") || c.headline}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: T.onSurfaceVariant }}>
                    {c.neighbourhood && (
                      <span className="rounded-full px-2 py-1" style={{ backgroundColor: T.surfaceContainerLow }}>
                        {c.neighbourhood}{c.distanceKm != null ? ` · ${c.distanceKm} km` : ""}
                      </span>
                    )}
                    {c.sessionCount > 0 && <span>{c.sessionCount} sessions</span>}
                    {c.identityVerified && <span style={{ color: T.success }}>✓ Verified</span>}
                    {c.travelsToClient && <span>Travels to you</span>}
                  </div>
                </div>
              </div>
            </Link>

            <div className="flex items-end justify-between gap-4 border-t px-4 py-3" style={{ borderColor: T.outlineVariant }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: T.onSurfaceVariant }}>
                  Next available
                </p>
                <p className="mt-0.5 text-sm font-medium">
                  {next ? `${rel || slotFmt.format(next).split(",")[0]}, ${slotFmt.format(next).split(", ").pop()}` : "No open slots"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: T.onSurfaceVariant }}>
                  From
                </p>
                <p className="mt-0.5 text-sm font-semibold" style={{ color: T.primary }}>
                  {c.startingPriceCents != null ? formatMoney(c.startingPriceCents, c.currency) : "—"}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
    return <img src={photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />;
  }
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-semibold"
      style={{ backgroundColor: T.primaryContainer, color: T.primary }}
      aria-hidden="true"
    >
      {name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
    </div>
  );
}
