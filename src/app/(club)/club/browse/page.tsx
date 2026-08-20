import { createClient, createServiceClient } from "@/lib/supabase/server";
import { discoverCoaches, listSkills } from "@/lib/club/discovery";
import { SwipeFeed, type SwipeCoach } from "@/components/club/SwipeFeed";
import { nextAvailableLabel } from "@/components/club/CoachCardList";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";
import { zonedDateString } from "@/lib/club/time";

// The swipe entry point: sign in on a phone, get a greeting, filter or
// don't, then swipe through one full-screen coach at a time.
//
// Everything a card shows is composed HERE and passed down as plain
// strings. The client component stays a dumb renderer: no Date parsing, no
// currency logic, nothing that could disagree with the list view about
// what "Next available" means — both surfaces share the same label
// functions.

export const dynamic = "force-dynamic";

/** One line per day, rotated deterministically — the message changes daily
 * but never mid-session, so a refresh doesn't feel like a slot machine. */
const DAILY_LINES = [
  "Consistency beats intensity. Book the next session.",
  "Strong is a habit, not an event.",
  "The right coach makes showing up the easy part.",
  "One good session this week changes the next one.",
  "Your future self is watching this swipe.",
  "Small, regular sessions beat big, rare ones.",
];

function greetingFor(hour: number, firstName: string | null): string {
  const base = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return firstName ? `${base}, ${firstName}.` : `${base}.`;
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams?: Promise<{ skill?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const admin = createServiceClient();

  // Greeting personalises when signed in, stays warm when not — the feed
  // itself is public, same as list discovery.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let firstName: string | null = null;
  if (user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    firstName = profile?.full_name?.trim().split(" ")[0] || null;
  }

  const now = new Date();
  // Hour and day in the market's timezone, not the server's — a Worker
  // runs in UTC and would otherwise say good morning at dinner time.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: CLUB_MARKET.timezone,
      hour: "2-digit",
      hour12: false,
    }).format(now)
  );
  const dayNumber = Number(zonedDateString(now, CLUB_MARKET.timezone).replace(/-/g, ""));
  const message = DAILY_LINES[dayNumber % DAILY_LINES.length];

  const [skills, coaches] = await Promise.all([
    listSkills(admin),
    discoverCoaches(admin, { skillSlug: params.skill }, now),
  ]);

  const feedCoaches: SwipeCoach[] = coaches.map((c) => ({
    id: c.coachProfileId,
    name: c.displayName,
    headline: c.headline,
    skills: c.skills.slice(0, 3),
    neighbourhood: c.neighbourhood,
    ratingLabel: c.ratingAverage ? `★ ${c.ratingAverage} (${c.reviewCount})` : "New coach",
    priceLabel:
      c.startingPriceCents != null ? `From ${formatMoney(c.startingPriceCents, c.currency)}` : null,
    nextLabel: nextAvailableLabel(c.nextSlot ? new Date(c.nextSlot.startsAt) : null),
    photo: c.photos[0] ?? c.photoUrl,
    verified: c.identityVerified,
    travels: c.travelsToClient,
  }));

  return (
    <SwipeFeed
      greeting={greetingFor(hour, firstName)}
      message={message}
      skills={skills.map((s: any) => ({ slug: s.slug, name: s.name }))}
      coaches={feedCoaches}
      activeSkill={params.skill ?? null}
    />
  );
}
