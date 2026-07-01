-- 0003_payments.sql — payments + Stripe idempotency ledger
-- Invariant (R4/ADR-03): payment state changes originate ONLY from
-- signature-verified webhook events. The success redirect is cosmetic.
-- Every payment state transition is traceable to a row in stripe_events.

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  stripe_checkout_session_id text unique,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending','paid','expired','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_booking_idx on payments (booking_id);
create index payments_status_idx on payments (status);  -- reconciliation: pending-age alerts

create trigger payments_touch
  before update on payments
  for each row execute function touch_updated_at();

-- Idempotency + audit ledger for inbound Stripe events.
-- The webhook handler does: insert ... on conflict (id) do nothing;
-- zero rows inserted => already processed => ack 200 and exit.
create table stripe_events (
  id text primary key,               -- Stripe event id (evt_...)
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
