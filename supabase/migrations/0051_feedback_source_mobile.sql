-- The mobile app had no way to send feedback at all — the web dashboards
-- have had a "Send Feedback" button since 0020, but apps/mobile shipped
-- without a counterpart (its only "feedback" is the Helpful/Not-helpful
-- pills on Food Balance recommendations, which is a different feature).
--
-- Adding the mobile entry point needs a third source value: 'dashboard'
-- (signed-in web) and 'website' (public marketing pages) don't describe an
-- in-app submission, and lumping it under 'dashboard' would make it
-- impossible to tell afterwards whether a report came from the web or the
-- Android/iOS app — which matters most for exactly the bug reports where
-- platform is the first question asked.
alter table feedback_submissions
  drop constraint if exists feedback_submissions_source_check;

alter table feedback_submissions
  add constraint feedback_submissions_source_check
  check (source in ('dashboard', 'website', 'mobile'));
