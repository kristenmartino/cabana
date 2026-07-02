-- 0011_outbox_nudge_config.sql — configure the n8n nudge URL via a table, not a GUC
-- 0010 read the nudge URL from a database GUC (app.n8n_nudge_url). On Supabase
-- the project role is NOT permitted to persist a custom GUC —
--   alter database/role ... set app.n8n_nudge_url  ->  42501 "permission denied
--   to set parameter" — so there is no way to give the GUC a durable value
-- (session-scoped set_config still works, which is why cabana.actor is fine, but
-- a trigger firing on an arbitrary write can't rely on a session default).
-- Fix: read the URL from a tiny service-role-only config table. Append-only —
-- the trigger function is redefined with CREATE OR REPLACE; 0010's trigger stays
-- bound to it. SECURITY DEFINER so the read works regardless of which role's
-- write cascaded into the outbox insert (service_role, postgres/seed, …), while
-- the table itself stays invisible to anon/authenticated (no RLS policies).

create table app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;
-- No policies -> service-role only, matching the operational-table posture (0005).
grant select, insert, update, delete on app_config to service_role;

create or replace function nudge_outbox_consumer()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
begin
  select value into v_url from app_config where key = 'n8n_nudge_url';

  -- No URL configured -> no-op (local dev, tests, un-provisioned envs). The 60s
  -- sweep in n8n is the delivery guarantee; this nudge only trims latency (ADR-02).
  if v_url is null or v_url = '' then
    return null;
  end if;

  -- Fire-and-forget. pg_net queues the POST and returns; it is delivered AFTER
  -- this transaction commits, so a slow or failing n8n never blocks or fails the
  -- booking write. The outbox row is already durable.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json'),
    body := jsonb_build_object('outbox_id', new.id, 'dedupe_key', new.dedupe_key)
  );
  return null; -- AFTER trigger; return value ignored.
end $$;

-- Configure the URL out-of-band (NOT in this migration, to keep the deploy URL
-- out of the repo):
--   insert into app_config (key, value)
--   values ('n8n_nudge_url', 'https://<n8n-host>/webhook/cabana-outbox')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
-- To disable the nudge (fall back to sweep-only): delete from app_config where key = 'n8n_nudge_url';
