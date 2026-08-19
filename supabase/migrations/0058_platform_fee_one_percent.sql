-- Platform fee drops from 15% to 1%.
--
-- Inserted as a new dated row rather than an update: club_platform_fees is
-- an append-only record of what was charged when, and the 15% row explains
-- any payment taken before this point. Every club_payments row also
-- snapshots the percent applied, so historical splits stay explainable
-- regardless.

insert into club_platform_fees (fee_percent, effective_from, note)
values (1, now(), 'Reduced to 1% — platform takes 1% of session payments before payout to the coach');
