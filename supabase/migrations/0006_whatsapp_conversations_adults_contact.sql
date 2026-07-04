-- whatsapp_conversations was only ever built for gym clients — client_id
-- has a foreign key exclusively to gym_clients(id), with no equivalent
-- column for adults_contacts at all. This meant every conversation-state
-- write for a Family contact was doomed to fail (first on non-existent
-- columns, and even after that fix, on this missing FK target), so
-- conversation state never actually persisted for the Family module.
--
-- Adds the missing column and a check ensuring each row is tied to
-- exactly one entity type (never both, never neither).

alter table whatsapp_conversations
  add column adults_contact_id uuid references adults_contacts(id) on delete cascade;

alter table whatsapp_conversations add constraint whatsapp_conversations_exactly_one_entity
  check (
    (client_id is not null and adults_contact_id is null) or
    (client_id is null and adults_contact_id is not null)
  );
