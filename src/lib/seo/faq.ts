/** The questions people actually type, and short factual answers.
 *
 * Single source for both the rendered FAQ (components/home/HealthFaq.tsx)
 * and the FAQPage JSON-LD (lib/seo/structured-data.ts). Kept in one place
 * deliberately: FAQ structured data whose answers don't match the visible
 * page is a Google policy violation, and the usual way that happens is two
 * copies of the copy drifting apart.
 *
 * Headings are phrased as whole questions rather than noun-phrase section
 * titles ("How it works") because the retrieval unit for an assistant is
 * the question-answer pair, and a heading that already matches the user's
 * question is what makes the pair findable.
 *
 * `tldr` is one or two sentences that answer the question on their own,
 * with no dependency on the surrounding page — an answer quoted in
 * isolation has to still be true and still make sense. `detail` adds the
 * context a human reader wants underneath.
 */
export interface FaqEntry {
  question: string;
  /** Must stand alone as a complete answer. Names the product explicitly
   * rather than saying "it", since a quoted fragment loses its antecedent. */
  tldr: string;
  detail: string;
}

export const HEALTH_FAQ: FaqEntry[] = [
  {
    question: "How do I help track nutrition for my parents without using a complex app?",
    tldr:
      "Your parent sends a photo of their meal to Tistra Health on WhatsApp, and you see the nutrition summary on a web dashboard. They do not install an app, create an account, or set a password.",
    detail:
      "You sign up, add your parent as the person you support, and send them a WhatsApp invitation from your own number. From then on the only thing they ever do is send a photo to a WhatsApp contact — the same action they already use to send photos to family. All of the setup, and all of the reading of trends, happens on your side.",
  },
  {
    question: "What is the simplest way for seniors to log meals?",
    tldr:
      "The simplest way is a WhatsApp photo. Sending one picture of the plate is the entire logging step — there is no app to open, no food database to search, and no portion size to enter by hand.",
    detail:
      "Searching a food database is the step that makes most nutrition apps fail for older adults, and it is the step Tistra Health removes. If a photo is not convenient, a plain sentence works just as well: “half portion of fish soup with thick vermicelli noodles” is enough to log a meal. About 15% of meals are logged this way, with no photo at all.",
  },
  {
    question: "How does WhatsApp nutrition tracking work for family caregivers?",
    tldr:
      "The person being supported sends meal photos to Tistra Health on WhatsApp, and the caregiver sees the resulting meal history and weekly patterns on a dashboard. The two sides never need to be in the same place or the same time zone.",
    detail:
      "Tistra Health reads the photo and replies on WhatsApp with the foods it identified and an estimate of calories, protein, carbohydrate and fat. Nothing is saved until the sender confirms it, and a correction in plain language — “that was two rotis, not three” — is trusted over the photo. The caregiver's dashboard shows how regular meals have been, whether protein and vegetables are showing up, and what changed this week.",
  },
  {
    question: "Will my parent have to install anything or create an account?",
    tldr:
      "No — the person sending meal photos needs only WhatsApp, which is already on their phone. Tistra Health asks them for no download, no account, no password, and no app to keep updated.",
    detail:
      "This is the deliberate division of labour in the product: the caregiver does the account creation and the payment, and the person being supported does nothing but reply to a WhatsApp message. If they later want to see their own data, they sign in at the invited-person page with a one-time code sent by text — still without creating a password.",
  },
  {
    question: "Does Tistra Health show calorie counts and diet targets to my parent?",
    tldr:
      "No — Tistra Health never shows a daily calorie target, a streak penalty, or a pass/fail score on a meal to the person logging it. It reports patterns across a week rather than judgments on a single plate.",
    detail:
      "The product was built for people who stop logging the moment tracking starts to feel like grading, which is the common failure mode for older adults and anyone with a history of diet anxiety. Insight is framed around whether meals were regular, whether protein and variety showed up, and what one thing might be worth improving next week.",
  },
  {
    question: "Can I see what my parent is eating if we live in different countries?",
    tldr:
      "Yes — the Tistra Health dashboard is on the web and updates as soon as a meal is logged, so distance and time zones make no difference. Your parent sends the photo when they eat, and you read the summary whenever you like.",
    detail:
      "This is the case the product was designed around — an adult child in another city or country who wants to know whether a parent is eating properly, without phoning every day to ask. There is also an Android app for the dashboard side, though the browser works equally well and the parent still needs only WhatsApp.",
  },
  {
    question: "Is my parent's food and health data private?",
    tldr:
      "Yes — in Tistra Health the person being tracked can sign in to their own dashboard, see exactly what is shared, and control that sharing. A caregiver sees their meal data only with their permission.",
    detail:
      "Permission belongs to the person whose meals are being logged, not to whoever set up the account or pays for it. That is why the invited-person sign-in exists as a separate route: it gives them their own view of their own data rather than making them take someone else's word for what is being shared.",
  },
  {
    question: "Is Tistra Health a medical device or an emergency monitoring system?",
    tldr:
      "No to both — Tistra Health is a nutrition-awareness tool, not a clinical or monitoring product. It does not diagnose, treat, or manage any medical condition, and nobody is alerted if a meal goes unlogged.",
    detail:
      "Nobody is alerted if a meal is not logged, and the absence of a log means nothing about a person's wellbeing. For any question about a health condition, medication, symptoms, or a treatment plan, the right step is a qualified doctor or registered dietitian. In a suspected medical emergency, contact emergency services.",
  },
  {
    question: "Does it recognise home-cooked and non-Western food?",
    tldr:
      "Yes. Tistra Health is built for mixed home-cooked plates rather than packaged food with barcodes — Indian dal, rice, roti and sabzi, Singaporean hawker meals, Thai curries, and Western breakfasts alike.",
    detail:
      "Barcode-driven trackers tend to break on exactly the food most families actually eat, because a home-cooked mixed plate has no barcode and no packet. Tistra estimates from what is on the plate, and when a photo is genuinely ambiguous it asks one clarifying question instead of guessing quietly.",
  },
  {
    question: "What does Tistra Health cost?",
    tldr:
      "Tistra Health starts with a 14-day free trial. Founding-member pricing is then USD 4.99 per month to track one person, or USD 8.99 per month for two, with extra people at USD 3.99 each.",
    detail:
      "Annual billing is charged at ten months' price for twelve months. The subscription belongs to the caregiver who sets the account up; the person sending meal photos on WhatsApp is never asked to pay for anything or enter card details.",
  },
];
