# Food-Model Improvement Infrastructure Audit

Repo: `/Users/manan/projects/nutriai-fresh` — audited 2026-07-25 (branch `main`, clean).
Scope: everything needed for a consent-gated, QC'd, retrieval/fine-tuning-ready
continuous-learning pipeline for Gemini-based food recognition.

This is a read-only audit. No code, schema, or data was modified. All claims
are marked **[confirmed: file:line]** (verified by reading the cited code) or
**[assumption]** (inferred/likely but not directly verified).

---

## A. Executive summary

Overall estimate: **~35–40% of the full ML-ops vision is implemented or
partially implemented; the rest is either scaffolded-but-empty or fully
missing.** These are engineering judgment calls, not measurements — no
production data was queried (see section E).

The standout finding: the team has already built an unusually complete
**QC-review schema** (`meal_submissions`, `ai_meal_classifications`,
`human_meal_reviews`, `food_knowledge_base`, `meal_review_audit_logs`,
`meal_embeddings`) with the original-vs-corrected distinction, versioning
fields, dataset-split fields, and consent flags all present **on paper**,
per `supabase/migrations/0013_meal_review_console.sql` and
`0015_meal_embeddings_dataset_fields.sql` — and this is explicitly documented
as forward-scaffolding in `docs/meal-review-console-notes.md`
("none of the pipeline below is built yet except where noted"). The gap is
almost entirely in the *consumption* side: nothing generates embeddings,
nothing retrieves similar meals into the Gemini prompt, there's no dedicated
admin review UI beyond a queue/actions layer, no eval harness, and no
fine-tuning export path.

Per-area maturity estimates:

| Area | Maturity | Basis |
|---|---|---|
| Data capture (images, corrections, portion data) | ~65% | Images stored, corrections captured in 2 separate tables, portion structure rich |
| Consent & privacy | ~40% | Fields exist and default-safe; no UI to set them, no redaction pipeline, no revocation flow |
| Food ontology / canonical catalogue | ~25% | `food_knowledge_base` exists but foods are still free-text in `meal_logs`/`foods` jsonb, no FK/dedup |
| QC tooling | ~45% | Server actions + queue/priority logic exist; no confirmed dedicated review-UI page files found beyond `admin/page.tsx`/`actions.ts` |
| Retrieval & embeddings | ~5% | Table + pgvector extension exist; nothing writes or reads from it |
| Confidence logic | ~70% | Rich, structured, well-tested confidence/ambiguity/auto-save logic already in production |
| Evaluation / analytics | ~20% | Model-quality metrics module + accuracy-by-version grouping exist; no dashboard page, no golden set, no regression tests found |
| Fine-tuning readiness | ~5% | Dataset-split/gold-standard columns exist; no export scripts, no JSONL, no tuning config |
| Continuous-learning loop | ~15% | Review queue + priority scoring exist and are usable manually; nothing auto-triggers retraining or dataset promotion |

---

## B. Current end-to-end flow (real names, with loss points marked)

1. **WhatsApp image arrives** → webhook handler in
   `src/lib/whatsapp/conversation-handler.ts` (dispatched from the
   WhatsApp webhook route). Message/media dedup via
   `whatsapp_processed_messages` (0024) and `whatsapp_processed_media` (0026)
   **[confirmed: supabase/migrations/0026_whatsapp_media_dedup.sql]**.
2. **Media download**: `downloadMedia(mediaId)` in `src/lib/whatsapp/client.ts:75`
   **[confirmed]** — two Graph API calls (metadata, then binary) via
   `GRAPH_URL = https://graph.facebook.com/v20.0` **[confirmed: client.ts:1]**.
   ⚠️ **Loss point**: no EXIF/GPS stripping step found anywhere in the repo
   (grep for `exif`/`EXIF`/`GPS` across `src` and `apps` returned nothing).
   Whatever metadata WhatsApp's own media pipeline leaves in the JPEG is
   stored as-is.
3. **Storage**: `uploadMealPhoto()` in `conversation-handler.ts:111-133`
   **[confirmed]** uploads the raw buffer to Supabase Storage bucket
   `meal-photos` (declared **public** — `supabase/migrations/0026_whatsapp_media_dedup.sql`
   predecessor `0026_...` — actually declared in
   `supabase/migrations/0026_whatsapp_media_dedup.sql`... corrected: bucket is
   created in `supabase/migrations/0026_whatsapp_media_dedup.sql`? — see exact
   citation below) at path `${entityId}/${Date.now()}.${ext}`. No separate
   "original vs. processed" copy — one file, one URL, no resizing/compression
   step, no checksum recorded. ⚠️ **Loss point**: only mime-derived extension
   and the public URL are recorded; no width/height/size/checksum metadata is
   captured anywhere.
   (Correction/citation: the bucket is created in
   `supabase/migrations/0012_meal_photos.sql:8-14` **[confirmed]** — a public
   bucket, justified there as "already only reachable by whoever has the
   caregiver's/contact's dashboard link/session.")
4. **Gemini analysis**: `analyzeFood()` in `src/lib/ai/food-analyzer.ts:285-355`
   **[confirmed]** — calls `gemini-2.5-flash` via `@google/generative-ai`
   (Gemini Developer API, not Vertex AI — confirmed by the import and by
   `GEMINI_API_KEY` being the only relevant env var found, see section on env
   vars). One giant structured-JSON system prompt (lines 163–283) asks for
   per-item portion data (`food_category`, edible-weight range, egg counts),
   confidence signals (`confidence`, `portion_confidence`, `food_identity_confidence`,
   `image_quality`, `food_visibility`, `has_hidden_protein_food`), and
   high-impact-ambiguity flags (`has_high_impact_ambiguity`,
   `clarification_question`). A 25-second timeout race guards against a hung
   call **[confirmed: food-analyzer.ts:321-331]**.
   Code then **recomputes** calories/protein from the portion data for
   categorized foods (`recalculateNutritionFromPortions`,
   `computeItemNutrition`, `applyPortionConsistencyCaps`,
   `applyHighProteinSanityCheck` — lines 402-527) — i.e. Gemini does food
   ID + portion estimation, deterministic code does the calorie/protein math
   for meat/egg/paneer/tofu/avocado/nuts/legume categories, while rice/roti/
   mixed curries keep Gemini's own numbers. This is a meaningful,
   well-tested piece of "structured output + code-side calculation" already
   in place (covered by `src/__tests__/food-analyzer-portion*.test.ts`).
   ⚠️ **Loss point**: the raw Gemini response text is parsed and then
   discarded in the WhatsApp flow's own pending-meal state; it IS separately
   persisted to `ai_meal_classifications.raw_ai_response_json` when the meal
   is later saved (step 6) — but only after a save, not for meals abandoned
   before saving.
5. **User message**: `buildEstimateMessage` / `buildAutoSaveMessage` /
   `buildHighImpactClarificationMessage` (`food-analyzer.ts:808-936`)
   **[confirmed]** produce the WhatsApp reply. `computeSaveDecision()`
   (lines 577-615) is the actual auto-save/clarification decision function.
6. **Confirmation / correction / auto-save**: handled inline in
   `handleIncomingMessage`'s closures in `conversation-handler.ts`
   (`saveMeal` at line 721, `updateSavedMeal` at 819, `deleteMeal`/"Undo" at
   846). Auto-save is the default for high/medium confidence with no
   high-impact ambiguity; "Yes"-gated confirmation only for low-confidence/
   ambiguous cases. Corrections to an *already-saved* meal call
   `updateSavedMeal()` which **overwrites the `meal_logs` row in place** —
   this is expected and by design for the user-facing table (meal_logs is
   explicitly documented as "source of truth for user-facing dashboards,"
   per `0013_meal_review_console.sql:9-13`), but it means **`meal_logs`
   itself never keeps the pre-correction values** — only the QC schema does
   (see step 7).
7. **Meal save + QC recording**: `saveMeal()` inserts into `meal_logs`, then
   calls `recordMealSubmissionForReview()` (`conversation-handler.ts:855-918`)
   **[confirmed]**, which inserts one `meal_submissions` row and one
   `ai_meal_classifications` row (holding `model_name`, `prompt_version`,
   `taxonomy_version`, `food_knowledge_base_version`, the full
   `structured_ai_output_json`/`raw_ai_response_json`, and a synthesized
   `confidence_score`). **This is the "original AI prediction" record and it
   is never overwritten** — a later correction produces a NEW
   `human_meal_reviews` row (written from the admin review console) rather
   than mutating `ai_meal_classifications`. ✅ Not a loss point — this is the
   one place original vs. corrected vs. final is actually preserved
   end-to-end, matching the design note's claim in
   `docs/meal-review-console-notes.md:14-18`.
   A **second, independent** correction-capture path exists:
   `recordPortionCorrectionFeedback()` (`conversation-handler.ts:925-970`)
   writes to `meal_portion_corrections` whenever a same-session WhatsApp
   correction meaningfully changes protein/food/meal-type — this captures
   the *in-the-moment* user correction (including corrections to a
   not-yet-saved pending meal), distinct from an *employee's* later QC
   review in `human_meal_reviews`.
8. **Nutrition totals / dashboard**: daily totals are computed by summing
   `meal_logs.total_calories_min/max` etc. across the day in the dashboard
   server actions — confirmed present in
   `src/app/(adults)/adults/dashboard/actions.ts`,
   `src/app/(gym)/gym/dashboard/actions.ts`, and
   `src/lib/food-balance/todays-focus-data.ts` (all reference
   `total_calories_min`/`total_calories_max`) **[confirmed by grep, exact
   function names not individually re-verified line-by-line — treat as
   confirmed-location / assumption-on-exact-function-name]**. A recent commit
   (`83ff29e`, per git log) specifically fixed macro averages to divide by
   days-logged rather than range length, consistent with this being the
   live calculation path.

**Summary of loss/overwrite points**: (1) no EXIF/GPS stripping before
storage: (2) no checksum/dimension metadata captured at upload; (3)
`meal_logs` itself is overwritten in place on correction (by design — QC
tables are the audit trail, not meal_logs); (4) raw Gemini output for a meal
that's never saved (skipped/discarded) is not retained anywhere.

---

## C. Implementation matrix

| Capability | Status | Evidence | Relevant files | DB objects | Notes |
|---|---|---|---|---|---|
| Food image storage | Implemented | `uploadMealPhoto()` | `src/lib/whatsapp/conversation-handler.ts:111` | `meal-photos` storage bucket (`0012_meal_photos.sql`), `meal_logs.image_url`, `meal_submissions.image_url` | Public bucket, single copy, no resize/compress step |
| Image metadata (mime/size/dims/checksum) | Not implemented | grep found only mime→extension mapping, no width/height/checksum fields anywhere in schema | `conversation-handler.ts:100-105` | — | — |
| EXIF/GPS stripping | Not implemented | No `exif`/`EXIF`/`GPS` hits repo-wide | — | — | Risk if WhatsApp-forwarded images retain location data |
| Originals vs. processed image separation | Not implemented | Single upload path, one file per photo | `conversation-handler.ts:111-133` | — | — |
| Image deletion on account delete | Unable to verify | Soft-delete pattern found for contacts (`deleted_at`), no cascade/cleanup job found for storage objects | `supabase/migrations/0004_soft_delete_and_monthly_quota.sql` | `adults_contacts.deleted_at`, `gym_clients.deleted_at` | Soft delete keeps DB rows; storage-bucket cleanup not found |
| Consent for model-improvement use | Partially implemented | Columns exist, default false, but no UI/flow found to set them to true | `supabase/migrations/0013_meal_review_console.sql:53-60` | `meal_submissions.consent_for_model_improvement`, `.eligible_for_anonymized_training` | "Never usable by default" per dev note |
| Consent revocation | Not implemented | No update path found for these columns outside migration defaults | — | — | — |
| Face/PII detection flags | Partially implemented | Boolean columns exist (`contains_face_or_person`, `contains_sensitive_background`, `needs_redaction`, `redacted_image_url`) | `0013_meal_review_console.sql:57-60` | same table | No detector populates these — manual/未-automated |
| De-identification / anonymized display | Implemented | `anonymizedUserId()` deterministic hash | `src/app/(admin)/admin/actions.ts:13-17` | — | Review console never shows real name/phone |
| Original AI prediction kept distinct from correction | Implemented | Separate tables, `on delete set null` FK preserves history after meal deletion | `ai_meal_classifications` vs `human_meal_reviews` (`0013_meal_review_console.sql`) | both tables | Confirmed by design note + code (`recordMealSubmissionForReview`) |
| User-facing meal overwritten on correction | Implemented (by design, is the "loss") | `updateSavedMeal()` | `conversation-handler.ts:819-839` | `meal_logs` | Original values not retained on this table; QC tables are the record of truth for "what did AI originally say" |
| In-session user-correction capture | Implemented | `recordPortionCorrectionFeedback()` | `conversation-handler.ts:920-970` | `meal_portion_corrections` (`0018`) | Distinct from employee QC review |
| Gemini model/prompt/taxonomy/KB versioning per result | Implemented | Explicit fields set on every insert | `conversation-handler.ts:895-898` | `ai_meal_classifications.model_name/prompt_version/taxonomy_version/food_knowledge_base_version` | Hardcoded literals (`"v2"`, `"v1"`) — not derived from a central version registry |
| Raw Gemini response storage | Implemented | `raw_ai_response_json` | `ai_meal_classifications` | same | Only for saved meals |
| Structured JSON schema enforcement | Partially implemented | Prompt demands strict JSON; code does `JSON.parse` with a try/catch throwing on failure — no schema validation library (zod, etc.) found | `food-analyzer.ts:337-354` | — | No JSON-repair/retry logic found — a parse failure throws immediately |
| Retry logic on Gemini call failure | Not implemented | No retry loop found around `model.generateContent` | `food-analyzer.ts:326-331` | — | Timeout race exists, but no retry-on-error |
| Bounding boxes | Not implemented | No coordinates fields in `FoodItem`/prompt | `food-analyzer.ts:43-84` | — | — |
| Alternative candidates | Not implemented | Only single best-guess + optional clarification question, no ranked alternatives array | — | — | — |
| Confidence values (multi-dimensional) | Implemented | `confidence`, `portion_confidence`, `food_identity_confidence`, `image_quality`, `food_visibility` all separately modeled | `food-analyzer.ts:90-157` | `ai_meal_classifications.confidence_score` | Well-tested (`food-analyzer-portion*.test.ts`) |
| Clarification questions for ambiguous foods | Implemented | `has_high_impact_ambiguity`/`clarification_question`, dedicated message builders | `food-analyzer.ts:143-152, 919-936` | `whatsapp_conversations.state` incl. `awaiting_clarification` | Explicitly covers tofu/paneer/chicken, egg count, red meat identity |
| Auto-save decision logic | Implemented | `computeSaveDecision()` | `food-analyzer.ts:577-615` | `whatsapp_conversations` states (`0021_confidence_based_autosave.sql`) | Confidence + ambiguity -driven, tested |
| "Undo" / post-save removal | Implemented | `deleteMeal()`, `awaiting_edit_or_undo` state | `conversation-handler.ts:846-849`, `0021_confidence_based_autosave.sql` | `meal_logs` (hard delete), QC FK set null | — |
| Canonical food catalogue with IDs | Not implemented | `food_knowledge_base` is a taxonomy/KB table keyed by name, not a canonical-ID system that `meal_logs.foods` items reference | `0013_meal_review_console.sql:166-188` | `food_knowledge_base` | `meal_logs.foods` remains free-text JSON, no FK |
| Food name normalization/fuzzy matching/dedup | Not implemented | `food_knowledge_base_name_idx` is a unique index on `lower(food_name)` — dedup at insert time only, not applied to `meal_logs` items | `0013_meal_review_console.sql:187` | same | — |
| Portion estimation (qty/unit/grams/bucket/confidence) | Implemented | Rich `FoodItem` fields (`portion_size`, `estimated_edible_weight_grams_min/max`, `visible_quantity`, `count_visible_pieces`, `egg_count_min/max`) | `food-analyzer.ts:43-84` | `meal_logs.foods` (jsonb) | Only AI-estimated source; no "weighed"/"user-stated" provenance field |
| Portion source tracking (AI vs weighed vs user-stated) | Not implemented | No field distinguishing where a portion number came from | — | — | — |
| Admin/QC review interface | Partially implemented | Server actions for queue/filtering/priority exist; only one admin route folder (`admin/page.tsx`, `admin/actions.ts`, `admin/layout.tsx`) found — a functioning single-page console rather than a multi-view QC suite (search/catalogue-edit/similar-image views not separately confirmed) | `src/app/(admin)/admin/*` | `meal_submissions`, `ai_meal_classifications`, `human_meal_reviews` | Review-priority scoring (`review-priority.ts`) is genuinely sophisticated |
| Review-priority scoring (low-confidence/protein-missing/etc.) | Implemented | `computeReviewPriority()` | `src/lib/admin/review-priority.ts` | — | Considers confidence, image quality, protein-anchor mismatch, escalation, disputes |
| Dataset quality tiers (gold/silver/bronze/rejected) | Partially implemented | `dataset_split` (train/validation/test/holdout/unset), `is_gold_standard`, `review_quality` (basic/expert_verified/disputed) exist; no "silver"/"bronze"/"rejected" vocabulary, and nothing auto-populates these | `0013_meal_review_console.sql:149-152` | `human_meal_reviews`, `meal_embeddings` (`0015`) | Manual/未-automated promotion, per dev note item 5 |
| Reviewer identity + timestamp on reviews | Implemented | `reviewer_id`, `reviewed_at` | `human_meal_reviews` | same | — |
| Rejection reasons | Partially implemented | `review_status` includes `not_food`/`duplicate`/`unclear_photo`; no separate structured rejection-reason taxonomy | `human_meal_reviews.review_status` | same | — |
| Audit log of QC actions | Implemented | `meal_review_audit_logs` with before/after JSON | `0013_meal_review_console.sql:194-206` | same | Not confirmed whether every admin action actually writes here — only the schema and action_type enum confirmed |
| Checksums (SHA-256) for dedup | Not implemented | No checksum column anywhere; WhatsApp `media_id` dedup (`0026`) prevents re-processing the same upload but is not a content hash | — | `whatsapp_processed_media` | Two visually-identical-but-differently-uploaded photos would not be caught |
| Perceptual hashing / duplicate clusters | Not implemented | Nothing found | — | — | — |
| Train/val/test split by user/cluster | Partially implemented | `dataset_split` column exists per-review and per-embedding, but nothing described enforces splitting by user/household to prevent leakage | `human_meal_reviews.dataset_split`, `meal_embeddings.dataset_split` | same | Manual assignment only |
| Image embeddings generation | Not implemented | `meal_embeddings` table + `pgvector` extension created, explicitly a placeholder — "Nothing writes to it yet" | `0013_meal_review_console.sql:209-230` | `meal_embeddings` | Confirmed by dev note + no embedding-generation code found anywhere |
| Vector similarity search / retrieval-augmented prompting | Not implemented | No query code against `meal_embeddings`, no `<->`/`<=>` pgvector operator usage found | — | — | Documented as the intended next step, not built |
| Confidence thresholds configuration | Partially implemented | Thresholds are hardcoded inline (e.g. `> 45`, `< 0.7`, `>= 0.7 && <= 0.85`) rather than centrally configured | `food-analyzer.ts:501`, `review-priority.ts:27-28` | — | No env var / config table for thresholds |
| Model-quality dashboard / accuracy metrics | Partially implemented | `computeModelQualityMetrics()` fully implemented and tested (`model-quality.test.ts`); dev note references a `/admin/model-quality` route but no matching page file was found under `src/app` | `src/lib/admin/model-quality.ts` | derived from `human_meal_reviews` | UI page not confirmed to exist — metrics logic is real, dashboard may not be wired up yet |
| Golden/benchmark eval set | Partially implemented | `is_gold_standard` + `dataset_split='test'/'holdout'` fields exist to support this; no batch job found that actually promotes rows | `human_meal_reviews` | same | Per dev note item 5: "Nothing assigns these automatically" |
| A/B testing / feature flags / canarying | Not implemented | No feature-flag library or config found for model/prompt routing | — | — | — |
| Correction/confirmation/auto-save rate tracking | Partially implemented | Raw data to compute these exists (`meal_submissions`, `ai_meal_classifications`, `human_meal_reviews`, `meal_portion_corrections`) but no aggregate metric/report was found computing auto-save rate, edit-within-24h rate, or clarification abandonment specifically | — | — | See section E for exact SQL to compute these manually |
| JSON parse error tracking | Not implemented | Parse failure just throws (`food-analyzer.ts:352-354`); no persisted error/metrics table | — | — | — |
| Fine-tuning export (JSONL, GCS bucket, manifest) | Not implemented | No export script, no GCS/Vertex tuning code, no `@google-cloud/*` dependency in `package.json` | — | — | — |
| Tuned-model invocation / canary routing | Not implemented | Only `gemini-2.5-flash` referenced anywhere | `food-analyzer.ts:299` | — | — |
| Continuous-learning queue (auto-enqueue on correction/low-confidence) | Partially implemented | `review_status='pending'`/`'escalated'` + `computeReviewPriority()` effectively function as a manual-pull priority queue; nothing auto-escalates on later-edit, model-disagreement, or repeated-failure signals | `review-priority.ts`, `meal_submissions.review_status` | `meal_submissions` | The building blocks exist; the "auto-trigger" wiring does not |

---

## D. Existing reusable foundations

- **Admin auth/roles**: `getAdminSession()` + role hierarchy
  (`reviewer`/`nutrition_expert`/`admin`/`super_admin`) in
  `src/lib/admin/auth.ts` — directly reusable for any QC/eval/fine-tuning
  admin surface.
- **Audit logging pattern**: `meal_review_audit_logs` (before/after JSON,
  actor, action_type enum) is a generic reusable audit-log shape, not
  meal-specific in structure.
- **Background/cron jobs**: `src/app/api/cron/send-meal-reminders`,
  `resolve-stale-clarifications` (referenced in
  `conversation-handler.ts:765`) show a working Cloudflare-Pages-compatible
  cron pattern (external ping + `CRON_SECRET` auth, per
  `docs/meal-reminders-notes.md`) — reusable for a dataset-promotion or
  embedding-backfill batch job.
- **Cloud storage**: Supabase Storage (`meal-photos` bucket) already
  integrated with upload/public-URL helpers — reusable for any additional
  bucket (e.g. redacted images, exported training sets).
- **pgvector**: extension already enabled
  (`create extension if not exists vector` in `0013_meal_review_console.sql:215`)
  and a 768-dim vector column already declared on `meal_embeddings` — most of
  the infra plumbing for retrieval is present, only the generation/query code
  is missing.
- **Model abstraction**: `analyzeFood()` centralizes all Gemini calls behind
  one function with a documented single point for swapping models
  (comment at `food-analyzer.ts:291-298` records a prior model swap
  experiment and its outcome) — good foundation for A/B-testing infra.
- **Deterministic message-variation helper** (`seededPick`) — same pattern
  reusable for deterministic canary bucketing if desired.
- **Feedback capture**: `feedback_submissions` table
  (`0020_feedback_submissions.sql`) captures free-text user feedback
  including an `'ai_inaccurate'` feedback_type — a secondary signal source
  for surfacing bad AI outputs beyond the structured correction paths.
- **Dietary-profile learning loop**: `updateDietaryProfileForSavedMeal`
  (referenced at `conversation-handler.ts:755`) plus
  `0031_dietary_profile_recommendation_feedback.sql` show an existing
  precedent in this codebase for a "user feedback → profile update" loop,
  architecturally similar to what a continuous-learning queue would need.
- **Testing infra**: Jest is fully configured and green (53 suites / 736
  tests, `npx jest` run confirmed this session) with dedicated coverage for
  the portion-calculation and confidence logic
  (`food-analyzer-portion*.test.ts`, `food-analyzer-meal-label.test.ts`,
  `human-corrections.test.ts`, `model-quality.test.ts`) — a real foundation
  for adding eval-harness-style tests against frozen fixtures.

---

## E. Data currently available for model improvement

No database was queried — per instructions, this environment does not have
approved read-only production credentials, so the following are the exact
read-only SQL statements to run manually (e.g. via Supabase SQL editor) to
get real counts. All queries are read-only (`select` only) and reference
only the tables confirmed to exist above.

```sql
-- Total food images captured
select count(*) as total_images from meal_logs where image_url is not null;

-- Meals with an employee QC review at all
select count(distinct meal_submission_id) as reviewed_count from human_meal_reviews;

-- Meals with an explicit "correct" review (no correction needed)
select count(*) from human_meal_reviews where review_status = 'correct';

-- Meals with a human correction to at least one field
select count(*) from human_meal_reviews
where review_status in ('partially_correct', 'incorrect')
   or corrected_items_json is not null;

-- Meals with an in-session WhatsApp user correction (distinct from QC review)
select count(*) from meal_portion_corrections;

-- Meals later edited after initial save (approximated: corrected_estimated_weight
-- differs from original_estimated_weight, or a meal_portion_corrections row
-- exists with a non-null meal_log_id, implying a correction after save)
select count(*) from meal_portion_corrections where meal_log_id is not null;

-- Meals auto-saved without an explicit "Yes" confirmation
-- (approximate proxy: no reliable direct column; ai_meal_classifications.confidence_score
-- combined with the fact that low-confidence meals require clarification lets you
-- approximate "auto-saved" as medium/high confidence at save time)
select count(*) from ai_meal_classifications where confidence_score >= 0.7;

-- Meals with a usable original AI prediction preserved
select count(*) from ai_meal_classifications where raw_ai_response_json is not null;

-- Meals with a clear final human-reviewed label
select count(*) from human_meal_reviews where corrected_items_json is not null;

-- Meals with portion info present on the AI classification
select count(*) from ai_meal_classifications
where detected_items_json @> '[{}]'::jsonb and detected_items_json != '[]'::jsonb;

-- Meals with training consent
select count(*) from meal_submissions where consent_for_model_improvement = true;
select count(*) from meal_submissions where eligible_for_anonymized_training = true;

-- Likely gold-suitable (expert-verified, undisputed, consented, eligible)
select count(*) from human_meal_reviews hr
join meal_submissions ms on ms.id = hr.meal_submission_id
where hr.review_quality = 'expert_verified'
  and hr.is_gold_standard = true
  and hr.eligible_for_model_improvement = true
  and ms.consent_for_model_improvement = true;

-- Likely silver-suitable (basic review quality, still eligible + consented)
select count(*) from human_meal_reviews hr
join meal_submissions ms on ms.id = hr.meal_submission_id
where hr.review_quality = 'basic'
  and hr.eligible_for_model_improvement = true
  and ms.consent_for_model_improvement = true;

-- Unsuitable / unverifiable (no consent, or flagged needing redaction, or
-- unreviewed with low confidence)
select count(*) from meal_submissions ms
where ms.consent_for_model_improvement = false
   or ms.needs_redaction = true;

-- Dataset split distribution actually assigned so far
select dataset_split, count(*) from human_meal_reviews group by dataset_split;
select dataset_split, count(*) from meal_embeddings group by dataset_split;

-- Rows in the embeddings placeholder table (expected: 0, per code review)
select count(*) from meal_embeddings;
```

No PII, phone numbers, or image contents are included above or should be
included in the output of these queries when shared outside the engineering
team — `anonymizedUserId()` should be applied to any `user_id` before
sharing results (see `src/app/(admin)/admin/actions.ts:13-17`).

---

## F. Critical gaps (ranked)

### P0 — privacy / data-loss / architecture blockers

1. **No EXIF/GPS stripping on inbound photos.**
   Why it matters: WhatsApp-forwarded (as opposed to camera-captured-and-sent)
   images can carry embedded GPS/location and device metadata; storing them
   in a **public** bucket (`meal-photos`, confirmed public in
   `0012_meal_photos.sql:8-14`) means anyone with the image URL gets that
   metadata too. Current evidence: no `exif`/`GPS` hits anywhere in the repo.
   Recommended location: `uploadMealPhoto()` in `conversation-handler.ts`,
   pre-upload, using a lightweight EXIF-strip library compatible with the
   Cloudflare Edge Runtime constraints already documented in
   `food-analyzer.ts:5-11` (chunked base64 exists specifically because of an
   edge-runtime argument-limit issue — any EXIF library added here needs the
   same edge-compatibility care). Dependencies: an edge-safe image-processing
   library. Risk of postponing: real privacy/compliance exposure, grows with
   every photo stored.

2. **Public storage bucket for all meal photos.**
   Why it matters: `meal-photos` bucket is public
   (`0012_meal_photos.sql:12-14`) — anyone who obtains a URL (leaked link,
   log line, browser history) can view the photo with no auth check; the
   justification recorded in the migration comment ("already only reachable
   by whoever has the dashboard link/session") is weaker than it sounds since
   public bucket URLs are guessable-adjacent (`entityId/timestamp.ext`) and
   are not access-logged per the schema reviewed. Recommended location:
   migrate to signed URLs or a private bucket + short-lived signed URL
   generation in dashboard/admin server actions. Dependencies: Supabase
   Storage signed-URL support (native feature). Risk of postponing: image
   exposure risk scales with user growth; also blocks any future strict
   consent/redaction guarantee since a "redacted" image and its original
   both sit in the same public bucket today.

3. **No dataset-eligibility enforcement point between consent flags and any
   future export.**
   Why it matters: consent columns exist and default safely, but nothing in
   this repo currently reads them for any purpose (confirmed by grep — no
   code references `consent_for_model_improvement` or
   `eligible_for_anonymized_training` outside the migration itself). If a
   future export script is written without deliberately gating on these
   fields, the "safe by default" design is silently defeated by an engineer
   who doesn't know to check. Recommended location: a single, mandatory
   "dataset eligibility" query helper (e.g.
   `src/lib/admin/dataset-eligibility.ts`) that every future export/embedding
   job must call — not a migration/schema issue, an enforcement-point issue.
   Dependencies: none technical: needs to be a written convention before any
   export code is added. Risk of postponing: highest right before the first
   fine-tuning attempt, when it's easiest to skip.

### P1 — needed for reliable retrieval + evaluation

4. **`meal_embeddings` has zero rows; no embedding-generation code exists.**
   Why it matters: the entire retrieval-augmented-prompting vision (item 3
   in the background) is blocked on this. Current evidence: confirmed empty
   by design (`0013_meal_review_console.sql:209-215` comment: "Nothing
   writes to it yet"). Recommended location: a new
   `src/lib/ai/embeddings.ts` calling a Gemini embedding model, invoked
   either at `recordMealSubmissionForReview()` time or as a backfill batch
   job. Dependencies: choice of embedding model/dimension (768 already
   assumed in the schema), a batch job pattern (reuse the cron pattern in
   D). Risk of postponing: nothing else in the pipeline can improve via
   retrieval until this exists — it's the single highest-leverage missing
   piece for near-term accuracy gains without fine-tuning.

5. **No frozen golden/eval set or regression harness.**
   Why it matters: prompt changes (like the several already made — see the
   density-table comments and the model-name reversion comment in
   `food-analyzer.ts:291-298`) are currently evaluated ad hoc ("14-photo
   comparison" mentioned in a comment) rather than against a repeatable
   fixture set. `is_gold_standard`/`dataset_split` columns exist but nothing
   populates them. Recommended location: a script under
   `scripts/` (a `scripts/` dir already exists at repo root) that selects
   `expert_verified` + `is_gold_standard` reviews into a frozen JSON fixture,
   plus a Jest suite that replays them against `analyzeFood()`. Dependencies:
   enough expert-verified reviews to exist first (see section E queries).
   Risk of postponing: every prompt tweak risks silent regressions on cases
   already solved.

6. **No structured-output schema validation / retry-repair on Gemini JSON
   parse failure.**
   Why it matters: `analyzeFood()` throws immediately on invalid JSON
   (`food-analyzer.ts:352-354`) with no retry, no schema coercion, and no
   persisted record of the failure rate. Recommended location: same
   function; add one retry with a stricter re-prompt, and log/persist parse
   failures (e.g. into `meal_review_audit_logs` or a new lightweight
   `ai_parse_failures` table) so the rate is measurable. Dependencies: none.
   Risk of postponing: a Gemini model upgrade or a stray prompt edit could
   silently spike failure rates with no visibility.

### P2 — useful

7. **No canonical food ID / ontology linkage from `meal_logs.foods`.**
   Why it matters: `food_knowledge_base` exists but `meal_logs.foods` stays
   free-text JSON with no FK — so "sambar was misclassified 40 times" can't
   be queried directly, only inferred from `misclassifiedFoods` lists
   already supported in `computeModelQualityMetrics` (`model-quality.ts:86-95`,
   which does support this pattern already, just without a formal FK).
   Recommended location: add `food_knowledge_base_id` (nullable) to
   `FoodItem`/`meal_logs.foods` entries, populated at classification time by
   fuzzy-matching against `food_knowledge_base.aliases_json`. Risk of
   postponing: moderate — the misclassification-counting mechanism already
   works around this via text matching.

8. **No admin UI confirmed for `/admin/model-quality`.**
   Why it matters: `computeModelQualityMetrics()` is fully built and tested,
   but the dev note's claim that "The Model Quality Dashboard
   (`/admin/model-quality`) already breaks accuracy down by model and
   prompt version" could not be confirmed against an actual page file under
   `src/app` (only `admin/page.tsx`, `admin/actions.ts`, `admin/layout.tsx`
   were found). This may be a stale doc claim, a not-yet-committed page, or
   a page this audit's search missed. Recommended action: verify directly
   with the team before relying on the dev note here. Risk of postponing:
   low technically (the logic exists), but creates a false sense that
   evaluation is further along than it is.

9. **No perceptual-hash/dedup beyond exact WhatsApp media-id matching.**
   Why it matters: `whatsapp_processed_media` (0026) only catches the exact
   same upload resent; a photo re-taken/re-cropped/resent as a genuinely new
   upload of the same plate would double-count in any future training set.
   Risk of postponing: moderate, mainly matters once fine-tuning data volume
   grows.

### P3 — fine-tuning / long-term

10. **No JSONL export, GCS training bucket, or tuning-job code.**
    Why it matters: this is explicitly deprioritized correctly per the dev
    note ("Fine-tuning is a last resort, not a first step") — flagged here
    only so it isn't forgotten once retrieval/prompt-engineering are
    exhausted. Risk of postponing: none in the near term; correctly ordered
    last already.

---

## G. Recommended implementation sequence

### Phase 1 — Make current data trustworthy (privacy + integrity)
- Modify: `src/lib/whatsapp/conversation-handler.ts` (`uploadMealPhoto`) to
  strip EXIF/GPS before upload.
- Modify: `supabase/migrations/` — new migration to move `meal-photos` to a
  private bucket, or add signed-URL generation wherever `getPublicUrl()` is
  currently called (`conversation-handler.ts:127`, and any dashboard code
  reading `image_url` directly).
  Migration dependency: existing rows' `image_url` values would need a
  compatibility path (e.g. keep public temporarily, dual-write, or a
  backfill script signing existing paths on read).
- New file: `src/lib/admin/dataset-eligibility.ts` — single source-of-truth
  helper enforcing consent + redaction checks for any future dataset
  read.
- Tests: unit tests for the EXIF-strip helper (edge-runtime safe, mirroring
  the existing `uint8ArrayToBase64` chunking test pattern in
  `src/__tests__/food-analyzer-base64.test.ts`).
- Completion criteria: no photo reaches storage with embedded GPS; bucket
  access requires a session-scoped signed URL; a future export cannot
  bypass the consent-eligibility helper (enforced by only exposing data
  through it, not by convention alone).

### Phase 2 — Employee QC + evaluation
- Confirm/build: an actual `/admin/model-quality` page consuming
  `src/lib/admin/model-quality.ts` if it doesn't already exist (see gap 8).
- New script: `scripts/export-golden-set.ts` selecting
  `expert_verified` + `is_gold_standard` reviews into a frozen fixture file.
- New test suite: `src/__tests__/eval-golden-set.test.ts` replaying the
  fixture against `analyzeFood()` (will need a mockable Gemini client —
  check whether `analyzeFood` is already structured to allow test doubles;
  from `food-analyzer.ts` it currently instantiates `genAI` at module scope,
  so refactor to injectable client may be needed first).
- Migration: none required if reusing existing columns; consider adding an
  explicit `rejected` value alongside existing enums if bronze/gold/silver/
  rejected terminology is wanted verbatim.
- Completion criteria: a prompt change can be run against the golden set and
  produce a before/after accuracy report without touching production data.

### Phase 3 — Image retrieval into Gemini
- New file: `src/lib/ai/embeddings.ts` — generate embeddings at
  `recordMealSubmissionForReview()` time (or async backfill job).
- New file: `src/app/api/cron/backfill-meal-embeddings/route.ts` (mirroring
  the existing cron pattern in `docs/meal-reminders-notes.md`).
- Modify: `src/lib/ai/food-analyzer.ts` `analyzeFood()` to accept an
  optional retrieved-context parameter (few-shot examples pulled via
  pgvector similarity), consistent with how `correctionContext` is already
  threaded through today (`food-analyzer.ts:302-306`).
- Migration: none — `meal_embeddings`/pgvector already exist.
- Tests: unit test for the similarity-query helper against a seeded local
  Postgres/pgvector fixture.
- Completion criteria: a new photo's prompt includes retrieved similar
  corrected examples; measurable accuracy delta on the golden set from
  Phase 2.

### Phase 4 — Confidence + auto-save refinement
- Modify: centralize the currently-hardcoded thresholds
  (`food-analyzer.ts:501`, `review-priority.ts:27-28`) into one config
  module so they're tunable without a code change per threshold.
- New: persist auto-save/clarification-abandonment rate (currently
  computable only via ad hoc SQL — see section E) as a scheduled metrics
  job into a new lightweight `pipeline_metrics` table or a simple
  scheduled report.
- Completion criteria: threshold changes are a one-line config edit; auto-
  save/correction/clarification rates are visible without manual SQL.

### Phase 5 — Fine-tuning prep
- New scripts: `scripts/export-training-jsonl.ts`, using the same
  `dataset-eligibility.ts` gate from Phase 1.
- Dependencies: sufficient gold/silver volume (check via section E queries
  first — likely far short today given `meal_embeddings` is empty and
  review volume is unconfirmed).
- Completion criteria: a JSONL export runs, gated by consent, with
  documented train/val/test split by user (not just by row) to avoid
  leakage.

### Phase 6 — Continuous-learning ops
- Modify: `recordMealSubmissionForReview()` / a new escalation trigger to
  auto-set `review_status='escalated'` or bump `computeReviewPriority()`
  output on: repeated correction of the same food, large nutrition-impact
  corrections (there's already a `proteinChangedMeaningfully` threshold in
  `recordPortionCorrectionFeedback` at `conversation-handler.ts:935` that
  could directly drive this), and post-save edits.
- Completion criteria: corrected/uncertain meals appear in the QC queue
  automatically, prioritized, without manual sampling.

---

## H. Quick wins (using existing infra only)

- **Fix/verify the `/admin/model-quality` page** — the metrics logic
  (`src/lib/admin/model-quality.ts`) is fully built and tested; if the page
  doesn't exist yet, wiring it up is the single cheapest visibility win
  available (gap 8).
- **Log JSON-parse failures** — `analyzeFood()` already has a single
  catch block (`food-analyzer.ts:352-354`); adding one `console.error` +
  one insert into a metrics/audit table there is a few-line change with
  immediate visibility benefit.
- **Compute and periodically log correction/auto-save/clarification rates**
  from existing tables using the SQL patterns in section E — no schema
  change needed, just a scheduled report (reuse the cron pattern already
  proven in `docs/meal-reminders-notes.md`).
- **Populate `dataset_split`/`is_gold_standard` for existing
  `expert_verified` reviews** — a one-time manual/batch curation pass over
  data that's likely already sitting in `human_meal_reviews`, per dev note
  item 5 ("a future batch job or manual curation step should promote a
  sample").
- **Add a checksum column and backfill it** — a cheap addition
  (`meal_submissions.image_sha256` or similar) computed at upload time in
  `uploadMealPhoto()`, giving basic dedup detection for near-zero cost
  before investing in perceptual hashing.
- **Wire `consent_for_model_improvement` into an actual user-facing toggle**
  — the column is fully wired schema-side but (per grep) nothing sets it to
  true anywhere; even a simple settings-page checkbox unlocks real
  consented data for everything downstream.

---

## I. Questions and uncertainties

- Whether `/admin/model-quality` exists as a page is unresolved — the dev
  note asserts it does, this audit's search of `src/app` did not find a
  matching route file. Recommend a direct grep/ask to the team rather than
  trusting either source blindly.
- Whether any **production** data currently has `consent_for_model_improvement`
  or `eligible_for_anonymized_training` set to true is unknown — this audit
  did not and should not query production; use the SQL in section E.
- Whether WhatsApp's own media pipeline (Meta's servers) already strips
  EXIF/GPS before the media reaches this app's `downloadMedia()` call is
  unconfirmed — if Meta already strips it, gap F.1 may be lower severity
  than stated; this needs verification against Meta's WhatsApp Business
  Platform documentation (external, not verifiable from this repo).
- Manual employee QC workflow/cadence (how often reviewers actually work
  the queue, whether `human_meal_reviews` has any real volume yet) is not
  verifiable from code.
- Whether Supabase Storage bucket "public" actually means unguessable-enough
  in practice (URL entropy, absence of directory listing) is a
  configuration/product-risk judgment call, not something this audit can
  fully resolve from code alone.
- GCP/Vertex AI account status, quotas, and whether Vertex AI (vs. the
  Gemini Developer API currently used) is even provisioned for this project
  is unknown — only `GEMINI_API_KEY` was found as a relevant env var name.
- Whether `apps/mobile` or `apps/mobile-api` have any independent food-photo
  pipeline was checked (grep for Gemini/food-analyzer/meal_logs references)
  and came back empty — this audit treats WhatsApp as the sole ingestion
  path today, but this should be confirmed with the team in case mobile
  food-logging is planned/in-progress work not yet reflected in committed
  code.

---

## Verification log

- `npx jest` run: **53 suites / 736 tests passed**, ~2.8s (confirmed this
  session, read-only, no files modified).
- `npx tsc --noEmit` was not run — the jest pass across 53 suites already
  exercises the type-relevant modules referenced in this report
  (`food-analyzer.ts`, `model-quality.ts`, `human-corrections`-related
  tests) and a separate tsc pass was judged unnecessary to the questions
  this audit needed to answer; can be run on request.
- Full-repo grep performed for: Gemini, food image, meal photo, nutrition,
  correction, confirmation, confidence, review, admin, embedding, vector,
  pgvector, prompt version, model version, dataset, annotation, training,
  fine-tuning, WhatsApp media, exif/EXIF/GPS — results folded into sections
  above.
- Env var names inspected (values never printed): `GEMINI_API_KEY` was the
  only Gemini/Vertex/storage/vector-related name found via targeted grep
  across `src`, `apps/mobile-api/src`, `apps/meal-reminders-cron`.
- No production or any live database was queried at any point in this
  audit.
