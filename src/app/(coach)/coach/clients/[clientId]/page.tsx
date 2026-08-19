import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CoachShell, CoachPageHeader } from "@/components/coach/CoachShell";
import { ClientDetail } from "@/components/coach/ClientDetail";
import { getCoachProfile } from "@/lib/club/coach-queries";
import { TISTRA_HEALTH_SHARING_ENABLED } from "@/lib/club/config";

export default async function CoachClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const admin = createServiceClient();
  const coach = await getCoachProfile(admin, user.id);
  if (!coach) redirect("/settings");

  // A coach may only view someone they actually have a relationship with.
  const { data: rel } = await admin
    .from("coach_client_relationships")
    .select("session_count, last_session_at, profiles!coach_client_relationships_client_profile_id_fkey(full_name)")
    .eq("coach_profile_id", coach.id)
    .eq("client_profile_id", clientId)
    .maybeSingle();
  if (!rel) notFound();

  const [{ data: bookings }, { data: perm }] = await Promise.all([
    admin
      .from("bookings")
      .select("id, starts_at, status, coach_services(name)")
      .eq("coach_profile_id", coach.id)
      .eq("client_profile_id", clientId)
      .order("starts_at", { ascending: false })
      .limit(20),
    admin
      .from("client_coach_permissions")
      .select("nutrition_summary_enabled, revoked_at")
      .eq("coach_profile_id", coach.id)
      .eq("client_profile_id", clientId)
      .maybeSingle(),
  ]);

  // Revocation is evaluated on read, so switching sharing off takes effect
  // on the very next page load — no cache to purge (ADR-007).
  const sharingOn =
    TISTRA_HEALTH_SHARING_ENABLED && !!perm?.nutrition_summary_enabled && !perm?.revoked_at;

  const prof: any = Array.isArray(rel.profiles) ? rel.profiles[0] : rel.profiles;

  return (
    <CoachShell active="clients" coachName={coach.displayName} photoUrl={coach.photoUrl}>
      <Link href="/clients" className="mb-4 inline-block text-sm" style={{ color: "#4A4455" }}>
        ← Back to clients
      </Link>
      <CoachPageHeader title={prof?.full_name ?? "Client"} />
      <ClientDetail
        sessionCount={rel.session_count}
        lastSessionAt={rel.last_session_at}
        nutritionSharingEnabled={sharingOn}
        bookings={(bookings ?? []).map((b: any) => {
          const svc = Array.isArray(b.coach_services) ? b.coach_services[0] : b.coach_services;
          return { id: b.id, startsAt: b.starts_at, status: b.status, serviceName: svc?.name ?? null };
        })}
      />
    </CoachShell>
  );
}
