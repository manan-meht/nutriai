-- Self-tracking reuses the existing adults_contacts/gym_clients tracking
-- system rather than a separate one (per product decision) — a
-- "relationship_type" column drives dashboard copy/labels only, not a
-- different data path. Named distinctly from the existing free-text
-- "relationship" column (son/daughter/spouse/etc, used for the contact
-- card's relationship emoji) to avoid colliding with it — this is a
-- separate, system-level concept. Existing rows default to the type
-- implied by today's only use case (a caregiver adding someone else / a
-- coach adding a client), so this is backward compatible with no behavior
-- change until SELF_TRACKING_ENABLED is turned on and self-tracking rows
-- start being created with relationship_type = 'self'.

alter table adults_contacts
  add column relationship_type text not null default 'family_caregiver'
  check (relationship_type in ('self', 'family_caregiver'));

alter table gym_clients
  add column relationship_type text not null default 'coach_client'
  check (relationship_type in ('coach_client'));
