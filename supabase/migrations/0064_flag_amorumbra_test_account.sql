-- One more of the team's own accounts, identified after 0063 shipped.
--
-- Kept as a migration rather than a one-off console update so a restored or
-- rebuilt database carries the same flags. Metrics that silently differ
-- between environments are how the dashboard reported nonsense the first
-- time round.
--
-- Confirmed to hold nothing before flagging: zero live contacts, zero meal
-- logs. So this moves the user count (55 -> 54) and touches no other figure.
-- Check the same way before adding to this list — flagging an account that
-- has real data removes that data from every Health metric at once.

update workspaces w
set is_test = true
from auth.users u
where u.id = w.owner_id
  and lower(u.email) = 'amorumbra883@gmail.com'
  and w.is_test = false;
