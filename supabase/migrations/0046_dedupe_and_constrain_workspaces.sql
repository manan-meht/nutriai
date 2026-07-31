-- getOrCreateWorkspace (packages/nutrition-core/src/workspaces.ts) used a
-- check-then-insert pattern with no DB-level uniqueness guarantee: look up
-- an existing (owner_id, type) workspace, and if none exists, insert one.
-- Two near-simultaneous requests (e.g. two screens each independently
-- calling GET /adults/workspace on mount) can both pass the "not found"
-- check before either insert commits, each creating their own row —
-- confirmed via 8 real duplicate-workspace pairs found in production, every
-- one created between ~20ms and ~0.6s apart. In every case the contact(s)
-- ended up on the older row and the newer row was completely empty (no
-- contacts, no gym clients, no entitlements) — safe to delete outright.
--
-- Deletes only a newer duplicate that has zero attached data, keeping the
-- oldest row per (owner_id, type) — never touches a workspace that's the
-- only one for its owner, or one that actually has contacts/clients/
-- entitlements attached, however it ranks by created_at.
delete from workspaces w
using (
  select id,
         row_number() over (partition by owner_id, type order by created_at asc) as rn
  from workspaces
) ranked
where w.id = ranked.id
  and ranked.rn > 1
  and not exists (select 1 from adults_contacts ac where ac.workspace_id = w.id)
  and not exists (select 1 from gym_clients gc where gc.workspace_id = w.id)
  and not exists (select 1 from entitlements e where e.workspace_id = w.id);

-- Prevents this from recurring at all, regardless of any future application
-- code path — pairs with the getOrCreateWorkspace upsert fix (see that
-- file's own comment) which relies on this exact constraint name.
alter table workspaces add constraint workspaces_owner_id_type_key unique (owner_id, type);
