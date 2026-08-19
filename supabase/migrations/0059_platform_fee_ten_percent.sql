-- Platform fee set to 10%, inclusive of payment processing.
--
-- On an 80 SGD session: 8 SGD to Tistra, 72 SGD to the coach. Stripe's own
-- processing fee comes out of Tistra's 8, not the coach's 72 — the coach's
-- share is exactly 90% of the price regardless of what a card costs to
-- process, which is what makes the number quotable on a profile.
--
-- Appended rather than updated, like every rate before it: club_platform_fees
-- is the dated record of what was charged when.

insert into club_platform_fees (fee_percent, effective_from, note)
values (10, now(), '10% inclusive of Stripe processing fees — coach receives 90% of the session price');
