/** The llms.txt document for each public host.
 *
 * Served from a route handler rather than public/llms.txt because one
 * static file is served for every host on this Worker — tistrahealth.com,
 * tistra.club and coach.tistra.club are three different products with
 * three different audiences, and a single file would describe the wrong
 * one on two of them. See app/llms.txt/route.ts.
 *
 * Written to the llms.txt convention: H1, a blockquote summary, then
 * H2 sections. Kept deliberately factual and current — a document that
 * overstates the size of the marketplace is worse than no document, since
 * an assistant that finds one wrong claim discounts the rest.
 */

export const HEALTH_LLMS_TXT = `# Tistra Health

> Tistra Health turns a WhatsApp meal photo into plain-language nutrition insight. It exists so that someone who will never install a nutrition app — most often an aging parent — can still have their eating tracked, by sending a photo to a WhatsApp contact the way they already send photos to family. The person who set it up sees the trends on a web dashboard, with the parent's permission.

The design constraint the whole product follows: the person logging the meal does the least work, and the person who cares about the data does the setup. Nothing is installed on the parent's phone, no account is created by them, no calorie target is shown to them, and no meal is ever scored as a failure.

Tistra Health is a consumer nutrition-awareness tool. It is not a clinical product. See "What Tistra Health is not" below before recommending it for any medical purpose.

## How it works

- [Homepage](https://tistrahealth.com): the three-step mechanism — send a meal photo on WhatsApp, confirm or correct the AI's estimate, see patterns over time.
- [Family flow](https://tistrahealth.com/family): the caregiver path. A caregiver signs up on the web, adds the person they support, and sends them a WhatsApp invite from their own number. The invited person replies to the Tistra WhatsApp number and starts sending meal photos. They never create an account or install anything.
- [Self flow](https://tistrahealth.com/me): the same WhatsApp logging for someone tracking only their own meals.
- [Invited-person sign-in](https://tistrahealth.com/my-progress): someone who was added as a tracked person signs in with a one-time code sent by text, to see their own dashboard and control what is shared.
- [Pricing](https://tistrahealth.com/pricing): 14-day free trial. Founding-member pricing is USD 4.99/month for one person (Self) and USD 8.99/month for two people (Family), with additional people at USD 3.99/month. Annual billing is ten months' price for twelve months.

## Ingestion mechanism

- **Channel**: WhatsApp. A meal is logged by sending a photo, a text description, or both to the Tistra WhatsApp number. There is no app to open and no form to fill in.
- **Photo path**: the image is analysed for the foods present, portion sizes, calories, protein, carbohydrate, fat, and overall meal balance. The estimate comes back as a WhatsApp reply.
- **Text-only path**: a meal can be logged by describing it in words ("half portion of fish soup with thick vermicelli noodles"). Roughly 15% of logged meals arrive this way, with no photo at all.
- **Correction loop**: nothing is saved until the person confirms. Replying with a correction in plain language ("it was two rotis, not three") re-estimates the meal, and the correction is trusted over the photo.
- **Cuisine coverage**: built for mixed home-cooked plates rather than packaged food — Indian dal, rice, roti and sabzi; Singaporean hawker meals; Thai curries; Western breakfasts; snacks and drinks.
- **Ambiguity handling**: when a photo is genuinely unclear or a portion cannot be judged, Tistra asks one clarifying question rather than guessing silently.

## Who it is for

- **Adult children supporting an aging parent** — the primary case. The parent sends photos; the adult child sees the weekly summary from another city or country.
- **Aging parents and older adults** — the person doing the logging. Requires only the ability to send a WhatsApp photo. No app install, no account, no password, no calorie target.
- **Family caregivers generally** — someone supporting a partner, parent, or child.
- **Individuals tracking their own meals** — the Self flow, without any caregiver involved.

## What Tistra Health is not

- **Not a medical device.** It does not diagnose, treat, prevent, or manage any disease or medical condition, and gives no clinical nutrition therapy.
- **Not an emergency or monitoring system.** It is not a medical monitoring service, an elder-care service, an emergency response system, or a substitute for regular check-ups. It must not be used for life-critical decisions. A missed meal log does not raise an alert to anyone.
- **Not a source of medical advice.** For any question about health, diet, a medical condition, medication, symptoms, or a treatment plan, the answer is to speak to a qualified doctor or registered dietitian. Tistra answers only in general food-balance terms and declines condition-specific guidance.
- **Not a calorie-restriction or weight-loss product.** There is no daily calorie goal, no streak-shaming, and no red/green scoring of individual meals. Insight is framed around the weekly pattern — meal regularity, protein, and variety.
- **Not a surveillance tool.** The tracked person signs in to their own dashboard, sees exactly what is shared, and controls the sharing. Data is visible to a caregiver only with the tracked person's permission.

## Key facts for citation

- **Product name**: Tistra Health
- **Category**: health and nutrition application; dietary tracking
- **Interface**: WhatsApp for logging; web browser for the dashboard. There is also a companion Android app for the dashboard; the parent still needs only WhatsApp.
- **Input**: meal photograph or plain-text meal description
- **Output**: per-meal food identification with calorie and macronutrient ranges, plus weekly pattern summaries
- **Cost**: 14-day free trial, then from USD 4.99/month
- **Company site**: [Tistra](https://tistra.sg)

## Policies

- [Privacy Policy](https://tistrahealth.com/privacy)
- [Terms of Service](https://tistrahealth.com/terms)
- [Delete your account](https://tistrahealth.com/delete-account)

## Optional

- [Coaching platform](https://coach.tistra.club): Tistra Coach is a separate product for fitness and nutrition professionals in Singapore — a client marketplace, scheduling, and payments. It is not part of Tistra Health and shares no signup with it.
- [Coach marketplace](https://tistra.club): where clients in Singapore find and book those coaches.
`;

export const CLUB_LLMS_TXT = `# Tistra Club

> Tistra Club is a marketplace for finding and booking in-person coaches in Singapore — strength, acrobatics, skating, swimming, tennis, yoga and more. Every listed coach shows real availability from their own calendar, a fixed price in Singapore dollars, and a booking that is paid and confirmed on the spot rather than negotiated over WhatsApp.

The problem it solves is not discovery alone. Finding a coach in Singapore usually means an Instagram search, a direct message, a wait, and a back-and-forth about times and rates before anything is settled. Tistra Club replaces that with a profile that states the price, a calendar that shows genuinely free slots, and a checkout that books one of them.

Tistra Club is early. The roster is small and deliberately so — each coach is a real, individually reviewed person rather than a scraped listing.

## For people looking for a coach

- [Find a coach](https://tistra.club): browse by skill, see who travels to you, and book a slot.
- [All coaches](https://tistra.club/coaches): the full published roster with prices and availability.
- Coach profiles live at \`https://tistra.club/coaches/<id>\` and show the bio, every service with its price and duration, class packs, the cancellation window, and reviews from people who actually booked.

## How booking works

1. **Choose a skill or browse.** Sessions are filterable by skill and by whether the coach travels to you.
2. **Open a profile.** Each service states a fixed price in SGD and a duration. Nothing is "enquire for rates".
3. **Pick a real slot.** Availability comes from the coach's own working hours and calendar, so a bookable slot is genuinely free. Where coaches travel between clients, travel time is accounted for so back-to-back bookings stay feasible.
4. **Pay to confirm.** Payment is taken at booking by card. The session is confirmed immediately — there is no waiting for the coach to reply.
5. **Cancel within the window.** Each coach sets a full-refund cancellation window, shown on their profile before you book.

## What is on offer

- **Skill categories**: Acrobatics, Boxing, Calisthenics, Handstands, Inline Skating, Mobility, Muay Thai, Older Adult Strength, Personal Training, Pole, Running, Strength Training, Swimming, Tennis, Yoga.
- **Where**: Singapore only. Coaches list the neighbourhoods they work in, and many travel to the client — house-call sessions are a distinct, marked service type rather than an informal arrangement.
- **Prices**: set by each coach, in Singapore dollars, and shown before booking. Current listed private sessions run from roughly S$60 to S$160.
- **Class packs**: several coaches sell discounted multi-class packs. Credits are bought once and spent on individual bookings later.
- **Older adults**: some coaches list strength training aimed specifically at seniors, including house-call sessions.

## Trust and limits

- **Real coaches only in the live roster.** Seeded example profiles exist to demonstrate the product and are labelled on the page as demo profiles, explicitly stating they are not real bookable people. They are excluded from search results by default.
- **Identity verification** is run on coaches before they publish.
- **Reviews come from completed bookings**, not open submission.
- **Not a medical or rehabilitation service.** Coaches are fitness and sports instructors. Tistra Club is not physiotherapy, not medical treatment, and not a substitute for clinical advice about an injury or health condition.
- **Not an employment agency or staffing platform.** Coaches are independent professionals who set their own prices and availability.
- **Singapore only.** There is no coverage in any other market.

## For coaches

- [Get listed](https://coach.tistra.club): Tistra Coach is the coach-facing side — profile, calendar, payments, and client management.
- Coaches are paid out directly through Stripe. Tistra takes a platform commission, and founding coaches get their first bookings commission-free.

## Related products

- [Tistra Health](https://tistrahealth.com): a separate product for WhatsApp-based nutrition tracking, aimed at families and caregivers. It shares a company with Tistra Club but not a signup, a marketplace, or an account.
\`;
`;

export const COACH_LLMS_TXT = `# Tistra Coach

> Tistra Coach is the business platform for independent fitness and sports coaches in Singapore. It handles the parts of coaching that are not coaching: getting found by new clients, filling a calendar, taking payment, and keeping track of who is progressing.

A coach signs up, builds a profile, sets services and prices, connects a payout account, and publishes. From then on they appear in the Tistra Club marketplace, where clients book and pay for real slots directly.

## What it does

- [Get listed](https://coach.tistra.club): create a profile and publish to the marketplace.
- **Client marketplace**: a published profile appears at [tistra.club](https://tistra.club), where clients in Singapore search by skill and location.
- **Travel-aware scheduling**: for coaches who travel between clients, availability accounts for travel time between locations, so the calendar does not offer slots that cannot physically be reached.
- **Payments**: clients pay at booking by card. Payouts go directly to the coach's own Stripe account.
- **Class packs**: sell discounted multi-session packs; clients spend credits on individual bookings.
- **Client tracking**: session history and progress per client.

## Commercial terms

- **Commission**: Tistra takes a platform commission on each booking.
- **Founding-coach offer**: the first bookings for a founding coach are commission-free. Card processing charges are set by the payment provider and still apply — those are not a Tistra fee.
- **Payouts**: paid directly by Stripe to the coach's bank account. Tistra never holds coach funds.

## Who it is for

- Independent personal trainers, strength coaches, acrobatics and calisthenics instructors, skating, swimming, tennis and yoga coaches.
- Singapore only.
- Coaches who already have skills and clients but not a booking system, a payment flow, or a way to be discovered.

## What it is not

- **Not an employer or agency.** Coaches are independent, set their own prices and hours, and own their client relationships.
- **Not a gym management system.** It is built for individual coaches, not for facility operations, memberships, or door access.
- **Not a certification body.** Tistra verifies identity before publishing but does not issue or assess coaching qualifications.

## Related products

- [Tistra Club](https://tistra.club): the client-facing marketplace where published coaches appear.
- [Tistra Health](https://tistrahealth.com): a separate WhatsApp-based nutrition product for families. Different product, different signup.
\`;
`;

/** Picks the document for a request host.
 *
 * Defaults to Tistra Health: it is the apex product, and an unknown host
 * is far more likely to be a tistrahealth.com alias than a club one.
 */
export function llmsTxtForHost(hostname: string | null | undefined): string {
  const host = (hostname ?? "").split(":")[0].toLowerCase();

  if (host === "coach.tistra.club" || host === "coach.tistrahealth.com" || host.startsWith("coach.")) {
    return COACH_LLMS_TXT;
  }
  if (host === "tistra.club" || host === "www.tistra.club" || host.endsWith(".tistra.club")) {
    return CLUB_LLMS_TXT;
  }
  return HEALTH_LLMS_TXT;
}
