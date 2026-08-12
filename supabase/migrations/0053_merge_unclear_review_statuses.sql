-- 0052 added 'unclear_image' alongside the pre-existing 'unclear_photo'
-- rather than renaming it, to avoid rewriting the 16 reviews already
-- carrying the old value. In practice that left two options in the verdict
-- list meaning the same thing, which is exactly the kind of ambiguity that
-- makes a taxonomy get applied inconsistently — the same reason
-- 'enjoyment_food' was renamed in that migration.
--
-- Collapses them into 'unclear_image'. The old rows are rewritten rather
-- than kept, so historical reviews stay comparable with new ones: a
-- split-in-two verdict silently undercounts in any grouping, and it had
-- already done so — model-quality.ts's pctUnclearOrNotFood only matched
-- 'unclear_photo', so every 'unclear_image' review was missing from that
-- figure.
--
-- 'no_photo' stays separate. It is a genuinely different situation (no
-- image was submitted at all, versus one that can't be read) and only that
-- distinction tells you whether to chase the photo or the photographer.

update human_meal_reviews
  set review_status = 'unclear_image'
  where review_status = 'unclear_photo';

alter table human_meal_reviews
  drop constraint if exists human_meal_reviews_review_status_check;

alter table human_meal_reviews
  add constraint human_meal_reviews_review_status_check
  check (review_status in (
    'correct', 'partially_correct', 'incorrect',
    'unclear_image', 'no_photo',
    'not_food', 'duplicate', 'escalated'
  ));
