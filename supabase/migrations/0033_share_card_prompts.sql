-- Shareable accomplishment cards ("Your wins") — server-side state needed
-- for the anti-spam rules that can't live in localStorage, since the
-- WhatsApp end-of-day moment and the weekly WhatsApp mention have no
-- browser to keep state in (see src/lib/share-cards/selector.ts's
-- canShowImmediatePrompt/pickImmediatePromptCard doc comments, which
-- describe this as "caller-owned state (e.g. local storage or a DB
-- column)" — this is that DB column, for both surfaces).
--
-- last_share_card_prompt_at: last time an immediate ("end of day
-- achievement moment") prompt was shown to this contact, on any surface —
-- enforces "max 1 immediate share prompt per day" globally per contact.
-- last_weekly_wins_sent_at: last time the weekly WhatsApp "you earned a
-- share card this week" mention was sent — enforces at most one per week.
-- dismissed_share_card_ids: concept ids the contact chose "don't show this
-- one again" for — excluded from future earned-card evaluation everywhere.
alter table adults_contacts
  add column if not exists last_share_card_prompt_at timestamptz,
  add column if not exists last_weekly_wins_sent_at timestamptz,
  add column if not exists dismissed_share_card_ids text[] not null default '{}';

alter table gym_clients
  add column if not exists last_share_card_prompt_at timestamptz,
  add column if not exists last_weekly_wins_sent_at timestamptz,
  add column if not exists dismissed_share_card_ids text[] not null default '{}';
