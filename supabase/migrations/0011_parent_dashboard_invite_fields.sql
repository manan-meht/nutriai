-- Optional fields for the parent-dashboard-access flow: a family member
-- can optionally record the parent's email (for a possible future email
-- magic-link option — WhatsApp OTP remains the only implemented method
-- for now) and explicitly opt the parent into "View my progress" access.
-- Both null/false by default — fully backward compatible, no behavior
-- change until a caregiver sets them via the contact edit UI.

alter table adults_contacts
  add column parent_email text,
  add column parent_dashboard_invited boolean not null default false;
