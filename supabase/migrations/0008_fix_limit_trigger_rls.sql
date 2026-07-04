-- enforce_family_member_limit / enforce_gym_client_limit read
-- workspaces.extra_capacity to compute the effective limit, but as plain
-- (non-SECURITY DEFINER) plpgsql functions they run under the RLS of
-- whichever role fired the triggering INSERT — the normal authenticated
-- caregiver/coach session, not an elevated role. The "workspaces: member
-- access" RLS SELECT policy requires a matching workspace_members row,
-- which workspace creation never inserts for the owner — so this SELECT
-- silently matched zero rows and the trigger treated extra_capacity as 0
-- for every workspace, regardless of what was actually purchased/set.
--
-- Confirmed live: a workspace with extra_capacity=1000 was still rejected
-- by this trigger at the base limit of 2, even after fixing the app-layer
-- pre-check to read the correct value via the service-role client — this
-- trigger is the actual authoritative gate and had the identical, separate
-- instance of the same underlying RLS gap.
--
-- SECURITY DEFINER makes the function run with the privileges of its
-- owner (the migration-running role, effectively bypassing RLS for this
-- internal lookup) regardless of who fires the trigger. search_path is
-- pinned per Postgres's standard SECURITY DEFINER hardening guidance, to
-- prevent a caller from shadowing pg_catalog/public objects.

create or replace function enforce_family_member_limit()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  active_count int;
  month_count int;
  base_limit constant int := 2;
  workspace_extra int;
  effective_limit int;
begin
  perform pg_advisory_xact_lock(hashtextextended('adults_contacts:' || NEW.workspace_id::text, 0));

  select extra_capacity into workspace_extra
  from workspaces
  where id = NEW.workspace_id;

  effective_limit := base_limit + coalesce(workspace_extra, 0);

  select count(*) into active_count
  from adults_contacts
  where workspace_id = NEW.workspace_id and deleted_at is null;

  select count(*) into month_count
  from adults_contacts
  where workspace_id = NEW.workspace_id
    and created_at >= date_trunc('month', now());

  if active_count >= effective_limit then
    raise exception 'FAMILY_MEMBER_LIMIT_REACHED: workspace % already has % active family member(s) (limit %, base % + purchased %)',
      NEW.workspace_id, active_count, effective_limit, base_limit, coalesce(workspace_extra, 0)
      using errcode = 'P0001';
  end if;

  if month_count >= effective_limit then
    raise exception 'FAMILY_MEMBER_MONTHLY_QUOTA_REACHED: workspace % already added % family member(s) this calendar month (limit %, base % + purchased %)',
      NEW.workspace_id, month_count, effective_limit, base_limit, coalesce(workspace_extra, 0)
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

create or replace function enforce_gym_client_limit()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  active_count int;
  month_count int;
  base_limit constant int := 5;
  workspace_extra int;
  effective_limit int;
begin
  perform pg_advisory_xact_lock(hashtextextended('gym_clients:' || NEW.workspace_id::text, 0));

  select extra_capacity into workspace_extra
  from workspaces
  where id = NEW.workspace_id;

  effective_limit := base_limit + coalesce(workspace_extra, 0);

  select count(*) into active_count
  from gym_clients
  where workspace_id = NEW.workspace_id and deleted_at is null;

  select count(*) into month_count
  from gym_clients
  where workspace_id = NEW.workspace_id
    and created_at >= date_trunc('month', now());

  if active_count >= effective_limit then
    raise exception 'GYM_CLIENT_LIMIT_REACHED: workspace % already has % client(s) (limit %, base % + purchased %)',
      NEW.workspace_id, active_count, effective_limit, base_limit, coalesce(workspace_extra, 0)
      using errcode = 'P0001';
  end if;

  if month_count >= effective_limit then
    raise exception 'GYM_CLIENT_MONTHLY_QUOTA_REACHED: workspace % already added % client(s) this calendar month (limit %, base % + purchased %)',
      NEW.workspace_id, month_count, effective_limit, base_limit, coalesce(workspace_extra, 0)
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;
