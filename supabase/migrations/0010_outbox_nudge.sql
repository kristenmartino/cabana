-- 0010_outbox_nudge.sql — low-latency nudge to the n8n outbox consumer (R5/ADR-02)
-- Delivery is guaranteed by the 60s sweep in n8n; this trigger only shaves the
-- latency in the common case. AFTER INSERT on outbox, fire a best-effort HTTP
-- POST at the n8n webhook so the consumer wakes immediately instead of waiting
-- up to a minute for the next sweep.
--
-- BEST-EFFORT BY DESIGN (ADR-02): the nudge is not the guarantee — the sweep is.
--   * net.http_post (pg_net) QUEUES the request and returns; it runs AFTER this
--     transaction commits, so a slow or failing n8n never blocks or fails the
--     booking write. The outbox row is already durable regardless.
--   * If the nudge is lost (n8n down, network blip, URL unset), the next 60s
--     sweep drains the row. No event is lost; at worst it is a bit slower.
--
-- The Railway/n8n URL is NOT hardcoded here (keeps the deploy URL out of the
-- repo). It is read from a database setting configured out-of-band by an
-- operator (see runbook):
--   alter database postgres set app.n8n_nudge_url =
--     'https://<n8n-host>/webhook/cabana-outbox';
-- If that setting is null/empty (local dev, tests, un-provisioned envs), the
-- trigger does nothing — no error — so those environments are unaffected.
--
-- Append-only migration (never edit shipped SQL). pg_net is idempotent to
-- enable.

create extension if not exists pg_net;

create or replace function nudge_outbox_consumer()
returns trigger language plpgsql as $$
declare
  v_url text := current_setting('app.n8n_nudge_url', true);
begin
  -- Guard: no URL configured -> no-op. Keeps local/test/un-provisioned
  -- environments working without a Railway endpoint.
  if v_url is null or v_url = '' then
    return null;
  end if;

  -- Fire-and-forget. pg_net queues this; it is delivered after commit and its
  -- success/failure never affects the booking write (the sweep is the
  -- guarantee).
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json'),
    body := jsonb_build_object('outbox_id', new.id, 'dedupe_key', new.dedupe_key)
  );

  return null; -- AFTER trigger; return value is ignored.
end $$;

create trigger outbox_nudge_after_insert
  after insert on outbox
  for each row execute function nudge_outbox_consumer();
