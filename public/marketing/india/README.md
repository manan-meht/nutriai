# India coach landing imagery

These are the **real India photographs** — an Indian gym and an Indian park,
with an Indian coach teaching in each. They are used only by the India
market (`IN_COACH_MARKET.images` and `.featured` in
`src/lib/landing/coach-market.ts`). Singapore keeps its own set in
`public/marketing/` and `public/coach-photos/`.

Sourced as JPEG and converted to WebP with sharp at quality 82, resized to
the width each slot actually renders at. Never upscaled.

| file | px | used for |
|---|---|---|
| coach-hero-in.webp | 1200x1490 | India hero, right column |
| coach-practice-in.webp | 2400x1340 | India closing band — the headline overlays the centre third, which is deliberately clear |
| discipline-strength-in.webp | 1200x1607 | "What do you coach?" left card |
| discipline-yoga-in.webp | 1200x1607 | "What do you coach?" right card |

To replace one, overwrite the file at the same path — no code change.
