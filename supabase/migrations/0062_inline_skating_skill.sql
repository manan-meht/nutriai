-- Adds Inline Skating to the skills coaches teach and clients search.
--
-- Skills are data, not code: the chips on the discovery deck and the
-- picker in coach settings both read club_skills, so this row is the whole
-- change. Idempotent — re-running it updates the row rather than failing.
--
-- sort_order 125 places it with the other sports (tennis is 120) and ahead
-- of the general categories, which sit at 130-140.
insert into club_skills (slug, name, category, description, sort_order, is_active)
values (
  'inline-skating',
  'Inline Skating',
  'sport',
  'Balance, stopping and confident skating on wheels.',
  125,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();
