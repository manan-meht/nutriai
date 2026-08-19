import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCoachCalendarWeek, getCoachProfile } from "@/lib/club/coach-queries";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachCalendar } from "@/components/coach/CoachCalendar";

/** Monday of the week containing `date`, at local midnight. */
function weekStartOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - offset);
  return d;
}

export default async function CoachCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const admin = createServiceClient();
  const profile = await getCoachProfile(admin, user.id);
  if (!profile) redirect("/settings");

  const params = (await searchParams) ?? {};
  const requested = params.week ? new Date(params.week) : new Date();
  const weekStart = weekStartOf(Number.isNaN(requested.getTime()) ? new Date() : requested);
  const week = await getCoachCalendarWeek(admin, user.id, weekStart);

  return (
    <CoachShell active="calendar" coachName={profile.displayName} photoUrl={profile.photoUrl}>
      <CoachCalendar week={week!} weekStart={weekStart.toISOString()} />
    </CoachShell>
  );
}
