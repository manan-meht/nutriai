import { CoachDeck } from "../deck";

// The showcase: the same deck, populated with seeded example coaches.
//
// It exists so the product can be demonstrated while the real marketplace
// is empty. Two things keep that honest: every visitor sees a label at the
// top of the first screen, and the page is excluded from search indexing —
// nobody should arrive here from Google believing these coaches are
// bookable.

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Demo | Tistra Club",
  description: "A walkthrough of Tistra Club using example coaches.",
  robots: { index: false, follow: false },
};

export default async function DemoPage({
  searchParams,
}: {
  searchParams?: Promise<{ skill?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return <CoachDeck skillParam={params.skill} demo />;
}
