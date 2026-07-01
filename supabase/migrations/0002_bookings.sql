-- 0002_bookings.sql — bookings, transition audit, status machine enforcement
-- The two guarantees in this file are the ones app code is NOT trusted with:
--   1. A tech cannot be double-booked (exclusion constraint, not an app check).
--   2. Illegal status transitions are impossible, and every transition is audited.

create table bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  property_id uuid not null references properties(id),
  member_id uuid not null references members(id),
  tech_id uuid references techs(id),
  kind text not null check (kind in ('repair','one_off_clean','plan_visit')),
  status text not null default 'requested' check (status in
    ('requested','needs_review','awaiting_deposit','scheduled',
     'confirmed','completed','cancelled','no_show')),
  request_text text,                 -- the member's own words (R1)
  triage jsonb,                      -- zod-validated AI output (R2); shape in lib/triage/schema.ts
  "window" tstzrange,                -- UTC; render in businesses.tz
  deposit_required boolean not null default false,
  visit_notes text,                  -- office write-back whitelist field (R6/ADR-01)
  external_invoice_ref text,         -- P2: QuickBooks matching
  created_at timestamptz not null default now(),

  -- The double-booking fix lives here, under concurrency, not in app code (D6/R3).
  -- NULL tech_id or NULL window never conflicts (Postgres exclusion semantics).
  constraint no_tech_overlap exclude using gist
    (tech_id with =, "window" with &&)
    where (status in ('scheduled','confirmed'))
);

create index bookings_member_idx on bookings (member_id);
create index bookings_status_idx on bookings (status);
create index bookings_window_idx on bookings using gist ("window");

-- Audit: every status change, by whom, via what channel.
create table booking_transitions (
  id bigint generated always as identity primary key,
  booking_id uuid not null references bookings(id),
  from_status text,
  to_status text not null,
  actor text not null,  -- 'member' | 'owner:telegram' | 'office:airtable' | 'system:stripe' | 'system:expiry' | 'seed' | 'system'
  at timestamptz not null default now()
);

create index booking_transitions_booking_idx on booking_transitions (booking_id);

-- Callers identify themselves per-transaction:
--   select set_config('cabana.actor', 'owner:telegram', true);
-- Server actions and edge functions MUST set this before status writes.
create or replace function enforce_booking_transition()
returns trigger language plpgsql as $$
declare
  v_actor text := coalesce(nullif(current_setting('cabana.actor', true), ''), 'system');
  allowed boolean;
begin
  if tg_op = 'INSERT' then
    insert into booking_transitions (booking_id, from_status, to_status, actor)
    values (new.id, null, new.status, v_actor);
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  -- The legal graph (PRD R3). Terminal states: completed, cancelled, no_show.
  allowed := (old.status, new.status) in (
    ('requested','needs_review'),
    ('requested','awaiting_deposit'),
    ('requested','cancelled'),
    ('needs_review','awaiting_deposit'),
    ('needs_review','scheduled'),        -- non-deposit work approved straight to schedule
    ('needs_review','cancelled'),
    ('awaiting_deposit','scheduled'),    -- driven only by verified Stripe webhook (R4)
    ('awaiting_deposit','cancelled'),    -- includes system:expiry after 24h hold
    ('scheduled','confirmed'),
    ('scheduled','cancelled'),
    ('confirmed','completed'),
    ('confirmed','cancelled'),
    ('confirmed','no_show')
  );

  if not allowed then
    raise exception 'illegal booking transition: % -> %', old.status, new.status
      using errcode = 'P0001',
            hint = 'See PRD R3 status machine; transitions must follow the legal graph.';
  end if;

  insert into booking_transitions (booking_id, from_status, to_status, actor)
  values (new.id, old.status, new.status, v_actor);
  return new;
end $$;

create trigger booking_transition_guard
  before insert or update of status on bookings
  for each row execute function enforce_booking_transition();
