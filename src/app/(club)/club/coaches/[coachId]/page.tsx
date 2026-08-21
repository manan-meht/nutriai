import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { ClubChrome, StickyAction } from "@/components/club/ClubChrome";
import { CoachPhotoPager } from "@/components/club/CoachPhotoPager";
import { getCoachPublicProfile } from "@/lib/club/discovery";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney } from "@/lib/club/config";

export const dynamic = "force-dynamic";

export default async function CoachProfilePage({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params;
  const coach = await getCoachPublicProfile(createServiceClient(), coachId);
  // Unpublished/paused coaches are not publicly readable — 404 rather than
  // an empty page, so a paused profile can't be browsed via a stale link.
  if (!coach) notFound();

  return (
    <ClubChrome hideNav>
      <Link href="/" className="text-sm" style={{ color: T.onSurfaceVariant }}>← Back</Link>

      {/* An example profile stays reachable — old links shouldn't 404 —
          but it must never read as a real, bookable person. Placed above
          the photo so the label is seen before the face. */}
      {coach.isDemo && (
        <p
          className="mt-3 rounded-2xl px-4 py-3 text-sm"
          style={{ backgroundColor: T.primaryContainer, color: T.onSurface }}
        >
          <span className="font-semibold">This is a demo profile.</span>{" "}
          {coach.displayName} is an example used to show how Tistra Club works, not a real coach.{" "}
          <Link href="/" className="font-semibold underline underline-offset-2 hover:no-underline">
            Find real coaches
          </Link>
        </p>
      )}

      {/* Photo-led, but not full-bleed. Edge-to-edge at 4:3 took the top
          half of a phone screen before the coach's name was reachable —
          the first coach on the marketplace said it was too big. Centred
          and capped so it reads as a portrait of the coach rather than a
          banner, and so the name, rating and price sit above the fold. */}
      <div className="mx-auto mt-3 w-full max-w-[320px] overflow-hidden rounded-3xl">
        <CoachPhotoPager photos={coach.photos} name={coach.displayName} eager aspectClassName="aspect-[4/3]" />
      </div>

      <div className="mt-4">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">{coach.displayName}</h1>
        <p className="mt-1 text-[15px]" style={{ color: T.onSurfaceVariant }}>{coach.headline}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: T.onSurfaceVariant }}>
          <span>{coach.ratingAverage ? `★ ${coach.ratingAverage} (${coach.reviewCount})` : "New coach"}</span>
          {coach.neighbourhood && <span>{coach.neighbourhood}</span>}
          {coach.identityVerified && <span style={{ color: T.success }}>✓ Verified</span>}
        </p>
      </div>

      {coach.bio && <p className="mt-6 text-[15px] leading-7" style={{ color: T.onSurfaceVariant }}>{coach.bio}</p>}

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        {coach.yearsCoaching != null && <Fact label="Experience" value={`${coach.yearsCoaching} years`} />}
        {coach.languages.length > 0 && <Fact label="Languages" value={coach.languages.join(", ")} />}
        {coach.sessionCount > 0 && <Fact label="Sessions taught" value={String(coach.sessionCount)} />}
        <Fact label="Free cancellation" value={`${coach.cancellationFullRefundHours}h before`} />
      </dl>

      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-[-0.01em]">Sessions</h2>
      <ul className="flex flex-col gap-2">
        {coach.services.map((s) => (
          <li key={s.id}>
            <Link href={`/coaches/${coach.coachProfileId}/book?service=${s.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border p-4"
                  style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
              <div className="min-w-0">
                <p className="font-medium">{s.name}</p>
                <p className="mt-0.5 text-sm" style={{ color: T.onSurfaceVariant }}>
                  {s.durationMinutes} min{s.travelEnabled ? " · can come to you" : ""}
                </p>
              </div>
              <span className="shrink-0 font-semibold" style={{ color: T.primary }}>
                {formatMoney(s.priceCents, s.currency)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {coach.reviews.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold tracking-[-0.01em]">Reviews</h2>
          <ul className="flex flex-col gap-3">
            {coach.reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border p-4" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
                <p className="text-sm font-medium">{"★".repeat(r.rating)} <span style={{ color: T.onSurfaceVariant }}>· {r.authorName}</span></p>
                {r.body && <p className="mt-1.5 text-sm" style={{ color: T.onSurfaceVariant }}>{r.body}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      <StickyAction>
        <Link href={`/coaches/${coach.coachProfileId}/book`}
              className="flex w-full items-center justify-center rounded-full py-4 text-[15px] font-medium"
              style={{ backgroundColor: T.primary, color: T.onPrimary }}>
          See available times
        </Link>
      </StickyAction>
    </ClubChrome>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: T.surfaceContainerLow }}>
      <dt className="text-xs" style={{ color: T.onSurfaceVariant }}>{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
