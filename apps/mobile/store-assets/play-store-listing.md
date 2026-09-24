# Google Play listing — Tistra Health

The Play copy was not tracked anywhere until 2026-09-24, which is how it
drifted from the App Store listing without anyone noticing — it still sold
the app to coaches, who left the mobile app in August. Update this file
when the listing changes in Play Console.

## Why this is not a copy of app-store-listing.md

The two stores index completely differently, so the same keywords cannot be
pasted between them.

| | App Store | Google Play |
|---|---|---|
| Hidden keyword field | 100 characters | **does not exist** |
| Indexed | name, subtitle, keyword field | title, short description, **long description** |
| Repetition | ignored | **counted** — term frequency affects ranking |

On Apple a keyword is listed once in a field nobody sees. On Play it has to
appear in the visible prose, more than once, and read naturally. Closer to
SEO than to Apple's ASO.

Spelling matters here in a way it does not on Apple: Google indexes
`fiber` and `fibre` as different words. The default listing language is
English (United States), so this copy is consistently American — a US
listing written in British English is invisible to the searches it is meant
to catch.

## Title (30 max)

> Tistra Health: Family Meals

27/30. The title is the heaviest-weighted field on Play. `Tistra Health`
alone was 13 characters and left 17 of the most valuable ones unused.

## Short description (80 max)

> Photo meal tracking on WhatsApp — for you, your parents and elderly family

74/80, and second only to the title in weight. The previous version
("Log meals on WhatsApp. Get your Food Balance Score & family nutrition
insights") used its 78 characters well but carried no caregiver-intent
word at all.

## Long description (4000 max)

```
Tistra Health turns a WhatsApp photo of your meal into real nutrition insight — no manual logging, no calorie-counting spreadsheets.

HOW IT WORKS
Send a photo of your meal to Tistra on WhatsApp. Our AI identifies the food, estimates its nutritional content, and logs it automatically — for yourself, or for a family member you're caring for. There is nothing to type and no food database to search.

CARING FOR AN AGING PARENT
If you are the carer for an elderly parent or grandparent, this is what Tistra was built for. Add them to your family workspace and you can see how they are eating, even from another city or country. They never have to learn a new app or remember a password. They send a photo to WhatsApp, the way they already message you, and that is the whole of it.

For an older adult, the nutrition that matters is rarely calories — it is whether they are getting enough protein, enough fiber, and enough variety to stay strong. Tistra watches those, and tells you when something has slipped.

YOUR FOOD BALANCE SCORE
Instead of obsessing over calories, Tistra looks at the bigger picture — protein, fiber, food variety, and how balanced your meals are — and turns it into a single, easy-to-understand score with personalized recommendations to help you improve it.

The score is tuned to the person: their age, their weight, how active they are, and what they are trying to achieve. A senior eating for healthy aging and a younger adult building muscle get different targets and different advice.

TRACKING YOUR OWN MEALS
Tistra works just as well if the person you are looking after is you. Send your own meals to the same WhatsApp number, see your own score and trends, and get a practical suggestion for your next meal rather than a lecture about your last one.

BUILT AROUND REAL LIFE
- Log meals in seconds by sending a photo — no data entry
- Built for real home-cooked food, mixed plates and everyday portions, not just packaged items with a barcode
- Recognizes Indian, Singaporean, Southeast Asian, Chinese, Japanese and Western meals
- Personalized recommendations based on actual eating patterns and preferences (vegetarian, allergies, dietary restrictions — all respected)
- Weekly progress tracking and shareable "wins" to celebrate consistency
- A family dashboard showing every person's score, recent trend and last meal at a glance
- Notifications when someone you care for logs a meal
- Gentle WhatsApp reminders for the people you support

WHO USES TISTRA
- Adult children keeping an eye on a parent's or grandparent's nutrition from a distance
- Carers and family caregivers supporting an elderly relative at home
- Couples and families who want to eat better together
- Anyone who wants to understand their own eating without obsessive tracking

PRIVACY-RESPECTING BY DESIGN
Family members control what they share — caregivers only ever see what the tracked person has consented to share. Tistra never sells your data or uses it for advertising.

Tistra Health is designed for everyday nutrition awareness and family wellbeing. It provides general wellness information and is not a substitute for professional medical or dietary advice. If you have a medical condition or a prescribed diet, please follow your clinician's guidance.
```

3269/4000, up from 1807. Unlike Apple — where a longer description buys no
ranking — every relevant sentence here is indexed, so stopping at 45% of
the field was leaving ranking surface unused.

### Term coverage, before and after

| Term | Was | Now |
|---|---|---|
| caregiver | 2 | 2 |
| carer | 0 | 2 |
| parent | 1 | 4 |
| grandparent | 1 | 2 |
| elderly | 0 | 3 |
| senior | 0 | 1 |
| aging | 0 | 2 |
| whatsapp | 5 | 6 |
| photo | 3 | 5 |
| meal | 7 | 12 |

The old copy described the caregiver use case in meaning but barely named
it: `elderly`, `senior`, `aging` and `carer` appeared zero times between
them. Google cannot index a concept that is never named.

Density was checked for stuffing, which Play does penalize: across 552
words the most frequent are ordinary function words ("and", "a", "for"),
and no content term exceeds ~4%.

### Removed deliberately

The previous description said the app was "Built for coaches and trainers
managing multiple clients' nutrition alongside training". Coaching left the
mobile app in August 2026 (commit 4dd80aa) and is its own product on its
own domain, so that line described something the app no longer does.

## What does NOT fix ranking

Checked 2026-09-23, two days after the iOS launch, with zero ratings on
both stores. On the App Store the app ranked #1 for "tistra" and
"tistra health" and #95 for "whatsapp meal" — so indexing and the keyword
field were working — and nowhere in the top 200 for "health".

Placement among eligible apps is mostly download velocity and ratings
volume, not metadata. The apps holding the head terms have 100k-2.3M
ratings (MyFitnessPal 2.3M, Lose It! 778k, Cal AI 366k). No wording change
competes with that, which is why the in-app rating prompt
(`apps/mobile/src/lib/review-prompt.ts`) matters more than any of the copy
above. It covers both stores: expo-store-review maps to Google's In-App
Review API on Android.

## Assets

`play-store-icon-512.png` and `play-store-feature-graphic-1024x500.png`
live alongside this file. Screenshots are whatever is currently uploaded in
Play Console; the App Store set in `app-store-screenshots-6.5/` is framed
for Apple's aspect ratios and is not interchangeable.
