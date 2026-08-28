-- Adds Dance and Latin Dance to the skills coaches teach and clients search.
--
-- Skills are data, not code: the chips on the discovery deck, the picker in
-- coach settings, and the skill filters on /coaches all read club_skills, so
-- these two rows are the whole functional change. Idempotent — re-running
-- updates the rows rather than failing, matching 0062_inline_skating_skill.
--
-- category 'movement' groups them with handstands, acrobatics, mobility and
-- pole rather than inventing a category for two rows. sort_order 62 and 64
-- place them straight after pole (60) and before yoga (70), so the movement
-- disciplines stay contiguous in the picker.
--
-- Two entries rather than one: "Dance" is what a general dance teacher
-- lists, and "Latin Dance" is what someone searching for salsa or bachata
-- actually types. Collapsing them would make one of those two searches fail.
insert into club_skills (slug, name, category, description, sort_order, is_active)
values
  (
    'dance',
    'Dance',
    'movement',
    'Rhythm, coordination and confidence moving to music.',
    62,
    true
  ),
  (
    'latin-dance',
    'Latin Dance',
    'movement',
    'Salsa, bachata and partner work, from first steps upwards.',
    64,
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();
