import Link from "next/link";
import { CLUB_TOKENS as T } from "./tokens";
import { CLUB_MARKET } from "@/lib/club/config";

const fmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone, day: "numeric", month: "short", year: "numeric",
});

export function ClientDetail({
  sessionCount,
  lastSessionAt,
  nutritionSharingEnabled,
  bookings,
}: {
  sessionCount: number;
  lastSessionAt: string | null;
  nutritionSharingEnabled: boolean;
  bookings: Array<{ id: string; startsAt: string; status: string; serviceName: string | null }>;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <section className="grid gap-4 sm:grid-cols-2">
        <Stat label="Sessions together" value={String(sessionCount)} />
        <Stat label="Last session" value={lastSessionAt ? fmt.format(new Date(lastSessionAt)) : "—"} />
      </section>

      {/* Nutrition is shown ONLY where the client explicitly granted it,
          and never as raw meal data — a summary is the most a coach ever
          receives (ADR-007). Absence is stated plainly so a coach doesn't
          think the feature is broken. */}
      <section className="rounded-2xl border p-5 md:p-6" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Nutrition</h2>
        {nutritionSharingEnabled ? (
          <p className="mt-2 text-sm" style={{ color: T.onSurfaceVariant }}>
            This client shares their nutrition summary with you. Weekly averages and their Food
            Balance Score will appear here.
          </p>
        ) : (
          <p className="mt-2 text-sm" style={{ color: T.onSurfaceVariant }}>
            This client hasn&apos;t shared their nutrition summary. Only they can turn this on, from
            their own account — you&apos;ll see a summary here if they do.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">Session history</h2>
        {bookings.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm" style={{ borderColor: T.outlineVariant, color: T.onSurfaceVariant }}>
            No sessions yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bookings.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/sessions/${b.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm"
                  style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
                >
                  <span>
                    <span className="font-medium">{fmt.format(new Date(b.startsAt))}</span>
                    {b.serviceName && <span style={{ color: T.onSurfaceVariant }}> · {b.serviceName}</span>}
                  </span>
                  <span className="text-xs capitalize" style={{ color: T.onSurfaceVariant }}>
                    {b.status.replaceAll("_", " ").toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-5" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
      <p className="text-xs font-semibold uppercase tracking-[0.05em]" style={{ color: T.onSurfaceVariant }}>{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
