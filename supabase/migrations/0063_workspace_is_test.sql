-- Marks a workspace as the team's own, so admin metrics can exclude it.
--
-- The club side already does this with coach_profiles.is_demo, after the
-- dashboard reported S$140 of Stripe test-mode money as revenue. The Tistra
-- Health side had no equivalent, so the owner's own throwaway accounts were
-- counted as customers — which is what made "total users" read 61 when the
-- real figure was 55.
--
-- A column rather than an email pattern in the query, deliberately. Matching
-- on something like '%manan%' would silently reclassify a genuine customer
-- who happens to share a name, and the mistake would be invisible: the count
-- just quietly drops. A flag has to be set on purpose, per row.

alter table workspaces
  add column if not exists is_test boolean not null default false;

comment on column workspaces.is_test is
  'True for the team''s own accounts. Excluded from admin metrics. Never set this from a pattern match — flag rows individually and deliberately.';

-- Partial index: the flagged set stays tiny while the table grows, so the
-- metrics queries that exclude it should not walk every row.
create index if not exists workspaces_is_test_idx
  on workspaces (id) where is_test;

-- The six throwaway accounts, flagged by exact email.
--
-- mananenator@gmail.com is deliberately NOT here. It is the owner's real
-- account and holds genuine family usage — 121 meal photos and two tracked
-- people, one of whom is among the most active submitters on the product.
-- Excluding it would remove a third of all photos ever posted and misreport
-- real engagement as absent.
update workspaces w
set is_test = true
from auth.users u
where u.id = w.owner_id
  and lower(u.email) in (
    'manan12345test@gmail.com',
    'mananm.thailand@gmail.com',
    'mandarth.manan@gmail.com',
    'allezmanan@gmail.com',
    'mananenator+nutriai-adults@gmail.com',
    'mandarth.manan+nutriai-adults@gmail.com'
  );
