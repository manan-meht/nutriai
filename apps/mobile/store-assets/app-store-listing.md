# App Store Connect listing — Tistra Health

## `eas.json` submit config (add once enrolled)

EAS rejects blank strings in `submit.production.ios`, so this block isn't
checked in yet — add it to `eas.json`'s `"submit"."production"` once
these three values exist:

```json
"ios": {
  "appleId": "<the Apple ID email used to sign in to App Store Connect>",
  "ascAppId": "<numeric App Store Connect app ID, generated when the app record is first created there>",
  "appleTeamId": "<from developer.apple.com/account, Membership tab>"
}
```

Once added, `npx eas-cli@latest submit --platform ios --profile production`
uploads the latest iOS build straight to TestFlight/App Store Connect.

Everything here is ready to paste in once Apple Developer Program
enrollment clears and the app record is created. Nothing in this file
requires live Apple credentials to prepare.

## App record basics

- **App name**: Tistra Health
- **Bundle ID**: `com.tistrahealth.app` (already set in `app.json`, matches
  the Android package name — same identifier convention across platforms)
- **Primary language**: English (U.S.)
- **SKU**: `tistra-health-ios` (any unique internal string; not shown to users)
- **Primary category**: Health & Fitness
- **Secondary category**: Food & Drink

## Subtitle (30 characters max)

> WhatsApp meal tracking

## Promotional text (170 characters max, editable anytime without review)

> Turn a WhatsApp meal photo into simple nutrition insights — for yourself, your family, or the clients you coach.

## Description (4000 characters max)

> Tistra Health turns meal photos into simple nutrition insights for
> families, coaches, and individuals — no manual food diary, no
> calorie-counting spreadsheets.
>
> Just send a photo of what you're eating to Tistra on WhatsApp. Tistra
> reads the photo, estimates protein, carbs, fat, calories, and fiber, and
> logs it automatically. Built for real home-cooked meals, mixed plates,
> snacks, drinks, and everyday portions — not just packaged food with a
> barcode.
>
> WHO IT'S FOR
> • Individuals who want a simple way to understand their own eating
>   patterns, without obsessive tracking
> • Families supporting a parent, partner, or loved one's nutrition —
>   without needing to be in the same house
> • Coaches and trainers who want visibility into clients' real eating
>   habits between sessions
>
> HOW IT WORKS
> 1. Send a photo of your meal to Tistra on WhatsApp
> 2. Tistra estimates the nutrition breakdown and logs it
> 3. Open the app to see your Food Balance Score, macro trends, and
>    personalized, food-specific suggestions
>
> WHAT YOU GET IN THE APP
> • A Food Balance Score that reflects protein adequacy, fiber, food
>   diversity, and how minimally processed your meals are — not just
>   calories
> • Full macro targets (calories, protein, carbs, fat, fiber) personalized
>   to your goals, editable anytime
> • Weekly trends and a meal history you can browse and correct
> • Shareable "wins" — playful, non-clinical achievement cards for
>   consistency and balance, not weight loss milestones
> • Family and coach dashboards to support someone else's nutrition
>   without living in their kitchen
>
> Tistra is built around one idea: nutrition tracking should be as easy as
> sending a photo to a friend. No manual logging, no food databases to
> search, no barcode scanning.
>
> This app provides general wellness information and is not a substitute
> for professional medical or dietary advice. If you have a medical
> condition or a prescribed diet, please follow your clinician's guidance.

## Keywords (100 characters max, comma-separated, no spaces needed)

> nutrition,meal tracker,whatsapp,food diary,macro tracker,calorie,protein,family health,coach,diet

## Support URL

> https://tistrahealth.com (add a `/support` page there, or use a
> mailto: / contact form link if a dedicated page doesn't exist yet)

## Marketing URL (optional)

> https://tistrahealth.com

## Privacy Policy URL (required)

> https://tistrahealth.com/privacy — confirmed live (200 response). Worth
> a final read-through before submitting to make sure it still reflects
> what the app actually collects (App Review does check this).

## Age rating questionnaire — expected answers

Nothing in this app should trigger a rating above **4+**: no user-generated
content shown to other users publicly, no unrestricted web access, no
gambling, no mature themes. Answer "None" to every content-descriptor
question unless something in the app changed since this was written.

## App Privacy ("Nutrition Label") — data types to declare

Based on what this codebase actually collects (see `apps/mobile-api` and
the WhatsApp bot pipeline) — go through Apple's own questionnaire, but
this is the expected shape:

| Data type | Collected? | Linked to user? | Used for |
|---|---|---|---|
| Health & Fitness (nutrition/meal data) | Yes | Yes | App functionality |
| Contact Info (name, phone number) | Yes | Yes | App functionality, account |
| User Content (photos — sent via WhatsApp, not this app directly) | Indirectly, via WhatsApp integration | Yes | App functionality |
| Identifiers (user ID) | Yes | Yes | App functionality |
| Usage Data | **No** — analytics calls are `console.debug` stubs only (see `src/lib/*/analytics.ts`, `apps/mobile/src/lib/*/analytics.ts`), nothing is actually sent anywhere | — | — |
| Diagnostics (crash data) | **No** — no Sentry/Crashlytics or any crash-reporting SDK in `package.json`/`app.json` as of this writing; re-check this answer if one gets added later | — | — |

**Important**: meal *photos* themselves are sent to WhatsApp, not captured
by this app directly (no camera/photo-library permission exists in
`app.json` — confirmed no `expo-image-picker`/`expo-camera` dependency).
Frame the "Photos" data-type answer around what the *backend* stores
(image URLs in Supabase Storage), not what the iOS app itself accesses
on-device, since Apple's questionnaire is about the whole service, not
just on-device APIs.

## Review notes (for the App Review team)

This app's core interaction happens over WhatsApp, not inside the app
itself — the app is a companion dashboard. Reviewers unfamiliar with that
flow sometimes get stuck, so spell it out explicitly:

> Tistra Health's primary meal-logging flow happens via WhatsApp, not
> inside this app. To fully test the app:
> 1. Sign in with the demo account below.
> 2. The demo account already has meal history logged, so the dashboard,
>    Food Balance Score, and macro targets are populated — no need to
>    send WhatsApp messages to see the core experience.
> 3. If you'd like to test the WhatsApp logging flow itself, message
>    +[TISTRA WHATSAPP NUMBER] with a photo of any meal — a reply with an
>    estimated nutrition breakdown should arrive within ~10-20 seconds.
>
> Demo account:
> Phone / login: [TODO — create a stable demo/reviewer account with
> pre-seeded meal history before submitting]
> Access code: [TODO]

**TODO before submitting**: create a real demo account with several
weeks of realistic meal history seeded (protein/fiber variety, a couple
of corrections, at least one earned share-card) so App Review sees a
populated app, not an empty state.

## Screenshots — sizes needed

Apple requires screenshots for at least these display sizes (others get
auto-scaled from the largest you provide, so 6.9" is the priority):

| Device | Resolution (portrait) |
|---|---|
| 6.9" (iPhone 16 Pro Max / 15 Pro Max) | 1320 × 2868 |
| 6.5" (iPhone 14 Plus / 11 Pro Max) | 1284 × 2778 or 1242 × 2688 |
| 5.5" (iPhone 8 Plus) — only if supporting older devices | 1242 × 2208 |
| 12.9" iPad Pro — only if `supportsTablet` | 2048 × 2732 |

Not yet generated — needs either a physical device, or Xcode + iOS
Simulator locally (Xcode isn't installed on this machine yet, only
Command Line Tools) to capture real screens once a build exists.

## App icon

`assets/images/icon.png` is already 1024×1024, RGB (no alpha channel) —
meets Apple's App Store icon requirement as-is. Apple applies its own
corner-rounding mask automatically; do not pre-round the corners.
