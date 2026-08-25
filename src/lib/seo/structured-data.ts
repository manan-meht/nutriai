import { HEALTH_FAQ } from "./faq";

/** Schema.org structured data for Tistra Health's public marketing pages.
 *
 * Built as data, not JSX, so the shapes can be asserted in tests
 * (see __tests__/seo-structured-data.test.ts) — a JSON-LD block is easy to
 * break silently, since an invalid graph renders exactly like a valid one
 * and simply stops being read.
 *
 * Emitted as a single @graph with cross-references by @id rather than as
 * several loose blocks. That way the SoftwareApplication, the Service and
 * the FAQPage are understood as facets of one entity instead of three
 * unrelated things that happen to share a page.
 *
 * IMPORTANT: this describes Tistra Health only. It must never be mounted
 * from src/app/layout.tsx — that layout is shared with the (club) and
 * (coach) route groups, which serve different products on different
 * domains, and this graph would then assert Tistra Health's identity on
 * tistra.club and coach.tistra.club too.
 */

export const SITE_URL = "https://tistrahealth.com";

/** Stable @id anchors. Fragment ids on the canonical origin, which is the
 * convention for identifying entities that have no URL of their own. */
const ORG_ID = `${SITE_URL}/#organization`;
const APP_ID = `${SITE_URL}/#software`;
const SERVICE_ID = `${SITE_URL}/#service`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** The population the product is designed for.
 *
 * Expressed as `audience` / PeopleAudience rather than `targetPopulation`:
 * schema.org defines targetPopulation on MedicalStudy and MedicalGuideline,
 * not on SoftwareApplication or Service, so it would be dropped as an
 * unrecognised property on both types here. PeopleAudience.audienceType
 * carries the same meaning and is valid on both.
 */
const AUDIENCE = {
  "@type": "PeopleAudience",
  audienceType:
    "Family caregivers, adult children supporting aging parents, elderly parents, older adults, seniors",
  suggestedMinAge: 18,
} as const;

const ORGANIZATION = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: "Tistra",
  url: "https://tistra.sg",
  brand: { "@type": "Brand", name: "Tistra Health" },
} as const;

/** The product as software. `applicationCategory` uses Google's documented
 * HealthApplication value; the dietary-tracking specialisation goes in
 * `applicationSubCategory`, which is where a non-enumerated refinement
 * belongs. */
function softwareApplication() {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: "Tistra Health",
    url: SITE_URL,
    applicationCategory: "HealthApplication",
    applicationSubCategory: "DietaryTracking",
    operatingSystem: "WhatsApp / Web Browser",
    browserRequirements: "Requires WhatsApp for meal logging. Dashboard requires a modern web browser.",
    description:
      "Tistra Health turns a WhatsApp meal photo into plain-language nutrition insight. An aging parent sends a photo of their meal to a WhatsApp contact; the family caregiver sees the meal history and weekly patterns on a web dashboard. The person logging meals installs nothing and creates no account.",
    featureList: [
      "AI photo-based nutrition logging via WhatsApp message",
      "Text-only meal logging from a plain-language description",
      "Calorie, protein, carbohydrate and fat estimation per meal",
      "Confirm-or-correct step before any meal is saved",
      "Weekly pattern summaries instead of daily calorie targets",
      "Permissioned family dashboard for a remote caregiver",
      "One-time-code sign-in for the person being tracked",
      "Recognition of home-cooked and mixed-cuisine meals",
    ],
    audience: AUDIENCE,
    provider: { "@id": ORG_ID },
    offers: {
      "@type": "Offer",
      "@id": `${SITE_URL}/#offer-family`,
      url: `${SITE_URL}/pricing`,
      price: "8.99",
      priceCurrency: "USD",
      category: "subscription",
      description:
        "Family plan, founding-member pricing: two people included, additional people USD 3.99 per month. Self plan for one person is USD 4.99 per month.",
      availability: "https://schema.org/InStock",
      eligibleDuration: {
        "@type": "QuantitativeValue",
        value: 1,
        unitCode: "MON",
      },
    },
    // Stated explicitly because the honest answer is "no, but it starts
    // free" — a 14-day trial is not the same claim as a free product.
    isAccessibleForFree: false,
    // The boundary of what this software is. Load-bearing for an assistant
    // deciding whether it is safe to recommend for a clinical need.
    disambiguatingDescription:
      "A consumer nutrition-awareness tool. Not a medical device, not an emergency response or elder-monitoring system, and not a source of medical advice. It does not diagnose, treat, or manage any medical condition, and nobody is alerted if a meal goes unlogged.",
  };
}

/** The same product framed as the service a caregiver buys, which is the
 * shape that answers "what can I use to help my mother eat better" rather
 * than "what app should I download". */
function service() {
  return {
    "@type": "Service",
    "@id": SERVICE_ID,
    name: "Tistra Health nutrition tracking for families",
    url: SITE_URL,
    serviceType: "WhatsApp-based nutrition tracking for aging parents and family caregivers",
    description:
      "A remote caregiver sets up Tistra Health and invites the person they support over WhatsApp. That person sends meal photos to a WhatsApp number; the caregiver sees nutrition estimates and weekly eating patterns on a dashboard, with the tracked person's permission.",
    provider: { "@id": ORG_ID },
    audience: AUDIENCE,
    // Global by design: the whole point is that the caregiver and the
    // person they support can be in different countries.
    areaServed: { "@type": "Place", name: "Worldwide" },
    availableChannel: [
      {
        "@type": "ServiceChannel",
        name: "WhatsApp meal logging",
        serviceUrl: SITE_URL,
        description:
          "Meals are logged by sending a photo or a plain-text description to Tistra Health on WhatsApp. No app install and no account are required of the person logging.",
      },
      {
        "@type": "ServiceChannel",
        name: "Family dashboard",
        serviceUrl: `${SITE_URL}/family`,
        description: "Web dashboard where the caregiver reads meal history and weekly patterns.",
      },
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Tistra Health plans",
      url: `${SITE_URL}/pricing`,
      itemListElement: [
        {
          "@type": "Offer",
          name: "Self",
          price: "4.99",
          priceCurrency: "USD",
          description: "Track your own meals. One person included.",
        },
        {
          "@type": "Offer",
          name: "Family",
          price: "8.99",
          priceCurrency: "USD",
          description:
            "Support a parent, partner, or child. Two people included; additional people USD 3.99 per month.",
        },
      ],
    },
    termsOfService: `${SITE_URL}/terms`,
  };
}

/** FAQPage built from the same entries the page renders. Google requires
 * the answer text to be visible on the page, which the shared HEALTH_FAQ
 * guarantees by construction. tldr and detail are joined because the
 * rendered answer is both paragraphs. */
function faqPage(pageUrl: string) {
  // The homepage's canonical form has no path, so a bare `${SITE_URL}#faq`
  // would read as a fragment on the origin rather than on the document.
  // Every other @id here is anchored on "<origin>/", so match that.
  const anchor = pageUrl === SITE_URL ? `${SITE_URL}/` : pageUrl;
  return {
    "@type": "FAQPage",
    "@id": `${anchor}#faq`,
    mainEntity: HEALTH_FAQ.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${entry.tldr} ${entry.detail}`,
      },
    })),
  };
}

function webSite() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: "Tistra Health",
    publisher: { "@id": ORG_ID },
  };
}

/**
 * The full graph for a Tistra Health marketing page.
 *
 * @param pageUrl canonical URL of the page this is rendered on — only used
 * to scope the FAQPage @id, so two pages carrying the FAQ don't claim the
 * same entity.
 * @param includeFaq false on pages that don't render the FAQ. Emitting
 * FAQPage without the matching visible copy is a structured-data policy
 * violation, so this defaults to off.
 */
export function tistraHealthGraph(pageUrl: string = SITE_URL, includeFaq = false) {
  const graph: Record<string, unknown>[] = [
    ORGANIZATION as unknown as Record<string, unknown>,
    webSite(),
    softwareApplication(),
    service(),
  ];
  if (includeFaq) graph.push(faqPage(pageUrl));

  return { "@context": "https://schema.org", "@graph": graph };
}
