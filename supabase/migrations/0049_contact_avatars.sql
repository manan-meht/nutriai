-- Lets a caregiver (or a self-tracking user) upload a real profile photo
-- for a tracked contact, shown on the dashboard instead of only a
-- colored-initials placeholder. Private bucket from the outset (unlike
-- meal-photos, which started public and had to be flipped later — see
-- 0040_private_meal_photos.sql) — a person's photo of themselves is at
-- least as sensitive as a meal photo, so this skips straight to the
-- signed-URL-at-read-time pattern that migration ended up on.

alter table adults_contacts
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('contact-avatars', 'contact-avatars', false)
on conflict (id) do nothing;
