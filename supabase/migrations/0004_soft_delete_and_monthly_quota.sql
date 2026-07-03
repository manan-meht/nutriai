-- Lets an owner remove a family member / client while preserving their
-- historical data (soft delete via deleted_at, never a hard DELETE), and
-- changes the limit triggers so that removing someone does not immediately
-- free up a slot to add someone new. Per product decision: the 2 (family) /
-- 5 (coaching) limit governs both (a) how many can be active at once, and
-- (b) how many NEW adds are allowed within the current calendar month.
-- Deleting a row does not decrement the current month's add-count — the
-- freed capacity only becomes usable again once the calendar month rolls
-- over. Both checks use base_limit + extra_capacity from
-- 0003_purchasable_capacity.sql.

alter table adults_contacts add column deleted_at timestamptz;
alter table gym_clients add column deleted_at timestamptz;

create or replace function enforce_family_member_limit()
returns trigger language plpgsql as $$
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

  -- Counts every add this calendar month regardless of deleted_at, so
  -- deleting someone does not let a new add through until next month.
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
returns trigger language plpgsql as $$
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
    raise exception 'GYM_CLIENT_LIMIT_REACHED: workspace % already has % active client(s) (limit %, base % + purchased %)',
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
