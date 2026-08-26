import { CLUB_FAQ } from "./club-faq";

/** Schema.org structured data for Tistra Club — the client-facing
 * marketplace at tistra.club.
 *
 * Separate from lib/seo/structured-data.ts on purpose. That file describes
 * Tistra Health, a different product on a different domain with a different
 * audience; the two must never be emitted on the same page, or each
 * dilutes the other's entity.
 *
 * The valuable pages here are the coach profiles, not the homepage: a
 * profile is the page that answers "who can teach me handstands in
 * Singapore and what does it cost", which is the question worth being
 * cited for. Those get Person + Service + Offer with real prices.
 */

export const CLUB_URL = "https://tistra.club";

const ORG_ID = `${CLUB_URL}/#organization`;
const WEBSITE_ID = `${CLUB_URL}/#website`;

/** Singapore, everywhere. Availability, travel time, pricing and payouts
 * are all built around one market, so this is a fact about the product
 * rather than a placeholder to widen later. */
const AREA_SERVED = {
  "@type": "Country",
  name: "Singapore",
} as const;

const ORGANIZATION = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: "Tistra Club",
  url: CLUB_URL,
  description:
    "A marketplace for finding and booking in-person fitness and sports coaches in Singapore, with real availability and fixed prices.",
  areaServed: AREA_SERVED,
  parentOrganization: { "@type": "Organization", name: "Tistra", url: "https://tistra.sg" },
} as const;

function webSite() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: CLUB_URL,
    name: "Tistra Club",
    inLanguage: "en-SG",
    publisher: { "@id": ORG_ID },
  };
}

/** One coach as they appear in a listing. Loosely typed on purpose — this
 * takes the fields it needs rather than importing CoachCard, so a change
 * to the discovery query shape can't silently reshape the schema. */
export interface CoachListingInput {
  coachProfileId: string;
  displayName: string;
  headline: string | null;
  neighbourhood: string | null;
  skills: string[];
  startingPriceCents: number | null;
  currency: string;
  ratingAverage: number | null;
  reviewCount: number;
  isDemo?: boolean;
}

export interface CoachServiceInput {
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  travelEnabled: boolean;
}

export interface CoachProfileInput extends CoachListingInput {
  bio: string | null;
  yearsCoaching: number | null;
  languages: string[];
  photoUrl: string | null;
  services: CoachServiceInput[];
  cancellationFullRefundHours: number;
}

const money = (cents: number) => (cents / 100).toFixed(2);

/**
 * The marketplace page: an ItemList of the coaches actually shown, plus
 * the FAQ.
 *
 * Demo profiles are filtered out rather than listed. They are labelled as
 * examples in the UI, but structured data has no equivalent label — a
 * seeded profile in an ItemList is simply a claim that a bookable coach
 * exists, which is a fabricated listing.
 */
export function clubMarketplaceGraph(
  pageUrl: string,
  coaches: CoachListingInput[],
  includeFaq = false
) {
  const real = coaches.filter((c) => !c.isDemo);

  const graph: Record<string, unknown>[] = [
    ORGANIZATION as unknown as Record<string, unknown>,
    webSite(),
    {
      "@type": "CollectionPage",
      "@id": `${pageUrl}#page`,
      url: pageUrl,
      name: "Find a coach in Singapore",
      about: { "@id": ORG_ID },
      isPartOf: { "@id": WEBSITE_ID },
      ...(real.length > 0 && {
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: real.length,
          itemListElement: real.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${CLUB_URL}/coaches/${c.coachProfileId}`,
            name: c.displayName,
          })),
        },
      }),
    },
  ];

  if (includeFaq) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: CLUB_FAQ.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: `${entry.tldr} ${entry.detail}` },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * A single coach's profile page.
 *
 * Returns null for a demo profile. A seeded example carries a fabricated
 * name, bio, rating and price; emitting that as Person + Offer would be
 * publishing invented listings and invented reviews as though they were
 * real, which is exactly what structured-data spam policies exist to stop.
 * The page still renders and still says it is a demo — it just makes no
 * machine-readable claim.
 */
export function coachProfileGraph(coach: CoachProfileInput, pageUrl: string) {
  if (coach.isDemo) return null;

  const personId = `${pageUrl}#coach`;
  const active = coach.services;

  const person: Record<string, unknown> = {
    "@type": "Person",
    "@id": personId,
    name: coach.displayName,
    url: pageUrl,
    jobTitle: "Coach",
    ...(coach.headline && { description: coach.headline }),
    ...(coach.bio && { disambiguatingDescription: coach.bio }),
    ...(coach.photoUrl && { image: coach.photoUrl }),
    ...(coach.skills.length > 0 && { knowsAbout: coach.skills }),
    ...(coach.languages.length > 0 && { knowsLanguage: coach.languages }),
    areaServed: coach.neighbourhood
      ? { "@type": "Place", name: `${coach.neighbourhood}, Singapore` }
      : AREA_SERVED,
    worksFor: { "@id": ORG_ID },
  };

  // Only when there are real reviews behind it. An aggregateRating with a
  // reviewCount of 0 is both invalid and a spam signal.
  if (coach.ratingAverage != null && coach.reviewCount > 0) {
    person.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: coach.ratingAverage,
      reviewCount: coach.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const services = active.map((s, i) => ({
    "@type": "Service",
    "@id": `${pageUrl}#service-${i + 1}`,
    name: s.name,
    ...(s.description && { description: s.description }),
    serviceType: coach.skills[0] ?? "Coaching",
    provider: { "@id": personId },
    areaServed: AREA_SERVED,
    ...(s.travelEnabled && {
      availableChannel: {
        "@type": "ServiceChannel",
        name: "Coach travels to the client",
        serviceUrl: pageUrl,
      },
    }),
    offers: {
      "@type": "Offer",
      price: money(s.priceCents),
      priceCurrency: s.currency,
      url: pageUrl,
      availability: "https://schema.org/InStock",
      // The duration belongs to what is being sold, not to the delivery
      // of a physical good, so it goes on the Offer's item rather than
      // being mistaken for a shipping estimate.
      eligibleDuration: {
        "@type": "QuantitativeValue",
        value: s.durationMinutes,
        unitCode: "MIN",
      },
    },
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      person,
      ...services,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Find a coach", item: CLUB_URL },
          { "@type": "ListItem", position: 2, name: "Coaches", item: `${CLUB_URL}/coaches` },
          { "@type": "ListItem", position: 3, name: coach.displayName, item: pageUrl },
        ],
      },
    ],
  };
}
