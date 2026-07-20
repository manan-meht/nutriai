// Mirrors the main web app's src/lib/share-cards/concepts.ts — duplicated here rather
// than shared, matching this app's existing pattern (see e.g. lib/purchases.ts,
// or mobile-api's lib/food-balance.ts for the same convention on that side).
// Keep in sync manually if the web app's share-cards logic changes.

import type { ShareCardConcept } from "./types";

// The 30 initial share-card concepts. Tone: playful, funny, lightly
// self-aware, encouraging — never clinical, preachy, weight-loss-obsessed,
// or judgmental. Celebrate "I showed up" / "I was consistent" / "balance
// improved", never "I complied with my diet" or a body-outcome claim.
//
// Banned framings (do not add a concept using these): "you avoided bad
// foods", "you stayed under calories", "you lost weight", "you burned
// fat", "you were good today", "you failed less this week", "you ate
// clean", "you cheated less", "you fixed your diet". Use instead: "you
// showed up", "you added balance", "you kept protein in the picture",
// "you made meals more complete", "you logged consistently", "you built
// momentum", "you're back in rhythm".
//
// Every concept's nanoBananaPrompt is intentionally generic (no user data)
// per this feature's design: the card's own headline/supporting text is
// always rendered by the app (see ShareCardPreview.tsx), never baked into
// a generated background image, so copy can be A/B tested, personalized,
// and localized later without regenerating any image. Every prompt ends
// with "No readable text in the image." for the same reason, and avoids
// bodies, scales, measuring tapes, medical symbols, disease imagery, or
// real people.

const BRAND_VISUAL_BASE =
  "Tistra Health's warm purple and lavender palette, soft gradient background, rounded abstract food shapes, subtle star/sparkle motifs, modern premium wellness style (not medical, not gym-bro, not childish)";

function nanoBananaPrompt(theme: string, icons: string): string {
  return (
    `Create a vertical 9:16 Instagram Story background for a playful nutrition achievement card. ` +
    `Use ${BRAND_VISUAL_BASE}. Leave clear empty space in the center for headline text. ` +
    `Theme: ${theme}, with fun icons of ${icons} arranged subtly around the border. No readable text in the image.`
  );
}

export const SHARE_CARD_CONCEPTS: ShareCardConcept[] = [
  // ---- Daily wins ----
  {
    id: "protein-goal-hit-today",
    category: "daily_win",
    title: "Protein Goal Hit Today",
    headlineOptions: ["Protein? Handled.", "You understood the assignment: protein.", "Today's meals said: we lift."],
    supportingTextOptions: [
      "Protein goal hit today.",
      "Protein showed up in a big way today.",
      "Today's meals kept protein in the picture.",
    ],
    triggerDescription: "User's estimated protein intake for today meets or exceeds their daily protein target.",
    triggerKey: "protein_goal_hit_today",
    achievementCriteria: { metric: "proteinG", comparison: "daily", minMealsRequired: 1 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Single hero food icon cluster (egg, yogurt, dal, tofu, paneer) with a soft glow, centered space for headline above a small 'Protein win' label.",
    nanoBananaPrompt: nanoBananaPrompt("protein goal completed", "Greek yogurt, eggs, dal, tofu, chicken, and paneer"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Protein made a solid appearance in today's meals.",
  },
  {
    id: "balanced-day",
    category: "daily_win",
    title: "Balanced Day",
    headlineOptions: [
      "Balanced all day. Main character behavior.",
      "Protein, carbs, fats, fiber. The whole squad showed up.",
      "Today's meals were suspiciously responsible.",
    ],
    supportingTextOptions: [
      "Today's meals had real balance.",
      "Today's plate covered all the bases.",
      "A well-rounded day of eating, logged and all.",
    ],
    triggerDescription: "User logs enough meals today and most are balanced across macros/fiber (Food Foundation balance component is strong for the period).",
    triggerKey: "balanced_day",
    achievementCriteria: { metric: "macroAndFibreBalance", comparison: "daily", minMealsRequired: 2 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Four small balanced icon groups (grain, protein, veg, fat) arranged like a friendly team, sparkles above.",
    nanoBananaPrompt: nanoBananaPrompt("a fully balanced day of eating", "rice, lentils, vegetables, nuts, and a small oil drop"),
    shareCta: "Share this win",
    lowConfidenceFallback: "A nicely varied day of eating, logged and all.",
  },
  {
    id: "logged-all-meals-today",
    category: "daily_win",
    title: "Logged All Meals Today",
    headlineOptions: [
      "You fed yourself and kept the receipts.",
      "Documentary evidence: meals happened.",
      "Logged all meals today. Very organized of you.",
    ],
    supportingTextOptions: [
      "Every meal today, logged.",
      "Kept track of the whole day.",
      "Full daily log, no meals skipped.",
    ],
    triggerDescription: "User logs their target number of meals for the day.",
    triggerKey: "logged_all_meals_today",
    achievementCriteria: { metric: "mealCount", comparison: "daily", minMealsRequired: 3 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Small stack of receipt-like cards/tickets with a checkmark, playful clipboard motif.",
    nanoBananaPrompt: nanoBananaPrompt("a fully logged day of meals", "a notepad, checkmarks, breakfast, lunch and dinner plates"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Logged meals consistently today.",
  },
  {
    id: "fiber-win-today",
    category: "daily_win",
    title: "Fiber Win Today",
    headlineOptions: ["Fiber entered the chat.", "Your gut would probably send a thank-you note.", "A fiber moment. We love to see it."],
    supportingTextOptions: [
      "Today's meals brought the fiber.",
      "Added real fiber today.",
      "Fiber had a good day today.",
    ],
    triggerDescription: "User reaches their fiber target for today or logs enough fiber-rich foods.",
    triggerKey: "fiber_win_today",
    achievementCriteria: { metric: "fiberG", comparison: "daily", minMealsRequired: 1 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Whole grains, beans, and leafy greens as small friendly icons around a centered glow.",
    nanoBananaPrompt: nanoBananaPrompt("a fiber-rich win", "oats, beans, leafy greens, and whole wheat roti"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Fiber made a nice showing in today's meals.",
  },
  {
    id: "fruit-veg-win-today",
    category: "daily_win",
    title: "Fruit / Veg Win Today",
    headlineOptions: ["Color showed up today.", "Vegetables made an appearance. Character development.", "Today's plate had range."],
    supportingTextOptions: [
      "Fruits and vegetables showed up today.",
      "Today's meals had real color.",
      "Brought the produce today.",
    ],
    // TODO: precise per-meal fruit/vegetable detection needs food-group
    // tagging on each logged meal (see FoodBalanceMealInput.foodGroups in
    // @nutriai/health-scoring), which this library's minimal meal shape
    // doesn't carry today. Until then this trigger falls back to the
    // Food Balance Score's weekly fruitAndVegetableIntake component as a
    // coarser, lower-confidence proxy (flagged isLowConfidence).
    triggerDescription: "User logs fruit/vegetables in their target number of meals today. TODO: needs per-meal food-group tagging; currently proxied from the weekly fruit/veg component score.",
    triggerKey: "fruit_veg_win_today",
    achievementCriteria: { metric: "fruitAndVegetableIntake", comparison: "daily", minMealsRequired: 1 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Bright fruit and vegetable icons (tomato, spinach, orange, carrot) in a playful cluster.",
    nanoBananaPrompt: nanoBananaPrompt("colorful fruits and vegetables win", "tomato, spinach, orange, carrot, and cucumber"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Some good color showed up on the plate this week.",
  },
  {
    id: "home-cooked-win",
    category: "daily_win",
    title: "Home-Cooked Win",
    headlineOptions: ["Chef energy: activated.", "Home-cooked and quietly powerful.", "Kitchen: used. Balance: improved."],
    supportingTextOptions: [
      "Cooked at home today.",
      "Today's meals came from your own kitchen.",
      "Home-cooked meals showed up today.",
    ],
    // TODO: per-meal preparation-source classification (home_prepared vs
    // restaurant/packaged) exists in the scoring pipeline
    // (FoodBalanceMealInput.preparationSource) but isn't part of this
    // library's minimal meal input; proxied from the weekly
    // homePreparedMealShare component until a per-day source is threaded
    // through.
    triggerDescription: "User logs a home-cooked meal, or most of today's meals are home-cooked. TODO: needs per-meal preparation-source data; currently proxied from the weekly home-prepared-share component.",
    triggerKey: "home_cooked_win",
    achievementCriteria: { metric: "homePreparedMealShare", comparison: "daily", minMealsRequired: 1 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A simple stovetop/pan icon with steam curls, warm and cozy, no realistic kitchen photo.",
    nanoBananaPrompt: nanoBananaPrompt("a home-cooked meal win", "a cooking pot, steam, a wooden spoon, and simple vegetables"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Home cooking made an appearance recently.",
  },
  {
    id: "better-snack-choice",
    category: "daily_win",
    title: "Better Snack Choice",
    headlineOptions: ["Snack arc: upgraded.", "A snack with a plot twist.", "Less chaos, more actual food."],
    supportingTextOptions: [
      "Today's snack had more to offer.",
      "A more balanced snack choice today.",
      "Snack time got an upgrade.",
    ],
    // TODO: needs a per-user historical snack-quality baseline (frequency
    // of ultra-processed snacks vs whole-food snacks over time) to detect
    // "replaced a frequent pattern" — no snack-specific classification or
    // historical baseline exists yet. Not evaluated until that data
    // exists; always returns not-earned with a TODO marker.
    triggerDescription: "User replaces or logs a more balanced snack compared to a frequent ultra-processed pattern. TODO: needs a historical per-user snack-quality baseline that does not exist yet.",
    triggerKey: "better_snack_choice",
    achievementCriteria: { metric: "snackQuality", comparison: "daily" },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A snack (fruit, nuts, roasted chana) with a small upward arrow motif, playful not preachy.",
    nanoBananaPrompt: nanoBananaPrompt("an upgraded snack choice", "roasted chana, almonds, fruit, and a small upward arrow"),
    shareCta: "Share this win",
  },
  {
    id: "meal-correction-hero",
    category: "daily_win",
    title: "Meal Correction Hero",
    headlineOptions: ["Corrected the AI like a pro.", "Nutrition accuracy department: you.", "The bot guessed. You knew better."],
    supportingTextOptions: [
      "Corrected a meal today — accuracy assist, unlocked.",
      "Helped Tistra get a meal right today.",
      "A quick correction, a more accurate log.",
    ],
    // TODO: needs an event feed of correction actions (a "meal corrected"
    // event/timestamp) that this library's meal-input shape doesn't carry
    // yet — the actions.ts human-correction data exists per-meal but isn't
    // surfaced as a discrete "corrected today" event to this module.
    triggerDescription: "User successfully corrects a meal's AI classification today. TODO: needs a discrete 'correction happened today' event, not yet surfaced to this module.",
    triggerKey: "meal_correction_hero",
    achievementCriteria: { metric: "correctionCount", comparison: "daily", threshold: 1 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small magnifying glass over a plate icon, a checkmark, playful detective vibe.",
    nanoBananaPrompt: nanoBananaPrompt("a correction/accuracy win", "a magnifying glass, a checkmark, and a simple plate"),
    shareCta: "Share this win",
  },
  {
    id: "first-meal-logged",
    category: "daily_win",
    title: "First Meal Logged",
    headlineOptions: ["First meal logged. Tiny win, real momentum.", "And so the food story begins.", "One meal down. We're officially doing this."],
    supportingTextOptions: [
      "The very first meal is logged.",
      "The first entry in your food story.",
      "First meal ever, logged.",
    ],
    triggerDescription: "User logs their first meal ever (all-time meal count reaches 1).",
    triggerKey: "first_meal_logged",
    achievementCriteria: { metric: "totalMealsAllTime", comparison: "all_time", threshold: 1 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A single small plate icon with a sparkle, lots of open space, feels like a gentle beginning.",
    nanoBananaPrompt: nanoBananaPrompt("a first-ever logged meal, a small beginning", "a single plate, a sparkle, and a small seedling"),
    shareCta: "Share this win",
  },
  {
    id: "first-balanced-meal",
    category: "daily_win",
    title: "First Balanced Meal",
    headlineOptions: ["First balanced meal unlocked.", "Protein, carbs, fats, fiber: assembled.", "Your plate formed a functional team."],
    supportingTextOptions: [
      "First balanced meal, logged.",
      "A meal with everything it needed.",
      "First balanced plate in the books.",
    ],
    // TODO: "first ever" requires all-time balanced-meal history, not just
    // the current scoring window — proxied here as "first balanced meal
    // within the visible history" until an all-time counter exists.
    triggerDescription: "User logs their first balanced meal. TODO: needs an all-time balanced-meal counter; currently proxied from visible history only.",
    triggerKey: "first_balanced_meal",
    achievementCriteria: { metric: "balancedMealCount", comparison: "all_time", threshold: 1 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Four small icons (grain, protein, veg, fat) clicking together like puzzle pieces.",
    nanoBananaPrompt: nanoBananaPrompt("a first balanced meal, puzzle pieces coming together", "rice, dal, vegetables, and a small oil drop as puzzle pieces"),
    shareCta: "Share this win",
  },

  // ---- Weekly consistency wins ----
  {
    id: "five-day-logging-week",
    category: "weekly_consistency",
    title: "5-Day Logging Week",
    headlineOptions: ["5 days of showing up.", "Not perfect. Very real. Very useful.", "Consistency has entered the building."],
    supportingTextOptions: [
      "Logged meals on 5 days this week.",
      "5 days of consistency this week.",
      "Showed up 5 days this week.",
    ],
    triggerDescription: "User logs meals on at least 5 distinct days in the trailing 7-day window.",
    triggerKey: "five_day_logging_week",
    achievementCriteria: { metric: "distinctLoggingDays", comparison: "weekly", threshold: 5, minDaysRequired: 5 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A row of 7 small dots, 5 filled with a soft glow, playful progress-tracker feel.",
    nanoBananaPrompt: nanoBananaPrompt("a strong week of consistent logging", "a calendar, checkmarks, and a small trophy"),
    shareCta: "Share this win",
  },
  {
    id: "seven-day-logging-streak",
    category: "weekly_consistency",
    title: "7-Day Logging Streak",
    headlineOptions: ["7 days. Still showing up.", "One full week of consistency. Slightly iconic.", "A week of receipts. Respect."],
    supportingTextOptions: [
      "Logged meals every day this week.",
      "7 for 7 this week.",
      "A full week of consistent logging.",
    ],
    triggerDescription: "User logs meals on all 7 days in the trailing 7-day window.",
    triggerKey: "seven_day_logging_streak",
    achievementCriteria: { metric: "distinctLoggingDays", comparison: "weekly", threshold: 7, minDaysRequired: 7 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A full row of 7 glowing dots/stars, small confetti accents.",
    nanoBananaPrompt: nanoBananaPrompt("a full 7-day logging streak", "seven small stars in a row and light confetti"),
    shareCta: "Share this win",
  },
  {
    id: "protein-all-week",
    category: "weekly_consistency",
    title: "Protein All Week",
    headlineOptions: ["Protein stayed in the group chat.", "Protein showed up all week. As it should.", "Your meals didn't ghost protein."],
    supportingTextOptions: [
      "Protein showed up consistently this week.",
      "A full week of protein staying present.",
      "Protein had a strong week.",
    ],
    triggerDescription: "Protein target met or protein present consistently across the week (Food Balance Score's protein adequacy component is strong).",
    triggerKey: "protein_all_week",
    achievementCriteria: { metric: "proteinAdequacy", comparison: "weekly", threshold: 70, minDaysRequired: 5 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Weekly calendar strip with small protein-food icons on most days.",
    nanoBananaPrompt: nanoBananaPrompt("protein present all week", "eggs, paneer, dal, and chicken across a small calendar strip"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Protein showed up in a lot of this week's meals.",
  },
  {
    id: "balanced-meals-all-week",
    category: "weekly_consistency",
    title: "Balanced Meals All Week",
    headlineOptions: ["This week's meals had structure.", "Balanced meals all week. Very grown-up of you.", "Protein, carbs, fats, fiber: weekly attendance complete."],
    supportingTextOptions: [
      "Meals were balanced all week.",
      "A full week of balanced eating.",
      "This week's plates had real structure.",
    ],
    triggerDescription: "Balanced-meal threshold met across the week (macroAndFibreBalance component strong) and enough meals were logged.",
    triggerKey: "balanced_meals_all_week",
    achievementCriteria: { metric: "macroAndFibreBalance", comparison: "weekly", threshold: 70, minMealsRequired: 10, minDaysRequired: 5 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A full week strip of small balanced-plate icons, gentle glow, sparkle accents.",
    nanoBananaPrompt: nanoBananaPrompt("balanced meals across a whole week", "a weekly calendar strip and small balanced-plate icons"),
    shareCta: "Share this win",
  },
  {
    id: "fiber-friend-week",
    category: "weekly_consistency",
    title: "Fiber Friend Week",
    headlineOptions: ["Fiber Friend status unlocked.", "Fiber had a recurring role this week.", "Your meals got a little more grown-up."],
    supportingTextOptions: [
      "Fiber-rich foods showed up all week.",
      "A whole week of good fiber habits.",
      "Fiber was a regular this week.",
    ],
    triggerDescription: "Fiber-rich foods appear consistently across the week (fibreAdequacy/fibreAndMealVolume component strong).",
    triggerKey: "fiber_friend_week",
    achievementCriteria: { metric: "fibreAdequacy", comparison: "weekly", threshold: 70, minDaysRequired: 5 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Small badge-style icon with grains/beans/greens, 'Friend' framed playfully like a loyalty badge.",
    nanoBananaPrompt: nanoBananaPrompt("a weekly fiber-consistency badge", "oats, beans, and leafy greens arranged like a badge"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Fiber-rich foods showed up a good amount this week.",
  },
  {
    id: "more-color-this-week",
    category: "improvement",
    title: "More Color This Week",
    headlineOptions: ["More color, more plot.", "Fruit and vegetables got promoted.", "This week had more green energy."],
    supportingTextOptions: [
      "Fruits and vegetables showed up more this week.",
      "More color on the plate this week vs last.",
      "A more colorful week of eating.",
    ],
    triggerDescription: "Fruit/vegetable frequency improved vs the previous week (fruitAndVegetableIntake component up week over week).",
    triggerKey: "more_color_this_week",
    achievementCriteria: { metric: "fruitAndVegetableIntake", comparison: "previous_period", threshold: 10 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Two small plates side by side, the second noticeably more colorful, a small upward arrow between them.",
    nanoBananaPrompt: nanoBananaPrompt("more colorful produce than last week", "carrot, spinach, tomato, and a small upward arrow"),
    shareCta: "Share this win",
  },
  {
    id: "home-cooked-momentum",
    category: "weekly_consistency",
    title: "Home-Cooked Momentum",
    headlineOptions: ["Home-cooked meals were on a roll.", "Chef energy showed up this week.", "Your kitchen deserves a small applause."],
    supportingTextOptions: [
      "Home-cooked meals had a strong week.",
      "The kitchen was busy this week.",
      "Home cooking built some real momentum.",
    ],
    triggerDescription: "Home-cooked meal frequency improved or exceeded threshold this week (homePreparedMealShare component strong).",
    triggerKey: "home_cooked_momentum",
    achievementCriteria: { metric: "homePreparedMealShare", comparison: "weekly", threshold: 60, minDaysRequired: 4 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small stovetop icon with a weekly progress arc around it, warm glow.",
    nanoBananaPrompt: nanoBananaPrompt("home cooking momentum across the week", "a cooking pot, steam, and a small progress arc"),
    shareCta: "Share this win",
  },
  {
    id: "best-week-so-far",
    category: "weekly_consistency",
    title: "Best Week So Far",
    headlineOptions: ["Best week so far. Quietly iconic.", "This was your strongest week yet.", "Progress called. It has receipts."],
    supportingTextOptions: [
      "Strongest week yet.",
      "This week beat all your previous weeks.",
      "A new personal best this week.",
    ],
    // TODO: needs multi-week history (best Food Balance Score / most
    // meals logged / best consistency across all prior weeks) — the
    // caller must supply `weeksOfHistory` (see triggers.ts) for this to
    // be evaluated; without it, this always returns not-earned.
    triggerDescription: "Best Food Balance Score, most meals logged, or best consistency week to date. TODO: requires multi-week history supplied by the caller (weeksOfHistory); not evaluated without it.",
    triggerKey: "best_week_so_far",
    achievementCriteria: { metric: "weeklyScore", comparison: "all_time" },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small trophy or star burst icon, celebratory but understated.",
    nanoBananaPrompt: nanoBananaPrompt("a personal-best week", "a small trophy, stars, and light confetti"),
    shareCta: "Share this win",
  },
  {
    id: "weekend-didnt-break-the-streak",
    category: "weekly_consistency",
    title: "Weekend Didn't Break the Streak",
    headlineOptions: ["The weekend tried. You stayed in rhythm.", "Weekend consistency? Rare behavior.", "Saturday and Sunday met the plan."],
    supportingTextOptions: [
      "Kept logging through the weekend.",
      "The weekend didn't slow you down.",
      "Saturday and Sunday stayed on track.",
    ],
    triggerDescription: "User logs meals over the weekend and maintains balance/consistency (both Saturday and Sunday have logged meals in the trailing week).",
    triggerKey: "weekend_didnt_break_streak",
    achievementCriteria: { metric: "weekendLoggingDays", comparison: "weekly", threshold: 2 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small weekend calendar chip (Sat/Sun) with a glow, playful not corporate.",
    nanoBananaPrompt: nanoBananaPrompt("weekend consistency", "a small calendar chip highlighting the weekend, with a soft glow"),
    shareCta: "Share this win",
  },
  {
    id: "comeback-week",
    category: "comeback",
    title: "Comeback Week",
    headlineOptions: ["Back in the game.", "Consistency returned. Plot twist.", "After a quiet stretch, you showed up again."],
    supportingTextOptions: [
      "Back, and it's showing in the meals.",
      "A quiet stretch, then a real return.",
      "Picked it back up this week.",
    ],
    triggerDescription: "User returns after a period of inactivity (no meals logged for 7+ days) and logs meals for 2-3 days since returning.",
    triggerKey: "comeback_week",
    achievementCriteria: { metric: "daysSinceReturn", comparison: "weekly", threshold: 2, minDaysRequired: 2 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small path/road motif picking back up after a gap, warm sunrise-like gradient.",
    nanoBananaPrompt: nanoBananaPrompt("a welcome-back / comeback moment", "a simple path, a small sun, and a plate at the end"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Good to see you back — keep the momentum going.",
  },

  // ---- Food balance / improvement wins ----
  {
    id: "more-balanced-than-last-week",
    category: "improvement",
    title: "More Balanced Than Last Week",
    headlineOptions: ["More balanced than last week. We noticed.", "Small upgrade. Big energy.", "Your meals got more organized."],
    supportingTextOptions: [
      "Meals were more balanced than last week.",
      "An upgrade from last week's balance.",
      "This week beat last week on balance.",
    ],
    triggerDescription: "Food Balance Score or balanced-meal rate improves vs the previous week.",
    triggerKey: "more_balanced_than_last_week",
    achievementCriteria: { metric: "foodBalanceScore", comparison: "previous_period", threshold: 5 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small upward step/staircase motif made of plate icons.",
    nanoBananaPrompt: nanoBananaPrompt("week-over-week balance improvement", "small plate icons forming an upward staircase"),
    shareCta: "Share this win",
  },
  {
    id: "more-protein-than-last-week",
    category: "improvement",
    title: "More Protein Than Last Week",
    headlineOptions: ["Protein is no longer a side character.", "Protein got more screen time this week.", "Your meals found their protein arc."],
    supportingTextOptions: [
      "Added more protein than last week.",
      "Protein had a bigger role this week.",
      "An upgrade in protein vs last week.",
    ],
    triggerDescription: "Average protein/day improves meaningfully vs the previous week.",
    triggerKey: "more_protein_than_last_week",
    achievementCriteria: { metric: "avgProteinG", comparison: "previous_period", threshold: 5 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small protein-food icon stepping into a spotlight, playful theater motif.",
    nanoBananaPrompt: nanoBananaPrompt("protein taking a bigger role than last week", "eggs, paneer, and dal in a small spotlight circle"),
    shareCta: "Share this win",
  },
  {
    id: "more-fiber-than-last-week",
    category: "improvement",
    title: "More Fiber Than Last Week",
    headlineOptions: ["Fiber made a comeback.", "Your meals got more texture.", "A quiet win for future you."],
    supportingTextOptions: [
      "Added more fiber than last week.",
      "Fiber improved vs last week.",
      "An upgrade in fiber-rich foods this week.",
    ],
    triggerDescription: "Average fiber/day or fiber-rich food count improves vs the previous week.",
    triggerKey: "more_fiber_than_last_week",
    achievementCriteria: { metric: "avgFiberG", comparison: "previous_period", threshold: 5 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Small grain/legume icons with a soft upward trend line behind them.",
    nanoBananaPrompt: nanoBananaPrompt("a quiet fiber improvement vs last week", "oats, beans, and a soft upward trend line"),
    shareCta: "Share this win",
  },
  {
    id: "better-breakfast-balance",
    category: "improvement",
    title: "Better Breakfast Balance",
    headlineOptions: ["Breakfast got its act together.", "Morning meals, now with more plot.", "Breakfast stopped freelancing."],
    supportingTextOptions: [
      "Breakfast got more balanced this week.",
      "Mornings had more structure this week.",
      "An upgrade to your breakfast routine.",
    ],
    // TODO: needs meal-type-scoped balance scoring (protein/fiber/balance
    // computed specifically for breakfast-tagged meals week over week) —
    // this library's minimal meal shape carries mealType, so this is
    // computable once the caller passes enough breakfast-tagged meals,
    // but the underlying per-meal-type scoring helper doesn't exist yet
    // in @nutriai/health-scoring; a simple mealType filter proxy is used
    // for now.
    triggerDescription: "Breakfast protein/fiber/balance improves vs the previous week. TODO: needs a proper per-meal-type scoring helper; currently proxied via a simple mealType filter.",
    triggerKey: "better_breakfast_balance",
    achievementCriteria: { metric: "breakfastBalance", comparison: "previous_period" },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small sunrise with a breakfast plate silhouette, warm morning tones.",
    nanoBananaPrompt: nanoBananaPrompt("an improved breakfast routine", "a sunrise, eggs, oats, and fruit"),
    shareCta: "Share this win",
  },
  {
    id: "better-dinner-balance",
    category: "improvement",
    title: "Better Dinner Balance",
    headlineOptions: ["Dinner came through.", "Evening meals found balance.", "Dinner had structure. Respect."],
    supportingTextOptions: [
      "Dinner got more balanced this week.",
      "Evenings had more structure this week.",
      "An upgrade to your dinner routine.",
    ],
    // TODO: same as Better Breakfast Balance — proxied via a mealType
    // filter until a real per-meal-type scoring helper exists.
    triggerDescription: "Dinner balance improves vs the previous week. TODO: needs a proper per-meal-type scoring helper; currently proxied via a simple mealType filter.",
    triggerKey: "better_dinner_balance",
    achievementCriteria: { metric: "dinnerBalance", comparison: "previous_period" },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small moon/evening motif with a balanced dinner plate silhouette.",
    nanoBananaPrompt: nanoBananaPrompt("an improved dinner routine", "a small moon, rice, dal, and vegetables"),
    shareCta: "Share this win",
  },
  {
    id: "carb-balance-win",
    category: "food_balance",
    title: "Carb Balance Win",
    headlineOptions: ["Carbs stayed. Balance joined.", "Rice/roti/noodles plus backup.", "The carbs brought friends."],
    supportingTextOptions: [
      "Carb-heavy meals brought balance along.",
      "Carbs showed up with protein and veg this week.",
      "A more complete plate around your favorite carbs.",
    ],
    // TODO: needs food-group tagging to detect "previously carb-heavy,
    // now paired with protein/fiber/veg" — not evaluated without
    // foodGroups data; proxied loosely via macroAndFibreBalance for now.
    triggerDescription: "Previously carb-heavy meals now include protein/fiber/veg more often. TODO: needs per-meal food-group tagging; currently proxied via the overall macro/fibre balance component.",
    triggerKey: "carb_balance_win",
    achievementCriteria: { metric: "macroAndFibreBalance", comparison: "weekly", threshold: 65 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "Rice/roti icon with small protein and veg icons joining it like friends arriving.",
    nanoBananaPrompt: nanoBananaPrompt("carbs joined by protein and vegetables", "rice, roti, dal, and a small vegetable icon"),
    shareCta: "Share this win",
  },
  {
    id: "ultra-processed-frequency-down",
    category: "improvement",
    title: "Ultra-Processed Frequency Down",
    headlineOptions: ["Less packet chaos this week.", "Whole-food energy entered the chat.", "Snacks behaved slightly better."],
    supportingTextOptions: [
      "Fewer packaged/ultra-processed meals this week.",
      "A shift toward whole foods this week.",
      "Less packaged food this week vs last.",
    ],
    triggerDescription: "Ultra-processed meal/snack frequency decreases vs the previous week (minimallyProcessedFoodBalance component up).",
    triggerKey: "ultra_processed_frequency_down",
    achievementCriteria: { metric: "minimallyProcessedFoodBalance", comparison: "previous_period", threshold: 10 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A packaged-snack icon fading slightly while a whole-food icon (fruit/nuts) brightens.",
    nanoBananaPrompt: nanoBananaPrompt("a shift toward whole foods vs last week", "fresh fruit, nuts, and a faded packaged snack icon"),
    shareCta: "Share this win",
  },
  {
    id: "goal-aligned-week",
    category: "food_balance",
    title: "Goal-Aligned Week",
    headlineOptions: ["Your meals matched the mission.", "Goal support: visible.", "The plan and the plate got along."],
    supportingTextOptions: [
      "This week's meals supported your goal.",
      "Eating pattern matched the goal this week.",
      "The plate and the plan agreed this week.",
    ],
    triggerDescription: "Meal patterns align with the user's selected nutrition goal (goalAlignmentScore is strong for the period).",
    triggerKey: "goal_aligned_week",
    achievementCriteria: { metric: "goalAlignmentScore", comparison: "weekly", threshold: 70, minDaysRequired: 5 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small target/compass icon aligned with a plate icon, no numbers.",
    nanoBananaPrompt: nanoBananaPrompt("meals aligned with a personal nutrition goal", "a small compass, a plate, and a soft glow"),
    shareCta: "Share this win",
    lowConfidenceFallback: "Meals supported the goal nicely this week.",
  },

  // ---- Personality / playful badges ----
  {
    id: "protein-loyalist",
    category: "personality_badge",
    title: "Protein Loyalist",
    headlineOptions: ["Certified Protein Loyalist.", "You don't play about protein.", "Protein saw your meals and felt respected."],
    supportingTextOptions: [
      "Protein has been a constant for weeks now.",
      "You've kept protein consistent for a while.",
      "A multi-week streak of protein showing up.",
    ],
    // TODO: needs multi-week history (protein consistency across 3+
    // weeks) — caller must supply `weeksOfHistory`; not evaluated
    // without it.
    triggerDescription: "Protein consistency threshold met over multiple weeks. TODO: requires multi-week history supplied by the caller (weeksOfHistory); not evaluated without it.",
    triggerKey: "protein_loyalist",
    achievementCriteria: { metric: "proteinAdequacy", comparison: "all_time", threshold: 70, minDaysRequired: 21 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small badge/medallion with a protein-food icon at its center, loyalty-card styling but playful.",
    nanoBananaPrompt: nanoBananaPrompt("a 'protein loyalist' badge", "a badge shape with eggs, paneer, and dal at its center"),
    shareCta: "Share this win",
  },
  {
    id: "balanced-plate-enthusiast",
    category: "personality_badge",
    title: "Balanced Plate Enthusiast",
    headlineOptions: ["Certified Balanced Plate Enthusiast.", "You and balanced meals are getting serious.", "Balanced plate behavior detected."],
    supportingTextOptions: [
      "Balanced meals have been a habit for weeks now.",
      "You've kept meals balanced for a while.",
      "A multi-week streak of balanced eating.",
    ],
    // TODO: needs multi-week history (balanced-meal frequency across 3+
    // weeks) — caller must supply `weeksOfHistory`; not evaluated
    // without it.
    triggerDescription: "Balanced-meal frequency threshold met over multiple weeks. TODO: requires multi-week history supplied by the caller (weeksOfHistory); not evaluated without it.",
    triggerKey: "balanced_plate_enthusiast",
    achievementCriteria: { metric: "macroAndFibreBalance", comparison: "all_time", threshold: 70, minDaysRequired: 21 },
    defaultFormat: "story_9_16",
    allowedFormats: ["story_9_16", "square_1_1"],
    privacyRisk: "low",
    hideExactMetricsByDefault: true,
    visualDirection: "A small badge/medallion with a balanced-plate icon at its center, matching the Protein Loyalist badge style.",
    nanoBananaPrompt: nanoBananaPrompt("a 'balanced plate enthusiast' badge", "a badge shape with a balanced plate icon at its center"),
    shareCta: "Share this win",
  },
];

if (process.env.NODE_ENV !== "production") {
  const ids = new Set<string>();
  for (const c of SHARE_CARD_CONCEPTS) {
    if (ids.has(c.id)) throw new Error(`Duplicate share card concept id: ${c.id}`);
    ids.add(c.id);
  }
}
