-- 0017_reset_demo_member.sql — periodic reset of the demo member for testing
-- The demo member (Ken Alvarez, a1000000-0000-4000-8000-000000000001) gets
-- reset every 30 minutes by n8n to return to a known state. This function
-- deletes all bookings, payments, and outbox entries for the demo member
-- and re-inserts the canonical pair (awaiting_deposit repair, no_show plan_visit)
-- from seed.sql.
--
-- Why SECURITY DEFINER: the demo reset is system-triggered and must never be
-- callable by application code. Like expire_stale_deposits (0014), it runs as
-- service_role (trusted code) and cannot be invoked by the member or anon.
-- set_config() is transaction-local by design; we set it once at the top, and
-- all subsequent writes inherit it so booking_transitions audits them correctly.
--
-- Why the order matters: dead_letters references outbox; outbox entries
-- (payload.booking_id) reference bookings; payments and booking_transitions
-- reference bookings directly. We delete in reverse FK order.
--
-- Idempotent: if no bookings exist for the demo member, the function returns 0
-- and n8n retries harmlessly. The re-inserted bookings use fixed UUIDs
-- (d1...03, d1...08) so repeated calls do not duplicate — a conflict on the
-- primary key would indicate a crash mid-reset, which is operator-visible.

create or replace function reset_demo_member()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_demo_member_id uuid := 'a1000000-0000-4000-8000-000000000001'::uuid;
  v_booking_ids uuid[];
begin
  perform set_config('cabana.actor', 'system', true);

  -- Collect all booking IDs for the demo member so we can cascade delete.
  select array_agg(id) into v_booking_ids
  from bookings
  where member_id = v_demo_member_id;

  -- If no bookings exist, return early (idempotent).
  if v_booking_ids is null or array_length(v_booking_ids, 1) = 0 then
    return 0;
  end if;

  -- Delete dead_letters rows for outbox entries tied to demo bookings.
  delete from dead_letters
  where outbox_id in (
    select id from outbox
    where payload ->> 'booking_id' = any(v_booking_ids::text[])
  );

  -- Delete outbox rows for demo bookings.
  delete from outbox
  where payload ->> 'booking_id' = any(v_booking_ids::text[]);

  -- Delete payments for demo bookings.
  delete from payments
  where booking_id = any(v_booking_ids);

  -- Delete booking transitions for demo bookings.
  delete from booking_transitions
  where booking_id = any(v_booking_ids);

  -- Delete the bookings themselves.
  delete from bookings
  where id = any(v_booking_ids);

  v_count := array_length(v_booking_ids, 1);

  -- Re-insert the two canonical bookings from seed.sql.
  -- 1) awaiting_deposit repair with Marcus, 3 days from now (keeps it fresh
  --    relative to expire_stale_deposits' 24h cutoff).
  insert into bookings (
    id, business_id, property_id, member_id, tech_id, kind, status,
    request_text, deposit_required, "window", created_at
  ) values (
    'd1000000-0000-4000-8000-000000000003'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid,
    'c1000000-0000-4000-8000-000000000001'::uuid,
    v_demo_member_id,
    '7e000000-0000-4000-8000-000000000001'::uuid,
    'repair',
    'awaiting_deposit',
    'Heater will not ignite. Pentair MasterTemp, error code and everything. Gate code on file.',
    true,
    tstzrange(date_trunc('hour', now()) + interval '3 days',
              date_trunc('hour', now()) + interval '3 days 1 hour'),
    now()
  );

  -- Re-insert the deposit payment ($75) for the awaiting_deposit booking.
  insert into payments (id, booking_id, amount_cents, status)
  values (
    'e1000000-0000-4000-8000-000000000003'::uuid,
    'd1000000-0000-4000-8000-000000000003'::uuid,
    7500,
    'pending'
  );

  -- 2) no_show plan_visit with Jenna, 7 days ago (demonstrates a past no-show).
  insert into bookings (
    id, business_id, property_id, member_id, tech_id, kind, status,
    "window", created_at
  ) values (
    'd1000000-0000-4000-8000-000000000008'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid,
    'c1000000-0000-4000-8000-000000000001'::uuid,
    v_demo_member_id,
    '7e000000-0000-4000-8000-000000000002'::uuid,
    'plan_visit',
    'no_show',
    tstzrange(date_trunc('hour', now()) - interval '7 days',
              date_trunc('hour', now()) - interval '7 days' + interval '45 minutes'),
    now()
  );

  -- Update the demo member's property access_notes to the canonical seed value.
  update properties
  set access_notes = 'Gate 4482. Dog (friendly lab, name is Biscuit).'
  where member_id = v_demo_member_id;

  return v_count;
end $$;

-- Service-role only: demo reset is system-triggered and must never be
-- callable by application code.
revoke execute on function reset_demo_member() from public, anon, authenticated;
grant execute on function reset_demo_member() to service_role;
