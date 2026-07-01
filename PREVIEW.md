# Developer Preview Guide

## Prerequisites

1. `npm install` — already done
2. Fill in `.env.local` with real Supabase + AI keys
3. Run `supabase/schema.sql` against your Supabase project
4. `npm run dev`

---

## Preview all landing page combinations

The app resolves the product from `NEXT_PUBLIC_PRODUCT` in local dev.
Use `?landing=` query param to force a variant.

| Combination | URL |
|---|---|
| Gym + Standard | `http://localhost:3000/?landing=standard` (set `NEXT_PUBLIC_PRODUCT=gym`) |
| Gym + Immersive | `http://localhost:3000/?landing=immersive` (set `NEXT_PUBLIC_PRODUCT=gym`) |
| Adults + Standard | `http://localhost:3000/?landing=standard` (set `NEXT_PUBLIC_PRODUCT=adults`) |
| Adults + Immersive | `http://localhost:3000/?landing=immersive` (set `NEXT_PUBLIC_PRODUCT=adults`) |

### Using separate hostnames (recommended for multi-product preview)

Add to `/etc/hosts`:
```
127.0.0.1  gym.localhost
127.0.0.1  adults.localhost
```

Then visit:
```
http://gym.localhost:3000/?landing=standard
http://gym.localhost:3000/?landing=immersive
http://adults.localhost:3000/?landing=standard
http://adults.localhost:3000/?landing=immersive
```

### Reduced-motion preview
Enable "Reduce motion" in macOS System Settings → Accessibility → Display, then visit any immersive URL. The shader renders a single still frame; all CSS transitions are removed; the sticky story renders as a flat column.

### Slow-network / Data Saver fallback preview
The performance-aware fallback (`resolveClientVariant`) is client-side. To test:
- Open DevTools → Network → Throttle → Slow 3G
- Or use Chrome flags: `chrome://flags/#enable-force-dark` (not directly related but DataSaver simulation is available via the Lite Mode flag in older Chrome)
- The `resolveClientVariant` function can be tested directly via unit tests (`npm test`)

---

## Experiment configuration

Change landing mode per-product via `.env.local`:

```env
GYM_LANDING_MODE=standard_only     # always standard
GYM_LANDING_MODE=immersive_only    # always immersive
GYM_LANDING_MODE=ab_test           # 50/50 stable cookie assignment (default)
GYM_LANDING_MODE=performance_aware # immersive only on capable devices
```

To change the split:
```env
LANDING_IMMERSIVE_SPLIT_PCT=30   # 30% immersive, 70% standard
```

To allow `?landing=` overrides in production:
```env
ALLOW_LANDING_OVERRIDE=true
```

---

## Running tests

```bash
npm test              # run all unit tests
npm run test:watch    # watch mode
npm run type-check    # TypeScript check
```

**Test coverage:**
- Product hostname resolution (gym / adults / null)
- Cross-product switch URL generation
- Assignment cookie parse / serialize / rejection
- Query override resolution
- Forced mode (standard_only / immersive_only)
- Per-product experiment separation (cookie + experiment ID)
- Stable assignment persistence
- Performance-aware degradation (saveData, 2g, reduced motion)
- Safe analytics params (no health data)
- Gym permission gates (trainer / client / null role)
- Family alert evaluator (single meal → no alert)
- Indian Nutrition Database exact + partial + token match
- INDB nutrition estimation arithmetic

---

## Architecture

```
src/
  types/index.ts                        All platform types
  lib/
    supabase/{client,server,middleware}  Supabase setup
    product/resolve-product.ts          Hostname → ProductType
    experiments/
      landing-page-experiment.ts        A/B assignment + cookie
      landing-page-performance.ts       Client network/device signals
    landing/routes.ts                   CTA routes + attribution storage

  packages/
    core/
      workspaces/                       Workspace CRUD
      meals/                            Canonical meal CRUD
      invitations/                      Token-based invitations
    analysis/
      shared-food-recognition/
        index.ts                        Gemini → INDB → GPT-4o pipeline
        indian-nutrition-db.ts          INDB lookup + estimation
      gym-intelligence/
        gym-meal-analysis.ts            Meal vs. training context + goals
        gym-goal-evaluator.ts           Goal adherence over a period
        gym-report-generator.ts         Weekly report draft
        coach-review-prioritisation.ts  Attention queue building
      family-intelligence/
        family-meal-analysis.ts         Meal signals vs. baseline
        family-alert-evaluator.ts       Sustained pattern → alert
        family-summary-generator.ts     Weekly summary
    dashboards/
      coach-dashboard-service.ts        Gym: coach overview, client detail, review queue
      family-dashboard-service.ts       Family: overview, summary, alerts + permission filter
    permissions/
      gym-permissions.ts               Role → GymPermissions
      family-sharing-permissions.ts    Older adult controls their own data
    notifications/
      gym-notification-templates.ts    Gym-specific wording
      family-notification-templates.ts Family-specific calm wording
    background/
      meal-confirmed-handler.ts        MealConfirmedEvent → gym or family path

  components/
    motion/
      useReducedMotion.ts
      useScrollProgress.ts
      Reveal.tsx                       Intersection-observer fade-in
      ParallaxLayer.tsx                Scroll-driven parallax
      StickyStorySection.tsx           Sticky scroll narrative
      GymShaderBackground.tsx          Stitch ANIMATION_17 — WebGL, purple palette
      AdultsShaderBackground.tsx       Stitch ANIMATION_18 — WebGL, warm wave
    landing/
      shared/LandingNav.tsx            Shared nav with cross-product switch
      shared/LandingFooter.tsx
      standard/GymStandardLanding.tsx  Gym Variant A
      standard/AdultsStandardLanding.tsx Adults Variant A
      immersive/GymImmersiveLanding.tsx  Gym Variant B (Stitch hero + shader)
      immersive/AdultsImmersiveLanding.tsx Adults Variant B (Stitch hero + shader)

  app/
    layout.tsx
    globals.css
    (public)/page.tsx                  Product + variant resolution → correct page
    (gym)/gym/{signup,login,dashboard}
    (adults)/adults/{signup,login,dashboard}

public/
  landing/
    gym/immersive/hero/gym-hero.png    Stitch: Indian man, modern gym (1376×768)
    adults/immersive/hero/adults-hero.png Stitch: Indian woman, home (1376×768)

supabase/
  schema.sql                           Full DB schema (shared + gym + family tables)
```

---

## Stitch asset inventory

| File | Used in | Notes |
|---|---|---|
| `stitch_immersive/a_cinematic_high_quality.../screen.png` | `GymImmersiveLanding` hero | Gym-specific; does NOT load on Adults page |
| `stitch_immersive/a_warm_cinematic.../screen.png` | `AdultsImmersiveLanding` hero | Adults-specific; does NOT load on Gym page |
| `stitch_immersive/shader_2/code.html` | `GymShaderBackground` | ANIMATION_17, purple #6750A4 palette. Extracted to React component with IntersectionObserver pause and reduced-motion still-frame |
| `stitch_immersive/shader_1/code.html` | `AdultsShaderBackground` | ANIMATION_18, warm #F8F2FB palette. Same extraction approach |

Both shaders: pause when off-screen (IntersectionObserver), render a single still frame for reduced-motion users, and are dynamically imported so neither shader loads on the wrong product page.

---

## Asset optimisation (TODO before production launch)

- [ ] Convert `gym-hero.png` (1376×768) → WebP + AVIF at 1376px, 800px, 400px responsive sizes
- [ ] Convert `adults-hero.png` similarly
- [ ] Set `next/image` `sizes` prop to match actual rendered widths
- [ ] Consider lazy-loading the hero images on mobile (they're above-the-fold on desktop only)
- [ ] Measure LCP — hero image is the LCP candidate; ensure it is `priority` and preloaded (already set)

---

## Production rollout sequence (recommended)

1. Deploy with `GYM_LANDING_MODE=standard_only` and `ADULTS_LANDING_MODE=standard_only`
2. Verify standard pages work on both domains
3. Switch to `immersive_only` on a staging environment and QA all story sections, reduced-motion, mobile
4. Switch to `ab_test` at 10% immersive (`LANDING_IMMERSIVE_SPLIT_PCT=10`) on production
5. Monitor Core Web Vitals and conversion for 1–2 weeks
6. Ramp to 50/50 if metrics are healthy
7. Consider `performance_aware` mode if mobile conversion underperforms

---

## Analytics events emitted

All events are sent via `trackLandingEvent()` in `src/lib/landing/routes.ts`.
Register your analytics provider (PostHog, Segment, etc.) with `registerLandingTracker()`.

| Event | When |
|---|---|
| `landing_variant_assigned` | New assignment cookie written |
| `landing_variant_viewed` | Page renders |
| `landing_hero_cta_clicked` | Hero CTA click |
| `landing_secondary_cta_clicked` | Secondary CTA click |
| `landing_scroll_depth` | Scroll milestone (25/50/75/100%) |
| `landing_section_viewed` | Story section becomes active |
| `landing_signup_started` | Signup page reached with attribution |
| `landing_asset_failure` | Image/shader load error |
| `landing_fallback_triggered` | Performance-aware → standard |
| `landing_reduced_motion_used` | Reduced-motion preference detected |

Properties always include: `product`, `variant`, `experimentId`, `selectionMode`.
Never include: meal images, health data, names, workspace content.
