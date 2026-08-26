import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { ClubChrome, StickyAction } from "@/components/club/ClubChrome";
import { CoachPhotoPager } from "@/components/club/CoachPhotoPager";
import { getCoachPublicProfile } from "@/lib/club/discovery";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney } from "@/lib/club/config";
import { perClassCents, savingPercent } from "@/lib/club/class-packs";
import { buyPackAction } from "@/app/(club)/club/actions";
import { headers } from "next/headers";
import { isLocalDevHost } from "@/lib/club/host";
import { JsonLd } from "@/components/seo/JsonLd";
import { coachProfileGraph, CLUB_URL } from "@/lib/seo/club-structured-data";

export const dynamic = "force-dynamic";

export default async function CoachProfilePage({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params;
  const coach = await getCoachPublicProfile(createServiceClient(), coachId);

  // Same derivation as the checkout page: a hardcoded https:// once sent a
  // paying client to https://localhost, which has no TLS.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "tistra.club";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (isLocalDevHost(host) ? "http" : "https");
  const origin = `${proto}://${host}`;
  // Unpublished/paused coaches are not publicly readable — 404 rather than
  // an empty page, so a paused profile can't be browsed via a stale link.
  if (!coach) notFound();

  // Always the canonical club origin, never the request host: this is the
  // page's identity, and a preview or www host would otherwise mint a
  // second entity for the same coach.
  const graph = coachProfileGraph(
    {
      coachProfileId: coach.coachProfileId,
      displayName: coach.displayName,
      headline: coach.headline,
      neighbourhood: coach.neighbourhood,
      skills: coach.skills,
      startingPriceCents: coach.startingPriceCents,
      currency: coach.currency,
      ratingAverage: coach.ratingAverage,
      reviewCount: coach.reviewCount,
      isDemo: coach.isDemo,
      bio: coach.bio,
      yearsCoaching: coach.yearsCoaching,
      languages: coach.languages,
      photoUrl: coach.photoUrl,
      services: coach.services,
      cancellationFullRefundHours: coach.cancellationFullRefundHours,
    },
    `${CLUB_URL}/coaches/${coach.coachProfileId}`
  );

  return (
    <ClubChrome hideNav>
      {/* null for a demo profile — see coachProfileGraph. The page still
          renders and still says it is a demo; it just makes no
          machine-readable claim about a person who does not exist. */}
      {graph && <JsonLd data={graph} />}
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

      {/* Photo-led hero, matching the discovery feed — arriving from a
          large card onto a thumbnail read as a different product. */}
      <div className="-mx-5 mt-3 overflow-hidden sm:mx-0 sm:rounded-3xl">
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

      {coach.packs.length > 0 && (
        <>
          <h2 className="mb-1 mt-8 text-lg font-semibold tracking-[-0.01em]">Class packs</h2>
          <p className="mb-3 text-sm" style={{ color: T.onSurfaceVariant }}>
            Buy several classes up front and pay less for each one. Book them whenever suits you.
          </p>
          <ul className="flex flex-col gap-2">
            {coach.packs.map((p) => {
              const single = coach.services.find((s) => s.id === p.serviceId)?.priceCents ?? 0;
              const per = perClassCents(p.priceCents, p.classCount);
              const saving = savingPercent(single, p.priceCents, p.classCount);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border p-4"
                  style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{p.classCount} × {p.serviceName}</p>
                    <p className="mt-0.5 text-sm" style={{ color: T.onSurfaceVariant }}>
                      {formatMoney(per, p.currency)} a class
                      {saving > 0 ? ` · save ${saving}%` : ""}
                    </p>
                  </div>
                  {/* A form, not a link: buying starts a Stripe session and
                      creates a pending purchase, neither of which belongs
                      behind a GET a browser might prefetch. */}
                  <form action={buyPackAction} className="shrink-0">
                    <input type="hidden" name="packId" value={p.id} />
                    <input type="hidden" name="coachId" value={coach.coachProfileId} />
                    <input type="hidden" name="origin" value={origin} />
                    <button
                      type="submit"
                      className="rounded-full px-4 py-2.5 text-sm font-medium"
                      style={{ backgroundColor: T.primary, color: T.onPrimary }}
                    >
                      {formatMoney(p.priceCents, p.currency)}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </>
      )}

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
