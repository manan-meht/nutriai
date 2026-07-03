-- Lets an account owner purchase additional capacity beyond the base free
-- limits (2 family members / 5 gym clients) enforced in
-- 0002_account_limits.sql. extra_capacity is added on top of the base limit
-- inside the same triggers, so no trigger rewrite is needed when billing
-- for extra seats ships later — a verified payment-provider webhook just
-- increments this column server-side (via the service-role client; there is
-- no RLS write policy for it, so end users cannot self-grant capacity).
--
-- Defaults to 0 for all existing and new workspaces, so nothing changes
-- until a purchase actually happens.

alter table workspaces
  add column extra_capacity int not null default 0;

alter table workspaces
  add constraint workspaces_extra_capacity_non_negative check (extra_capacity >= 0);

create or replace function enforce_family_member_limit()
returns trigger language plpgsql as $$
declare
  member_count int;
  base_limit constant int := 2;
  workspace_extra int;
  effective_limit int;
begin
  perform pg_advisory_xact_lock(hashtextextended('adults_contacts:' || NEW.workspace_id::text, 0));

  select extra_capacity into workspace_extra
  from workspaces
  where id = NEW.workspace_id;

  effective_limit := base_limit + coalesce(workspace_extra, 0);

  select count(*) into member_count
  from adults_contacts
  where workspace_id = NEW.workspace_id;

  if member_count >= effective_limit then
    raise exception 'FAMILY_MEMBER_LIMIT_REACHED: workspace % already has % family member(s) (limit %, base % + purchased %)',
      NEW.workspace_id, member_count, effective_limit, base_limit, coalesce(workspace_extra, 0)
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

create or replace function enforce_gym_client_limit()
returns trigger language plpgsql as $$
declare
  client_count int;
  base_limit constant int := 5;
  workspace_extra int;
  effective_limit int;
begin
  perform pg_advisory_xact_lock(hashtextextended('gym_clients:' || NEW.workspace_id::text, 0));

  select extra_capacity into workspace_extra
  from workspaces
  where id = NEW.workspace_id;

  effective_limit := base_limit + coalesce(workspace_extra, 0);

  select count(*) into client_count
  from gym_clients
  where workspace_id = NEW.workspace_id;

  if client_count >= effective_limit then
    raise exception 'GYM_CLIENT_LIMIT_REACHED: workspace % already has % client(s) (limit %, base % + purchased %)',
      NEW.workspace_id, client_count, effective_limit, base_limit, coalesce(workspace_extra, 0)
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

-- Triggers already point at these function names (created in
-- 0002_account_limits.sql); create-or-replace above is enough, no need to
-- drop/recreate the triggers themselves.
