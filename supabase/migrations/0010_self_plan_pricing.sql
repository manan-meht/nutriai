-- Self-tracking plan support: a workspace's base included-people count is
-- 1 for "self" plan vs the existing 2 for "family" — enforced in the same
-- authoritative trigger as always (now SECURITY DEFINER per migration
-- 0008, so this plan lookup isn't subject to RLS either). Existing
-- workspaces default to 'family' (adults) / 'coach' (gym), so this is
-- backward compatible with no behavior change until a workspace is
-- explicitly marked 'self' (see addSelfContact in actions.ts).

alter table workspaces
  add column plan text not null default 'family'
  check (plan in ('family', 'self', 'coach'));

update workspaces set plan = 'coach' where type = 'gym';

create or replace function enforce_family_member_limit()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  active_count int;
  month_count int;
  workspace_plan text;
  base_limit int;
  workspace_extra int;
  effective_limit int;
begin
  perform pg_advisory_xact_lock(hashtextextended('adults_contacts:' || NEW.workspace_id::text, 0));

  select extra_capacity, plan into workspace_extra, workspace_plan
  from workspaces
  where id = NEW.workspace_id;

  base_limit := case when workspace_plan = 'self' then 1 else 2 end;
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
