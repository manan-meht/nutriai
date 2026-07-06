# Meal Review Console — developer notes

Internal QC tool at `/admin/meal-review` (see `src/app/(admin)/admin`). This
note explains how the data it collects is meant to improve Gemini-based meal
classification over time — none of the pipeline below is built yet except
where noted; the schema and review workflow are just structured so it can be.

## How reviewed data becomes better recommendations

1. **Corrected reviews become ground truth.** When a reviewer marks a meal
   `correct`/`partially_correct`/`incorrect` and edits fields, those
   corrected fields — not the original AI output — are what
   `src/lib/nutrition/human-corrections.ts` feeds back into the user-facing
   dashboards, and what `src/lib/admin/model-quality.ts` measures AI
   accuracy against. The original AI classification is never overwritten;
   both live side by side (`ai_meal_classifications` vs
   `human_meal_reviews`), so we can always ask "was the AI right?" later
   even after a correction is applied.

2. **The food knowledge base improves prompt context.** `food_knowledge_base`
   is Tistra's own taxonomy of Indian foods (protein/fiber relevance, common
   pairings, common misclassifications, a coaching-safe suggestion). The
   natural next step (not yet built) is to inject relevant entries into the
   Gemini prompt in `src/lib/ai/food-analyzer.ts` for foods that keep
   getting misclassified — e.g. if "sambar" is repeatedly logged as a
   vegetable rather than a protein-relevant lentil dish, the KB entry can
   correct that at prompt time rather than relying on review-time fixes
   forever.

3. **Embeddings will support similar-meal retrieval.** `meal_embeddings` is
   a placeholder table (image / caption / combined / corrected-label-text
   embeddings, versioned by model). Nothing writes to it yet. Once populated,
   the intended flow is: new photo → embed → pgvector similarity search
   against previously-reviewed meals → pull their corrected classifications
   and any matching food-knowledge entries into the prompt as few-shot
   context before calling Gemini.

4. **Model/prompt versions allow evaluation.** Every `ai_meal_classifications`
   row stores `model_name`, `model_version`, `prompt_version`,
   `taxonomy_version`, and `food_knowledge_base_version`. The Model Quality
   Dashboard (`/admin/model-quality`) already breaks accuracy down by model
   and prompt version — so a prompt change can be evaluated by comparing
   accuracy on reviewed meals before/after, without needing a separate
   experimentation system yet.

5. **Expert-reviewed meals can become benchmark/test data.** Each
   `human_meal_reviews` row has `dataset_split` (train/validation/test/
   holdout/unset), `is_gold_standard`, and `review_quality`
   (basic/expert_verified/disputed). Nothing assigns these automatically —
   a future batch job or manual curation step should promote a sample of
   `nutrition_expert`-reviewed, undisputed meals into a `test`/`holdout`
   split to serve as a standing benchmark for prompt/model changes.

6. **Fine-tuning is a last resort, not a first step.** Only worth
   considering once there's a meaningfully large set of
   `expert_verified`, `eligible_for_model_improvement = true` meals with
   consent (`consent_for_model_improvement` /
   `eligible_for_anonymized_training` on `meal_submissions`). Prompt
   engineering + retrieval (steps 2–3 above) are cheaper, faster to
   iterate, and don't require retraining — they should be exhausted first.

## Privacy guardrails baked into the schema

- `meal_submissions.consent_for_model_improvement` and
  `eligible_for_anonymized_training` default to `false` — a meal is never
  usable for model improvement by default, only by explicit flag.
- `contains_face_or_person`, `contains_sensitive_background`,
  `needs_redaction`, `redacted_image_url` exist so a future redaction step
  can be enforced before any image leaves the reviewed set for training use.
- The review console itself never shows a user's name, phone number,
  payment details, or family relationship — only an anonymized `User #NNNN`
  derived deterministically from the internal user id (see
  `anonymizedUserId` in `src/app/(admin)/admin/actions.ts`).
