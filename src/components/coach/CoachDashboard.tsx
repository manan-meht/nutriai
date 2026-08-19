import Link from "next/link";
import { CLUB_TOKENS as T } from "./tokens";
import { CoachPageHeader } from "./CoachShell";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";
import type { CoachDashboardData, SessionSummary } from "@/lib/club/coach-queries";

// Today-first coach dashboard, following the Stitch layout: the day's
// sessions as the main column, week performance and profile health beside
// it. What a coach needs at 7am is "what's happening today and can I get
// there" — earnings and analytics are secondary, so they sit to the side.

const timeFmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function CoachDashboard({ data }: { data: CoachDashboardData }) {
  const { profile, todaySessions, week, activeClients, publishBlockers } = data;
  const firstName = profile.displayName.split(" ")[0];

  return (
    <>
      <CoachPageHeader eyebrow={dateFmt.format(new Date())} title={`Good morning, ${firstName}.`} />

      {/* Publishing blockers outrank everything: an unpublished profile
          earns nothing, so this is the one thing worth interrupting for. */}
      {profile.status !== "published" && publishBlockers.length > 0 && (
        <PublishChecklist blockers={publishBlockers} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-[-0.01em]">Today&apos;s sessions</h2>
            <Link href="/calendar" className="text-sm font-medium" style={{ color: T.primary }}>
              View calendar
            </Link>
          </div>

          {todaySessions.length === 0 ? (
            <EmptyToday openSlots={week.openSlots} published={profile.status === "published"} />
          ) : (
            <ol className="flex flex-col gap-3">
              {todaySessions.map((s, i) => (
                <SessionCard key={s.id} session={s} isNext={i === 0} previous={todaySessions[i - 1]} />
              ))}
            </ol>
          )}
        </section>

        <aside className="flex flex-col gap-5">
          <Card>
            <CardLabel>This week</CardLabel>
            <p className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
              {formatMoney(week.earningsCents)}
            </p>
            <p className="mt-1.5 text-xs" style={{ color: T.onSurfaceVariant }}>
              Your share, after platform fee
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Stat label="Sessions" value={String(week.sessionCount)} />
              <Stat label="Booked" value={`${Math.round(week.bookedRate * 100)}%`} />
            </div>
          </Card>

          {/* The growth nudge. Only shown when there's genuinely something
              to sell — an unpublished coach gets the checklist instead. */}
          {profile.status === "published" && week.openSlots > 0 && (
            <Card accent>
              <p className="text-[15px] font-medium">
                You have {week.openSlots} open {week.openSlots === 1 ? "slot" : "slots"} this week.
              </p>
              <p className="mt-2 text-sm" style={{ color: T.onSurfaceVariant }}>
                They&apos;re already visible to people searching your skills.
              </p>
              <Link
                href="/calendar"
                className="mt-4 inline-flex rounded-full px-5 py-2.5 text-sm font-medium"
                style={{ backgroundColor: T.primary, color: T.onPrimary }}
              >
                Review availability
              </Link>
            </Card>
          )}

          <Card>
            <CardLabel>Profile</CardLabel>
            <dl className="mt-3 flex flex-col gap-2.5 text-sm">
              <Row label="Status" value={<StatusPill status={profile.status} />} />
              <Row label="Active clients" value={<span className="tabular-nums">{activeClients}</span>} />
              <Row
                label="Rating"
                value={
                  <span className="tabular-nums">
                    {profile.ratingAverage ? `${profile.ratingAverage} (${profile.reviewCount})` : "No reviews yet"}
                  </span>
                }
              />
              <Row label="Sessions" value={<span className="tabular-nums">{profile.sessionCount}</span>} />
            </dl>
            <Link
              href="/settings"
              className="mt-4 inline-flex w-full items-center justify-center rounded-full border px-5 py-2.5 text-sm font-medium"
              style={{ borderColor: T.outlineVariant }}
            >
              Edit profile
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}

function SessionCard({
  session,
  isNext,
  previous,
}: {
  session: SessionSummary;
  isNext: boolean;
  previous?: SessionSummary;
}) {
  // Travel between consecutive sessions is the thing a coach most needs to
  // see at a glance; without it the day looks feasible when it isn't.
  const gapMinutes = previous
    ? Math.round((new Date(session.startsAt).getTime() - new Date(previous.endsAt).getTime()) / 60000)
    : null;
  const differentPlace = previous && previous.locationLabel !== session.locationLabel;

  return (
    <li
      className="rounded-2xl border p-4 md:p-5"
      style={{
        backgroundColor: T.surfaceContainerLowest,
        borderColor: isNext ? T.primary : T.outlineVariant,
        borderLeftWidth: isNext ? 4 : 1,
      }}
    >
      {differentPlace && gapMinutes !== null && (
        <p className="mb-3 text-xs font-medium" style={{ color: T.primary }}>
          → {gapMinutes} min gap to travel to {session.locationLabel ?? "next location"}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className="rounded-xl px-3 py-2 text-center"
            style={{ backgroundColor: T.surfaceContainer }}
          >
            <p className="text-sm font-semibold tabular-nums">{timeFmt.format(new Date(session.startsAt))}</p>
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {session.clientName}
              {session.isFirstSession && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: T.primaryContainer, color: T.primary }}
                >
                  1st session
                </span>
              )}
            </p>
            <p className="mt-0.5 text-sm" style={{ color: T.onSurfaceVariant }}>
              {session.serviceName ?? "Session"} · {session.durationMinutes} min
            </p>
            {session.locationLabel && (
              <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>
                {session.locationType === "ONLINE" ? "Online" : session.locationLabel}
              </p>
            )}
          </div>
        </div>
        <Link
          href={`/sessions/${session.id}`}
          className="rounded-full px-5 py-2.5 text-sm font-medium"
          style={
            isNext
              ? { backgroundColor: T.primary, color: T.onPrimary }
              : { border: `1px solid ${T.outlineVariant}` }
          }
        >
          {isNext ? "Start session" : "Details"}
        </Link>
      </div>
    </li>
  );
}

function EmptyToday({ openSlots, published }: { openSlots: number; published: boolean }) {
  return (
    <div
      className="rounded-2xl border border-dashed px-6 py-12 text-center"
      style={{ borderColor: T.outlineVariant }}
    >
      <p className="text-[15px] font-medium">No sessions today.</p>
      <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: T.onSurfaceVariant }}>
        {published
          ? openSlots > 0
            ? `You have ${openSlots} bookable ${openSlots === 1 ? "slot" : "slots"} this week — they're live on the marketplace now.`
            : "You have no open availability this week. Add working hours so clients can book you."
          : "Publish your profile to start appearing in search results."}
      </p>
      <Link
        href={published ? "/calendar" : "/settings"}
        className="mt-6 inline-flex rounded-full px-6 py-3 text-sm font-medium"
        style={{ backgroundColor: T.primary, color: T.onPrimary }}
      >
        {published ? "Manage availability" : "Finish your profile"}
      </Link>
    </div>
  );
}

function PublishChecklist({ blockers }: { blockers: string[] }) {
  return (
    <section
      className="mb-6 rounded-2xl border p-5 md:p-6"
      style={{ backgroundColor: T.warningContainer, borderColor: T.outlineVariant }}
    >
      <p className="text-[15px] font-semibold">Your profile isn&apos;t live yet</p>
      <p className="mt-1.5 text-sm" style={{ color: T.onSurfaceVariant }}>
        Finish these and you&apos;ll appear in search for people looking for your skills.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {blockers.map((b) => (
          <li key={b} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 shrink-0 rounded-full border"
              style={{ borderColor: T.outline }}
            />
            {b}
          </li>
        ))}
      </ul>
      <Link
        href="/settings"
        className="mt-5 inline-flex rounded-full px-5 py-2.5 text-sm font-medium"
        style={{ backgroundColor: T.primary, color: T.onPrimary }}
      >
        Continue setup
      </Link>
    </section>
  );
}

// ---- Small shared pieces --------------------------------------------

export function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        backgroundColor: accent ? T.primaryContainer : T.surfaceContainerLowest,
        borderColor: accent ? "transparent" : T.outlineVariant,
      }}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.05em]" style={{ color: T.onSurfaceVariant }}>
      {children}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: T.surfaceContainerLow }}>
      <p className="text-xs" style={{ color: T.onSurfaceVariant }}>{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: T.onSurfaceVariant }}>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; fg: string; label: string }> = {
    published: { bg: T.successContainer, fg: T.success, label: "Live" },
    draft: { bg: T.warningContainer, fg: T.warning, label: "Draft" },
    paused: { bg: T.surfaceContainer, fg: T.onSurfaceVariant, label: "Paused" },
    suspended: { bg: T.errorContainer, fg: T.error, label: "Suspended" },
  };
  const s = styles[status] ?? styles.draft;
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
