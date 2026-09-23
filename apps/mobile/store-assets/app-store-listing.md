# App Store Connect listing — Tistra Health

What was submitted for iOS 1.0.0 (build 5, commit 01ba0cd) on 2026-09-16,
kept here so the next version starts from the live listing rather than a
guess. Update this file when the listing changes in App Store Connect.

## App record

- **App name**: `Tistra Health: Family Meals` (30 max; "Tistra Health" alone
  wastes the 13 free indexed characters after it)
- **Bundle ID**: `com.tistrahealth.app` (same as the Android package)
- **Primary language**: English (U.S.)
- **Primary category**: Health & Fitness · **Secondary**: Food & Drink
- **Price**: Free (the app itself; plans are auto-renewable subscriptions)
- **Age rating**: 4+ — "Health or Wellness Topics" answered Yes, everything
  else No
- **Version release**: manual — approval does not publish; someone presses
  Release
- **Subtitle** (30 max): `Photo meal log for your family`
- **Support URL / Marketing URL**: https://tistrahealth.com (the home page
  carries the support mailto link)
- **Privacy Policy URL**: https://tistrahealth.com/privacy

## Promotional text (170 max)

> Turn a WhatsApp meal photo into simple nutrition insights — for yourself, or for a parent, partner or child you look after.

## Description

> Tistra Health turns meal photos into simple nutrition insights for families and individuals — no manual food diary, no calorie-counting spreadsheets.
>
> Just send a photo of what you're eating to Tistra on WhatsApp. Tistra reads the photo, estimates protein, carbs, fat, calories and fiber, and logs it automatically. Built for real home-cooked meals, mixed plates, snacks, drinks and everyday portions — not just packaged food with a barcode.
>
> WHO IT'S FOR
> • Individuals who want a simple way to understand their own eating patterns, without obsessive tracking
> • Families supporting a parent, partner or loved one's nutrition — without needing to be in the same house. The person you care for only needs WhatsApp; the app is for you.
>
> HOW IT WORKS
> 1. Send a photo of your meal to Tistra on WhatsApp
> 2. Tistra estimates the nutrition breakdown and logs it
> 3. Open the app to see the Food Balance Score, macro trends and personalised, food-specific suggestions
>
> WHAT YOU GET IN THE APP
> • A Food Balance Score that reflects protein adequacy, fiber, food diversity and how minimally processed meals are — not just calories
> • Full macro targets (calories, protein, carbs, fat, fiber) personalised to each person's goal, age and activity, editable anytime
> • A family dashboard with every person's score, 7-day trend and last meal at a glance
> • Today's Focus: one practical suggestion for the next meal
> • Meal history you can browse, react to and share
> • Notifications when a family member logs a meal
> • Gentle WhatsApp reminders for the people you support
>
> Tistra is built around one idea: nutrition tracking should be as easy as sending a photo to a friend. No manual logging, no food databases to search, no barcode scanning.
>
> This app provides general wellness information and is not a substitute for professional medical or dietary advice. If you have a medical condition or a prescribed diet, please follow your clinician's guidance.

## Keywords (100 max)

> caregiver,elderly,senior,parent,aging,whatsapp,nutrition,diet,protein,calorie,tracker,log

Comma-separated with NO spaces — a space costs one of the 100 and buys
nothing. Never repeat a word already in the app name or subtitle: Apple
indexes those too, so "family", "meals", "photo" and "health" are covered
already and repeating them is wasted budget.

The field was previously spent on `meal tracker`, `food diary`,
`macro tracker`, `calories` and `diet` — head terms owned by apps with
hundreds of thousands of ratings (MyFitnessPal 2.3M, Lose It! 778k, Cal AI
366k). Checked on 2026-09-23, two days after launch: the app ranked #1 for
"tistra" and "tistra health", #95 for "whatsapp meal", and nowhere in the
top 200 for any of those head terms. Being eligible for a query and
placing in it are different things, and placement is mostly ratings and
download velocity — which is why `caregiver`, `elderly`, `senior`,
`parent` and `aging` replaced them. Those match what the product is
actually for, and nothing else in the store is fighting hard for them.

## Screenshots

`app-store-screenshots-6.5/` (1284×2778) is what the listing uses — this
app record only offers the iPhone 6.5" slot. `app-store-screenshots-6.9/`
(1320×2868) is the same set for the 6.9" slot should Apple add it. Both are
real captures from a simulator running the submitted code, framed by
`compose.py` from the session that produced them (captions: family
dashboard, per-person Food Balance Score, meals from a WhatsApp photo,
"for yourself or your family").

The family shown is the App Review demo workspace with a second member
added temporarily for the shot; that member was removed again afterwards
so the reviewer path (one person, "+" opens the paywall) still holds.

## App Privacy (data collection)

Declared as collected, all linked to the user, all for App Functionality,
none used for tracking:

| Data type | Source |
|---|---|
| Contact Info — name, email, phone number | account; family members' WhatsApp numbers |
| Health & Fitness — health, fitness | meals and nutrition, weight/height/goals; activity answers |
| User Content — photos, other | meal and contact photos on the backend; reactions, feedback |
| Identifiers — user ID, device ID | account id; push token |
| Purchases — purchase history | RevenueCat |

Not collected: location, financial info, address book, browsing/search,
usage data, diagnostics. There is no analytics, crash-reporting or ad SDK
in the build — re-check this table if one is ever added.

## Subscriptions submitted with 1.0.0

Group **Tistra Health Plans**: `self_premium_monthly`, `self_premium_annual`,
`family_premium_monthly`, `family_premium_annual`.
Group **Tistra Health Add-Ons**: `adults_extra_person_monthly`,
`adults_extra_person_annual` (display name "Extra Family Member (Monthly/
Annual)", description "One more person on your Family plan").

`adults_additional_person_monthly` also exists in the main group: created
before the add-on got its own group, never submitted, and App Store
Connect won't delete it. It is inert; do not add metadata to it.

Product ids are permanent, and the App Store spells durations as suffixes
where Play uses base plans — `src/lib/billing/revenuecat.ts` reduces both
forms before matching.

## App Review information

Sign-in required, with the demo account (email in the review notes; the
password is stored only in App Store Connect). The notes tell the reviewer
to choose "For my family", sign in with email/password rather than Google
or Apple, that the account is pre-populated so no WhatsApp step is needed,
and that the "+" on the Family screen opens the subscription paywall.

The demo workspace must stay in that state: one contact (the account's own
"Rohan Rao" profile), no entitlement row (so `requiresCardBeforeTrial` is
true), and the account NOT in the mobile API's billing whitelist.

## Signing and submission

Credentials (distribution certificate, provisioning profile, APNs key) are
managed by EAS; `eas build --platform ios --profile production` then
`eas submit --platform ios --latest` from `apps/mobile`. Build from
`~/projects/nutriai-fresh` — an abandoned clone under `~/Documents` produced
one stale build during the launch.
