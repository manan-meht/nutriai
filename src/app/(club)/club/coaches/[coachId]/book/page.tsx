import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { ClubChrome } from "@/components/club/ClubChrome";
import { SlotPicker } from "@/components/club/SlotPicker";
import { getCoachPublicProfile, getBookableSlots } from "@/lib/club/discovery";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney, BOOKING_HOLD_MINUTES } from "@/lib/club/config";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  gone: "That time was just taken. Here are the times still open.",
  failed: "Something went wrong holding that time. Please try again.",
};

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ coachId: string }>;
  searchParams: Promise<{ service?: string; error?: string }>;
}) {
  const { coachId } = await params;
  const { service, error } = await searchParams;

  const admin = createServiceClient();
  const coach = await getCoachPublicProfile(admin, coachId);
  if (!coach || coach.services.length === 0) notFound();

  const selected = coach.services.find((s) => s.id === service) ?? coach.services[0];
  const slots = await getBookableSlots(admin, coachId, selected.id);

  return (
    <ClubChrome hideNav>
      <Link href={`/club/coaches/${coachId}`} className="text-sm" style={{ color: T.onSurfaceVariant }}>← {coach.displayName}</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.01em]">Pick a time</h1>

      {error && (
        <p role="status" className="mt-4 rounded-xl px-4 py-3 text-sm"
           style={{ backgroundColor: T.errorContainer, color: T.onErrorContainer }}>
          {ERRORS[error] ?? ERRORS.failed}
        </p>
      )}

      {coach.services.length > 1 && (
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Session type">
          {coach.services.map((s) => {
            const on = s.id === selected.id;
            return (
              <Link key={s.id} href={`/club/coaches/${coachId}/book?service=${s.id}`}
                    aria-current={on ? "true" : undefined}
                    className="rounded-full px-4 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: on ? T.primary : T.surfaceContainerLow,
                      color: on ? T.onPrimary : T.onSurfaceVariant,
                    }}>
                {s.name} · {formatMoney(s.priceCents, s.currency)}
              </Link>
            );
          })}
        </nav>
      )}

      <p className="mt-5 text-sm" style={{ color: T.onSurfaceVariant }}>
        {selected.durationMinutes} min · {formatMoney(selected.priceCents, selected.currency)} ·
        {" "}times shown in Singapore time
      </p>

      <SlotPicker
        coachProfileId={coachId}
        serviceId={selected.id}
        slots={slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() }))}
        holdMinutes={BOOKING_HOLD_MINUTES}
      />
    </ClubChrome>
  );
}
