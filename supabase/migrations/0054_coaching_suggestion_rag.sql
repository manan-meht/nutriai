-- Retrieval corpus for coaching suggestions.
--
-- Today the coaching line is produced by a deterministic if/else in
-- packages/dashboard-core/src/food-classification.ts with exactly six
-- possible outputs, and the reviewer's rewrites of it were being stored and
-- then dropped — fetch-human-corrections loads corrected_suggestion and
-- applyHumanCorrection merges it, but the only consumers map the result
-- into FoodBalanceMealInput, which has no suggestion field at all. 37
-- rewritten suggestions had gone nowhere.
--
-- This table is the corpus those rewrites feed, retrieved by embedding
-- similarity and used as few-shot context for generated copy.
--
-- Deliberately a separate table rather than querying human_meal_reviews
-- directly: a review is a record of one meal at one moment, while a corpus
-- entry is reusable coaching copy with its own approval and archival
-- lifecycle. Keeping them apart means re-editing a review doesn't silently
-- mutate what gets served to other users, and an entry can be retired
-- without touching review history.

create extension if not exists vector;

create table coaching_suggestions (
  id uuid primary key default gen_random_uuid(),

  suggestion_text text not null,
  /** The review this copy came from — nullable so an entry outlives its
   * source review, and so entries can be authored directly later. */
  source_review_id uuid references human_meal_reviews(id) on delete set null,

  -- The meal's shape when this copy was written. Not used for the vector
  -- search itself, but kept for filtering, for explaining why something was
  -- retrieved, and as a fallback lookup key if the embedding path is ever
  -- unavailable.
  protein_anchor_status text,
  vegetable_fiber_status text,
  carb_status text,
  meal_balance_status text,
  treat_food_present boolean,

  -- 768 rather than gemini-embedding-001's 3072 default: pgvector cannot
  -- index beyond 2000 dimensions, and 768 also measured meaningfully faster
  -- to generate (547ms vs 938ms). At a corpus of tens-to-hundreds of short
  -- coaching lines, 768 is ample.
  embedding vector(768),
  embedding_model text,
  embedded_at timestamptz,

  -- Nothing is retrievable until explicitly approved. Seeded below for the
  -- 37 existing rewrites; set by the review form's approve step thereafter.
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Retrieval only ever considers approved, unarchived, embedded rows, so the
-- index covers exactly that set.
create index coaching_suggestions_live_idx
  on coaching_suggestions (approved_at)
  where approved_at is not null and archived_at is null and embedding is not null;

-- hnsw over cosine distance — the corpus is small and read-heavy, and hnsw
-- needs no training step or list tuning the way ivfflat does.
create index coaching_suggestions_embedding_idx
  on coaching_suggestions using hnsw (embedding vector_cosine_ops);

-- Similarity search. Exposed as a function because PostgREST cannot express
-- a vector distance ordering directly; the app calls this via rpc().
-- SECURITY INVOKER (the default) — callers already use the service-role
-- client, and this must not become a way to read the corpus without it.
create or replace function match_coaching_suggestions(
  query_embedding vector(768),
  match_count int default 5,
  min_similarity float default 0.0
)
returns table (
  id uuid,
  suggestion_text text,
  meal_balance_status text,
  protein_anchor_status text,
  vegetable_fiber_status text,
  similarity float
)
language sql
stable
as $$
  select
    cs.id,
    cs.suggestion_text,
    cs.meal_balance_status,
    cs.protein_anchor_status,
    cs.vegetable_fiber_status,
    1 - (cs.embedding <=> query_embedding) as similarity
  from coaching_suggestions cs
  where cs.approved_at is not null
    and cs.archived_at is null
    and cs.embedding is not null
    and 1 - (cs.embedding <=> query_embedding) >= min_similarity
  order by cs.embedding <=> query_embedding
  limit match_count;
$$;

-- Where a generated suggestion is stored once produced. Non-blocking on the
-- WhatsApp path (the reply is sent first, this is written afterwards), so it
-- lives on the meal log rather than being returned inline.
alter table meal_logs
  add column if not exists coaching_suggestion text,
  add column if not exists coaching_suggestion_source text
    check (coaching_suggestion_source in ('rules', 'retrieved', 'generated'));

-- Seed the corpus from the reviewer's existing rewrites: every review whose
-- corrected_suggestion actually differs from the rule-engine text it was
-- shown, on a verdict that says something about the food (an "unclear image"
-- review's copy says nothing reusable). Marks the source reviews approved
-- too, so the audit trail records that this seeding happened rather than
-- leaving them looking un-reviewed.
insert into coaching_suggestions (
  suggestion_text, source_review_id,
  protein_anchor_status, vegetable_fiber_status, carb_status, meal_balance_status,
  treat_food_present, approved_at, approved_by
)
select
  trim(hmr.corrected_suggestion),
  hmr.id,
  coalesce(hmr.corrected_protein_anchor_status, amc.protein_anchor_status),
  coalesce(hmr.corrected_vegetable_fiber_status, amc.vegetable_fiber_status),
  coalesce(hmr.corrected_carb_status, amc.carb_status),
  coalesce(hmr.corrected_meal_balance_status, amc.meal_balance_status),
  coalesce(hmr.corrected_enjoyment_food_present, amc.enjoyment_food_present),
  now(),
  hmr.reviewer_id
from human_meal_reviews hmr
left join ai_meal_classifications amc on amc.id = hmr.ai_classification_id
where hmr.corrected_suggestion is not null
  and trim(hmr.corrected_suggestion) <> ''
  and trim(hmr.corrected_suggestion) is distinct from trim(coalesce(amc.suggested_next_step, ''))
  and hmr.review_status in ('correct', 'partially_correct', 'incorrect');

update human_meal_reviews
  set suggestion_approved = true
  where id in (select source_review_id from coaching_suggestions where source_review_id is not null);

-- Embeddings are backfilled out-of-band by
-- scripts/backfill-suggestion-embeddings.ts (an HTTP call per row, which
-- has no place in a migration). Until that runs, every row has a null
-- embedding and is therefore invisible to match_coaching_suggestions —
-- retrieval simply finds nothing and callers fall back to the rule engine.

-- Internal corpus containing reviewer-authored copy — same access posture
-- as every other review table (see migration 0013): RLS enabled with no
-- policies, so anon/authenticated keys get nothing and only the
-- service-role client (which bypasses RLS) can read or write it.
alter table coaching_suggestions enable row level security;
