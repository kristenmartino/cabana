-- 0005_rls.sql — row-level security + write lockdown
-- Posture: default deny. RLS is ON for every table. Tables without policies
-- are service-role-only by construction. Members reach exactly their own data,
-- enforced at the database — the UI filtering is a convenience, not the guard.
-- The CI test suite (tests/rls) asserts this with adversarial JWT fixtures.

alter table businesses          enable row level security;
alter table members             enable row level security;
alter table properties          enable row level security;
alter table plans               enable row level security;
alter table techs               enable row level security;
alter table memberships         enable row level security;
alter table service_zips        enable row level security;
alter table bookings            enable row level security;
alter table booking_transitions enable row level security;
alter table payments            enable row level security;
alter table stripe_events       enable row level security;
alter table outbox              enable row level security;
alter table dead_letters        enable row level security;
alter table ai_events           enable row level security;
alter table telegram_chats      enable row level security;
alter table sync_log            enable row level security;

-- ---------------------------------------------------------------------------
-- Write lockdown: browsers (anon/authenticated) cannot write anything...
revoke insert, update, delete on all tables in schema public from anon, authenticated;
-- ...except the single member-editable surface: their own access notes (R1).
grant update (access_notes) on properties to authenticated;
-- All other writes go through server actions / edge functions (service role),
-- which set the actor for the audit trail:
--   select set_config('cabana.actor', '<actor>', true);
-- ---------------------------------------------------------------------------

-- Members: self only.
create policy member_reads_self on members
  for select using (user_id = auth.uid());

-- Properties: own only; update limited by the column grant above.
create policy member_reads_own_properties on properties
  for select using (
    member_id in (select id from members where user_id = auth.uid())
  );

create policy member_updates_own_access_notes on properties
  for update using (
    member_id in (select id from members where user_id = auth.uid())
  )
  with check (
    member_id in (select id from members where user_id = auth.uid())
  );

-- Memberships: own only.
create policy member_reads_own_memberships on memberships
  for select using (
    member_id in (select id from members where user_id = auth.uid())
  );

-- Plans + service area: harmless reference data for signed-in members
-- ("what day is my service?", "do you serve this zip?").
create policy authenticated_reads_plans on plans
  for select using (auth.uid() is not null);

create policy authenticated_reads_service_zips on service_zips
  for select using (auth.uid() is not null);

-- Bookings: own only.
create policy member_reads_own_bookings on bookings
  for select using (
    member_id in (select id from members where user_id = auth.uid())
  );

-- Payments: via own bookings.
create policy member_reads_own_payments on payments
  for select using (
    booking_id in (
      select b.id from bookings b
      join members m on m.id = b.member_id
      where m.user_id = auth.uid()
    )
  );

-- Intentionally NO policies (service-role only):
--   businesses, techs, booking_transitions, stripe_events, outbox,
--   dead_letters, ai_events, telegram_chats, sync_log.

-- Access-notes audit stamp: who changed the gate code, and when (R1 AC).
create or replace function stamp_access_notes()
returns trigger language plpgsql as $$
begin
  if new.access_notes is distinct from old.access_notes then
    new.access_notes_updated_by := auth.uid();
    new.access_notes_updated_at := now();
  end if;
  return new;
end $$;

create trigger properties_access_notes_stamp
  before update of access_notes on properties
  for each row execute function stamp_access_notes();
