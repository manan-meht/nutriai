-- Coach profile photos and gallery images.
--
-- Private from the outset, same reasoning as contact-avatars (0049): a
-- photo of a person is at least as sensitive as a meal photo, and
-- meal-photos already had to be flipped from public to private after the
-- fact (0040). Reads go through short-lived signed URLs generated
-- server-side with the service-role client.
--
-- coach_media (the gallery table) already exists from 0056; this adds the
-- bucket its storage_path column points into. coach_profiles.photo_url
-- likewise already exists and now holds a bare storage path in this
-- bucket rather than a URL.
--
-- No RLS policies are added: like meal-photos and contact-avatars, every
-- read and write goes through the service-role client in server code,
-- which bypasses RLS. RLS with no policies denies everything else, which
-- is the intent — no client ever touches this bucket directly.

insert into storage.buckets (id, name, public)
values ('coach-media', 'coach-media', false)
on conflict (id) do nothing;
