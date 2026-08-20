import { CoachDeck } from "../deck";

// The club homepage: hero, skill filters and the coach deck as one
// continuous vertical surface (see SwipeFeed for the geometry).
//
// Real coaches only. The seeded examples that used to appear here now live
// at /demo — a marketplace whose front page is populated by invented
// people is misleading, however good it looks.

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tistra Club | Find a coach in Singapore",
  description: "Choose a skill, meet the right coach, and start moving forward.",
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams?: Promise<{ skill?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return <CoachDeck skillParam={params.skill} />;
}
