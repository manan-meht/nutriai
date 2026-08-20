import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCoachCalendarWeek, getCoachProfile } from "@/lib/club/coach-queries";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachCalendar } from "@/components/coach/CoachCalendar";
import { CalendarSection } from "@/components/coach/CalendarSection";
import { getCalendarState } from "@/lib/club/calendar";

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
  const [week, calendar] = await Promise.all([
    getCoachCalendarWeek(admin, user.id, weekStart),
    getCalendarState(admin, profile.id),
  ]);

  return (
    <CoachShell active="calendar" coachName={profile.displayName} photoUrl={profile.photoUrl}>
      {/* Above the week, where a coach is already thinking about their
          schedule — and hidden entirely once connected, since a healthy
          integration has nothing to say. */}
      <CalendarSection state={calendar} compact />
      <CoachCalendar week={week!} weekStart={weekStart.toISOString()} />
    </CoachShell>
  );
}
