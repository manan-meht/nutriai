-- Feedback form submissions (dashboard "Send Feedback" + public /feedback
-- page). Persisted primarily so unauthenticated submissions can be rate
-- limited by IP (Cloudflare Workers have no shared in-memory state across
-- edge isolates, so an in-process counter can't work here) and as a
-- fallback record if the outbound email fails. Written only by the
-- service-role client from the /api/feedback route — no RLS policies are
-- defined, so anon/authenticated roles have no access at all.
create table if not exists feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  feedback_type text not null check (feedback_type in (
    'general', 'feature_request', 'bug', 'ai_inaccurate', 'billing', 'other'
  )),
  message text not null,
  email text,
  full_name text,
  user_id uuid references auth.users(id) on delete set null,
  account_type text check (account_type in ('family', 'coach', 'self')),
  source text not null check (source in ('dashboard', 'website')),
  page_url text,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table feedback_submissions enable row level security;

-- Rate-limit lookups filter by ip_address/created_at (unauthenticated) or
-- user_id/created_at (authenticated).
create index if not exists feedback_submissions_ip_created_idx on feedback_submissions (ip_address, created_at);
create index if not exists feedback_submissions_user_created_idx on feedback_submissions (user_id, created_at);
