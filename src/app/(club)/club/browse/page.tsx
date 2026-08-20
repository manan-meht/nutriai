import { Hanken_Grotesk } from "next/font/google";
import { createServiceClient } from "@/lib/supabase/server";
import { discoverCoaches, listSkills } from "@/lib/club/discovery";
import { SwipeFeed, type SwipeCoach, type SwipeSkill } from "@/components/club/SwipeFeed";
import { nextAvailableLabel } from "@/components/club/CoachCardList";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";

// The club homepage: hero, skill filters and the coach deck as one
// continuous vertical surface (see SwipeFeed for the geometry).
//
// One query loads the ranked page of coaches; filtering after that is
// client-side over the same data, so a chip tap updates the count and the
// peeking first coach without a navigation. ?skill= deep links still work
// — they seed the client state rather than narrowing the fetch.
//
// Everything a card shows is composed HERE and passed down as plain
// strings; the client component parses no Dates and does no currency
// maths, so the deck can never disagree with the list view about what
// "Next available" means.

export const dynamic = "force-dynamic";

// The Stitch type system pairs Hanken Grotesk with Inter; the hero carries
// the page, so it gets the real face rather than an approximation.
// Self-hosted by next/font at build time — no runtime font CDN.
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

/** Default-visible chips, in the approved order. Everything else sits
 * behind More — access to no skill is removed, only deferred. */
const PRIORITY_SKILL_SLUGS = [
  "handstands",
  "strength-training",
  "acrobatics",
  "mobility",
  "yoga",
  "muay-thai",
  "running",
];

export default async function BrowsePage({
  searchParams,
}: {
  searchParams?: Promise<{ skill?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const admin = createServiceClient();

  const now = new Date();
  const [skillRows, coaches] = await Promise.all([
    listSkills(admin),
    discoverCoaches(admin, {}, now),
  ]);

  // Priority order first, then the remainder in their existing sort order.
  const bySlug = new Map<string, SwipeSkill>(
    skillRows.map((s: any) => [s.slug, { slug: s.slug, name: s.name }])
  );
  const prioritised = PRIORITY_SKILL_SLUGS.map((slug) => bySlug.get(slug)).filter(
    (s): s is SwipeSkill => !!s
  );
  const rest = skillRows
    .map((s: any) => ({ slug: s.slug, name: s.name }))
    .filter((s: SwipeSkill) => !PRIORITY_SKILL_SLUGS.includes(s.slug));
  const orderedSkills = [...prioritised, ...rest];

  const initialSkill = params.skill && bySlug.has(params.skill) ? params.skill : null;

  const feedCoaches: SwipeCoach[] = coaches.map((c) => ({
    id: c.coachProfileId,
    name: c.displayName,
    headline: c.headline,
    skills: c.skills.slice(0, 3),
    skillSlugs: c.skillSlugs,
    neighbourhood: c.neighbourhood,
    rating: c.ratingAverage ? `${c.ratingAverage} (${c.reviewCount})` : null,
    priceLabel:
      c.startingPriceCents != null
        ? // "From S$70", not "From S$70.00" — the Stitch card drops empty cents.
          `From ${formatMoney(c.startingPriceCents, c.currency).replace(/\.00$/, "")}`
        : null,
    nextLabel: nextAvailableLabel(c.nextSlot ? new Date(c.nextSlot.startsAt) : null),
    photo: c.photos[0] ?? c.photoUrl,
    verified: c.identityVerified,
    travels: c.travelsToClient,
  }));

  return (
    <div className={hanken.className}>
      <SwipeFeed
        skills={orderedSkills}
        primaryCount={prioritised.length}
        coaches={feedCoaches}
        initialSkill={initialSkill}
        marketName={CLUB_MARKET.displayName}
      />
    </div>
  );
}
