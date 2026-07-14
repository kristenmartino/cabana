-- 0016_rate_limit.sql — fixed-window counter for intake rate-limiting
-- Demo member requests are throttled at 6 per 10-minute window (by client IP).
-- Real members are never rate-limited (G1: zero-lost-intake for paying customers).
--
-- Why SECURITY DEFINER: the check_rate_limit RPC increments the counter and
-- returns the new count; only service_role may call it. The RPC (not the table
-- — tables can't be SECURITY DEFINER) runs as its owner so the increment works
-- regardless of caller. The counter table has RLS enabled with no policies and
-- is granted to service_role only (same posture as ai_events / app_config —
-- operational tables the browser can never touch).
--
-- Why fixed-window (not sliding): simpler, efficient, and adequate for demo
-- rate-limiting. The bucket is the epoch floored to the window size:
-- window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds)
-- * p_window_seconds), so all requests in the same interval share a bucket.
-- Stale buckets
-- never cause problems: they just accumulate rows (one bucket per IP per window).
-- A cleanup job could DELETE where window_start < now() - '1 day', but not needed
-- for demo correctness or resource limits.
--
-- The RPC contract: returns boolean — true means ALLOWED (count <= max), false
-- means THROTTLED. Fail-open on error: if the limiter crashes, the member
-- request proceeds. The guard in app/request/actions.ts wraps the call in
-- try/catch and defaults to allowing.

create table rate_limit_counter (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);

alter table rate_limit_counter enable row level security;
-- No policies -> service-role only, matching the operational-table posture (0005).
grant select, insert, update, delete on rate_limit_counter to service_role;

-- Fixed-window rate-limit counter. Buckets now() into a p_window_seconds window,
-- increments the counter, and returns true if count <= p_max (ALLOWED).
-- Returns false if throttled.
create or replace function check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  -- Bucket now() into a fixed window. Divide seconds since epoch by window size,
  -- floor it, multiply back, and convert to timestamp. This ensures all requests
  -- in the same p_window_seconds interval map to the same window_start.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds)::bigint * p_window_seconds
  );

  -- Upsert: increment if exists, insert with count=1 if new.
  insert into rate_limit_counter (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = rate_limit_counter.count + 1;

  -- Fetch the new count.
  select count into v_count from rate_limit_counter
  where key = p_key and window_start = v_window_start;

  -- True = ALLOWED, False = THROTTLED.
  return v_count <= p_max;
end $$;

-- Service-role only: rate-limiting is application-gated and must never be
-- callable by members or anon.
revoke execute on function check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function check_rate_limit(text, integer, integer) to service_role;
