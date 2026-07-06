-- Persist the WhatsApp meal photo alongside its analysis, so caregiver and
-- self-view dashboards can show the actual photo instead of only the
-- AI-identified food list. Nullable/backward compatible — meals logged
-- before this exist fine with image_url = null.
alter table meal_logs
  add column if not exists image_url text;

-- Public bucket: meal photos are shown directly in dashboards via their
-- public URL, and are already only reachable by whoever has the caregiver's
-- or contact's dashboard link/session — no additional sensitivity beyond
-- what the dashboards themselves already gate.
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;
