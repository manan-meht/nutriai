import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CoachShell, CoachPageHeader } from "@/components/coach/CoachShell";
import { SessionDetail } from "@/components/coach/SessionDetail";
import { getCoachProfile } from "@/lib/club/coach-queries";

export default async function CoachSessionPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=coach");

  const admin = createServiceClient();
  const coach = await getCoachProfile(admin, user.id);
  if (!coach) redirect("/settings");

  // Scoped by coach id as well as booking id: a forged booking id belonging
  // to another coach resolves to nothing rather than leaking their client.
  const { data: booking } = await admin
    .from("bookings")
    .select("id, starts_at, ends_at, status, price_cents, client_note, client_profile_id, coach_services(name), booking_locations(location_type, neighbourhood, address_line), profiles!bookings_client_profile_id_fkey(full_name)")
    .eq("id", bookingId)
    .eq("coach_profile_id", coach.id)
    .maybeSingle();
  if (!booking) notFound();

  const { data: notes } = await admin
    .from("session_notes")
    .select("private_notes, shared_summary, suggested_next_session")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const loc: any = Array.isArray(booking.booking_locations) ? booking.booking_locations[0] : booking.booking_locations;
  const svc: any = Array.isArray(booking.coach_services) ? booking.coach_services[0] : booking.coach_services;
  const prof: any = Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles;

  return (
    <CoachShell active="calendar" coachName={coach.displayName} photoUrl={coach.photoUrl}>
      <Link href="/calendar" className="mb-4 inline-block text-sm" style={{ color: "#4A4455" }}>
        ← Back to calendar
      </Link>
      <CoachPageHeader title={prof?.full_name ?? "Session"} />
      <SessionDetail
        booking={{
          id: booking.id,
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
          status: booking.status,
          priceCents: booking.price_cents,
          clientName: prof?.full_name ?? "Client",
          clientProfileId: booking.client_profile_id,
          serviceName: svc?.name ?? null,
          clientNote: booking.client_note,
          // The exact address is released to the coach only once the
          // booking is confirmed (see the location privacy rule).
          locationLabel:
            booking.status === "CONFIRMED" || booking.status === "COMPLETED"
              ? loc?.address_line ?? loc?.neighbourhood ?? null
              : loc?.neighbourhood ?? null,
          locationType: loc?.location_type ?? null,
        }}
        notes={{
          privateNotes: notes?.private_notes ?? "",
          sharedSummary: notes?.shared_summary ?? "",
          suggestedNextSession: notes?.suggested_next_session ?? "",
        }}
      />
    </CoachShell>
  );
}
