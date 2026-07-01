-- 0004_pipeline.sql — transactional outbox + operational tables
-- Delivery contract (R5/ADR-02): state change and its outbox row commit in the
-- same transaction. n8n consumes the outbox (webhook nudge for latency, 60s
-- sweep for guarantee), dedupes on dedupe_key, retries with backoff, and
-- dead-letters with an alert. Silence is never ambiguous.

create table outbox (
  id bigint generated always as identity primary key,
  topic text not null,                     -- 'booking.created' | 'booking.status_changed' | ...
  dedupe_key text not null unique,         -- consumers treat as idempotency key
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);

create index outbox_unprocessed_idx on outbox (id) where processed_at is null;

create table dead_letters (
  id bigint generated always as identity primary key,
  outbox_id bigint references outbox(id),
  workflow text,
  error text,
  payload jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Every model call, auditable: cost, latency, decision, prompt version (R2/ADR-08).
create table ai_events (
  id bigint generated always as identity primary key,
  prompt_version text not null,
  input text not null,
  raw_output text,
  parsed jsonb,
  confidence numeric,
  outcome text not null check (outcome in
    ('auto_qualified','needs_review','validation_failed','timeout')),
  latency_ms int,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

-- Telegram authorization allowlist (R7/ADR-07). The bot refuses, rate-limits,
-- and logs any chat not present here. Rows are inserted manually on Day 1.
create table telegram_chats (
  chat_id bigint primary key,
  label text not null,
  role text not null check (role in ('owner','office'))
);

-- Evidence trail for Supabase <-> Airtable projection + write-back (R6/ADR-01).
create table sync_log (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('to_airtable','writeback')),
  entity text not null,
  entity_id uuid,
  airtable_record_id text,
  result text not null,
  at timestamptz not null default now()
);

-- Emit outbox events for booking lifecycle. Runs AFTER the transition guard
-- (0002) has validated and audited the change; same transaction, so the event
-- exists iff the state change committed.
create or replace function emit_booking_event()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into outbox (topic, dedupe_key, payload)
    values (
      'booking.created',
      new.id::text || ':created',
      jsonb_build_object('booking_id', new.id, 'status', new.status, 'kind', new.kind)
    )
    on conflict (dedupe_key) do nothing;
  elsif new.status is distinct from old.status then
    -- The legal graph (0002) is acyclic, so (booking_id, to_status) is unique
    -- per booking lifetime and safe as a dedupe key.
    insert into outbox (topic, dedupe_key, payload)
    values (
      'booking.status_changed',
      new.id::text || ':' || new.status,
      jsonb_build_object(
        'booking_id', new.id,
        'from', old.status,
        'to', new.status,
        'kind', new.kind,
        'member_id', new.member_id
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;

create trigger booking_outbox_emit
  after insert or update of status on bookings
  for each row execute function emit_booking_event();
