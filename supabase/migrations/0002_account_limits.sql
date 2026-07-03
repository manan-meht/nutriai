-- Server-authoritative account limits:
--   - Family (adults_contacts): up to 2 added family members per workspace.
--     The workspace owner (caregiver) is not itself a row in adults_contacts,
--     so no explicit "minus one for the owner" adjustment is needed here.
--   - Coaching (gym_clients): up to 5 clients per workspace, same reasoning
--     (the coach/trainer owner is not a row in gym_clients).
--
-- Concurrency safety: a transaction-scoped advisory lock keyed by
-- (table, workspace_id) serializes concurrent inserts for the same
-- workspace, so two simultaneous "add" requests cannot both read a
-- count of 1 and both be allowed through when the limit is 2. The lock
-- is released automatically at transaction end (each Supabase insert is
-- its own transaction), so it never needs manual unlocking.
--
-- Existing rows are never touched: if a workspace already has more than
-- the new limit (from before this migration), the count check still
-- blocks *further* inserts but does nothing to rows that already exist.

create or replace function enforce_family_member_limit()
returns trigger language plpgsql as $$
declare
  member_count int;
  member_limit constant int := 2;
begin
  perform pg_advisory_xact_lock(hashtextextended('adults_contacts:' || NEW.workspace_id::text, 0));

  select count(*) into member_count
  from adults_contacts
  where workspace_id = NEW.workspace_id;

  if member_count >= member_limit then
    raise exception 'FAMILY_MEMBER_LIMIT_REACHED: workspace % already has % family member(s) (limit %)',
      NEW.workspace_id, member_count, member_limit
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists adults_contacts_limit_check on adults_contacts;
create trigger adults_contacts_limit_check
  before insert on adults_contacts
  for each row execute function enforce_family_member_limit();

create or replace function enforce_gym_client_limit()
returns trigger language plpgsql as $$
declare
  client_count int;
  client_limit constant int := 5;
begin
  perform pg_advisory_xact_lock(hashtextextended('gym_clients:' || NEW.workspace_id::text, 0));

  select count(*) into client_count
  from gym_clients
  where workspace_id = NEW.workspace_id;

  if client_count >= client_limit then
    raise exception 'GYM_CLIENT_LIMIT_REACHED: workspace % already has % client(s) (limit %)',
      NEW.workspace_id, client_count, client_limit
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists gym_clients_limit_check on gym_clients;
create trigger gym_clients_limit_check
  before insert on gym_clients
  for each row execute function enforce_gym_client_limit();
