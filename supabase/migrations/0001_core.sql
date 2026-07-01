-- 0001_core.sql — extensions + core domain tables
-- Conventions: all timestamps are timestamptz (UTC). Rendering in the business
-- timezone happens at the edges (UI, email, bot), never in the database.
-- Migrations are append-only; never edit a shipped migration.

create extension if not exists btree_gist;  -- required by the booking exclusion constraint (0002)

-- P2 insurance (ADR: multi-tenant is a non-goal, but business_id exists from day one
-- so nothing structural blocks it later). Exactly one row in v1.
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tz text not null default 'America/New_York',
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  -- Null until first magic-link sign-in; linked by email at that moment.
  user_id uuid unique references auth.users(id),
  full_name text not null,
  email text not null unique,
  phone text,
  created_at timestamptz not null default now()
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  address text not null,
  zip text not null,                       -- input to the service-area rule (D3)
  access_notes text,                       -- gate codes, pets: first-class data (D2)
  access_notes_updated_by uuid,            -- stamped by trigger in 0005
  access_notes_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 0 = Sunday … 6 = Saturday. Billing stays in QuickBooks (NG1/ADR-06);
  -- this table only informs "what day is my service?" self-service.
  weekly_day int not null check (weekly_day between 0 and 6)
);

create table techs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  display_name text not null,
  telegram_chat_id bigint,                 -- v1.5: per-tech daily digests
  active boolean not null default true
);

create table memberships (
  member_id uuid not null references members(id),
  property_id uuid not null references properties(id),
  plan_id uuid not null references plans(id),
  external_billing_ref text,               -- QuickBooks pointer, read-only (P2)
  started_on date not null default current_date,
  primary key (member_id, property_id)
);

-- Non-member intake is only accepted in these zips (D3). Members are served
-- wherever they already are; this gates *new* addresses/leads.
create table service_zips (
  zip text primary key,
  note text
);

-- Shared trigger for updated_at maintenance (used by payments in 0003).
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
