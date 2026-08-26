import { Hanken_Grotesk } from "next/font/google";
import { createServiceClient } from "@/lib/supabase/server";
import { discoverCoaches, listSkills } from "@/lib/club/discovery";
import { JsonLd } from "@/components/seo/JsonLd";
import { clubMarketplaceGraph, CLUB_URL } from "@/lib/seo/club-structured-data";
import { SwipeFeed, type SwipeCoach, type SwipeSkill } from "@/components/club/SwipeFeed";
import { nextAvailableLabel } from "@/components/club/CoachCardList";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";

// The coach deck, rendered for one of two audiences.
//
// `demo: false` is the live site: real coaches only, and today that is an
// empty deck because none have signed up yet. `demo: true` is /demo, where
// the seeded coaches live behind a label.
//
// One component rather than two near-identical pages: the deck's data
// shaping (money, next-available, photo fallbacks) is exactly what must
// not drift between the demo and the real thing, since the demo's entire
// job is to show what the real thing looks like.

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

// The Stitch type system pairs Hanken Grotesk with Inter; the hero carries
// the page, so it gets the real face rather than an approximation.
// Self-hosted by next/font at build time — no runtime font CDN.
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

export async function CoachDeck({
  skillParam,
  demo = false,
}: {
  skillParam?: string;
  demo?: boolean;
}) {
  const admin = createServiceClient();

  const now = new Date();
  const [skillRows, coaches] = await Promise.all([
    listSkills(admin),
    discoverCoaches(admin, { demo }, now),
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

  const initialSkill = skillParam && bySlug.has(skillParam) ? skillParam : null;

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
      {/* No FAQPage here: the swipe deck renders no FAQ copy, and claiming
          FAQPage without the matching visible answers is a policy
          violation. The answers live on /coaches, which emits it. */}
      <JsonLd
        data={clubMarketplaceGraph(
          CLUB_URL,
          coaches.map((c) => ({ ...c, isDemo: demo }))
        )}
      />
      <SwipeFeed
        skills={orderedSkills}
        primaryCount={prioritised.length}
        coaches={feedCoaches}
        initialSkill={initialSkill}
        marketName={CLUB_MARKET.displayName}
        demo={demo}
      />
    </div>
  );
}
