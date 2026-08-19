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
      <Link href={`/coaches/${coachId}`} className="text-sm" style={{ color: T.onSurfaceVariant }}>← {coach.displayName}</Link>
      <h1 className="mt-2.5 text-[26px] font-semibold leading-tight tracking-[-0.015em]">Pick a time</h1>

      {error && (
        <p role="status" className="mt-4 rounded-xl px-4 py-3 text-sm"
           style={{ backgroundColor: T.errorContainer, color: T.onErrorContainer }}>
          {ERRORS[error] ?? ERRORS.failed}
        </p>
      )}

      {coach.services.length > 1 && (
        <nav className="mt-4 flex gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
             style={{ backgroundColor: T.surfaceContainerLow }} aria-label="Session type">
          {coach.services.map((s) => {
            const on = s.id === selected.id;
            return (
              <Link key={s.id} href={`/coaches/${coachId}/book?service=${s.id}`}
                    aria-current={on ? "true" : undefined}
                    className="whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium"
                    style={{
                      backgroundColor: on ? T.surfaceContainerLowest : "transparent",
                      color: on ? T.onSurface : T.onSurfaceVariant,
                      boxShadow: on ? "0 1px 2px rgba(26,27,34,0.10)" : undefined,
                    }}>
                {s.name}
              </Link>
            );
          })}
        </nav>
      )}

      {/* The facts that don't change as you scroll the rail, stated once. */}
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-sm" style={{ color: T.onSurfaceVariant }}>
        <span className="text-[17px] font-semibold" style={{ color: T.onSurface }}>
          {formatMoney(selected.priceCents, selected.currency)}
        </span>
        <span>· {selected.durationMinutes} min</span>
        <span>· Singapore time</span>
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
