import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCoachCalendarWeek, getCoachProfile } from "@/lib/club/coach-queries";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachCalendar } from "@/components/coach/CoachCalendar";
import { CalendarSection } from "@/components/coach/CalendarSection";
import { getCalendarState } from "@/lib/club/calendar";
import { CLUB_MARKET } from "@/lib/club/config";
import { zonedDateString, zonedWeekday, zonedTimeToInstant } from "@/lib/club/time";

/** Monday 00:00 of the week containing `date`, in the MARKET's timezone.
 *
 * setHours() would give the SERVER's midnight — 08:00 Singapore time on a
 * UTC Worker — so the week silently started eight hours late and Monday's
 * early morning fell outside it entirely. */
function weekStartOf(date: Date): Date {
  const tz = CLUB_MARKET.timezone;
  const weekday = zonedWeekday(date, tz); // 0 = Sunday
  const mondayOffset = (weekday + 6) % 7;
  const dayKey = zonedDateString(new Date(date.getTime() - mondayOffset * 864e5), tz);
  return zonedTimeToInstant(dayKey, 0, tz);
}

export default async function CoachCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=coach");

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
