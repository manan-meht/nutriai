-- Separates seeded demo coaches from real ones.
--
-- tistra.club is live with no real coaches registered, and a marketplace
-- showing fabricated people under real names, prices and availability
-- misleads anyone who lands on it. The seeded coaches move to /demo, where
-- they are labelled as examples.
--
-- An explicit column rather than a list of ids in code: a real coach
-- signing up gets the default (false) and appears in discovery with no
-- further action, which is the behaviour that must not depend on someone
-- remembering to update a constant.

alter table coach_profiles
  add column if not exists is_demo boolean not null default false;

comment on column coach_profiles.is_demo is
  'Seeded example coach. Excluded from discovery; shown only on /demo. Real coaches default to false.';

create index if not exists coach_profiles_discovery_idx
  on coach_profiles (status) where is_demo = false;
