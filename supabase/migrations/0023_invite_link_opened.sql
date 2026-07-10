-- Tracks when the caregiver/coach actually took the "send this invite"
-- action (clicked "Send invite on WhatsApp" or "Copy invite link"), as
-- distinct from the invite merely existing (pending invites are created
-- automatically the moment a contact/client is added, before anyone has
-- actually sent anything). Without this, InviteCard had no way to tell
-- "just generated, nothing sent yet" apart from "already sent, no action
-- needed" on a return visit — both looked identical (a pending invite),
-- so the send buttons kept showing regardless of whether they'd already
-- been used.
alter table whatsapp_invites add column if not exists link_opened_at timestamptz;
