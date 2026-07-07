-- Extends the meal_embeddings placeholder (0013) with the same
-- dataset-readiness fields already on human_meal_reviews, so that once
-- embeddings actually start being generated, each embedding row can be
-- independently marked for training/eval use without having to join back
-- through human_meal_reviews to know whether it's usable — e.g. a caption
-- embedding might be gold-standard-eligible even if a later corrected
-- review of the same meal changes review_quality on the review row itself.
alter table meal_embeddings
  add column dataset_split text not null default 'unset' check (dataset_split in ('train', 'validation', 'test', 'holdout', 'unset')),
  add column is_gold_standard boolean not null default false,
  add column eligible_for_model_improvement boolean not null default false;
