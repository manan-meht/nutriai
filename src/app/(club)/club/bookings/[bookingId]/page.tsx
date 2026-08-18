import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ClubChrome } from "@/components/club/ClubChrome";
import { cancelBookingAction } from "../../actions";
import { calculateRefund, type BookingStatus, type CancellationPolicySnapshot } from "@/lib/club/booking-state";
import { resolveBookingAddress } from "@/lib/club/locations";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  weekday: "long", day: "numeric", month: "long",
  hour: "numeric", minute: "2-digit", hour12: true,
});

const STATUS_LABEL: Record<string, string> = {
  PAYMENT_PENDING: "Payment pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED_BY_CLIENT: "Cancelled by you",
  CANCELLED_BY_COACH: "Cancelled by coach",
  NO_SHOW_CLIENT: "Missed",
  NO_SHOW_COACH: "Coach did not attend",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
};

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { bookingId } = await params;
  const isNew = (await searchParams).new === "1";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?product=club&next=${encodeURIComponent(`/club/bookings/${bookingId}`)}`);

  const admin = createServiceClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, coach_profile_id, client_profile_id, status, starts_at, ends_at, price_cents, travel_fee_cents, currency, client_note, cancellation_policy_snapshot, coach_profiles(display_name, headline, photo_url), coach_services(name, duration_minutes)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) notFound();
  if (b.client_profile_id !== user.id) notFound();

  const coach: any = Array.isArray(b.coach_profiles) ? b.coach_profiles[0] : b.coach_profiles;
  const service: any = Array.isArray(b.coach_services) ? b.coach_services[0] : b.coach_services;

  // Address visibility is decided in one place, never inline on a page.
  const place = await resolveBookingAddress(admin, bookingId, b.status as BookingStatus);

  const paid = b.price_cents + (b.travel_fee_cents ?? 0);
  const refundIfCancelledNow =
    b.status === "CONFIRMED"
      ? calculateRefund({
          status: "CANCELLED_BY_CLIENT",
          paidCents: paid,
          sessionStartsAt: new Date(b.starts_at),
          cancelledAt: new Date(),
          policy: b.cancellation_policy_snapshot as CancellationPolicySnapshot,
        })
      : null;

  return (
    <ClubChrome active="bookings">
      {isNew && (
        <p role="status" className="mb-5 rounded-2xl px-4 py-3 text-sm font-medium"
           style={{ backgroundColor: T.successContainer, color: T.success }}>
          You&rsquo;re booked. {coach?.display_name} has been notified.
        </p>
      )}

      <p className="text-sm font-medium" style={{ color: b.status === "CONFIRMED" ? T.success : T.onSurfaceVariant }}>
        {STATUS_LABEL[b.status] ?? b.status}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.01em]">{service?.name ?? "Session"}</h1>
      <p className="mt-1" style={{ color: T.onSurfaceVariant }}>with {coach?.display_name}</p>

      <dl className="mt-6 flex flex-col gap-3">
        <Row label="When" value={`${when.format(new Date(b.starts_at))} · ${service?.duration_minutes ?? ""} min`} />
        <Row
          label="Where"
          value={
            place.visibility === "exact"
              ? [place.addressLine, place.neighbourhood, place.postalCode].filter(Boolean).join(", ") ||
                "Your coach will confirm the exact spot"
              : place.neighbourhood
                ? `${place.neighbourhood} — exact address shared once confirmed`
                : "Shared once confirmed"
          }
        />
        <Row label="Paid" value={formatMoney(paid, b.currency)} />
        {b.client_note && <Row label="Your note" value={b.client_note} />}
      </dl>

      {b.status === "CONFIRMED" && refundIfCancelledNow && (
        <form action={cancelBookingAction} className="mt-8 rounded-2xl border p-5"
              style={{ borderColor: T.outlineVariant }}>
          <input type="hidden" name="bookingId" value={b.id} />
          <p className="text-sm" style={{ color: T.onSurfaceVariant }}>
            Cancel now and you&rsquo;ll be refunded{" "}
            <strong style={{ color: T.onSurface }}>{formatMoney(refundIfCancelledNow.amountCents, b.currency)}</strong>
            {refundIfCancelledNow.amountCents < paid && " under this coach's cancellation policy"}.
          </p>
          <button type="submit" className="mt-3 rounded-full border px-5 py-2.5 text-sm font-medium"
                  style={{ borderColor: T.error, color: T.error }}>
            Cancel this session
          </button>
        </form>
      )}

      <Link href="/club/bookings" className="mt-8 inline-block text-sm underline" style={{ color: T.onSurfaceVariant }}>
        All bookings
      </Link>
    </ClubChrome>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: T.surfaceContainerLow }}>
      <dt className="text-xs" style={{ color: T.onSurfaceVariant }}>{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
