-- 0014_expire_stale_deposits.sql — automatic expiry of 24h stale deposit holds
-- When a member requests a repair and is approved for a deposit, the booking
-- enters awaiting_deposit. If the payment is never confirmed (verified webhook),
-- the booking MUST auto-expire after 24 hours: status -> cancelled, payment ->
-- expired (R4 AC #5). The constraint applies to all stale holds in one sweep.
--
-- Why SECURITY DEFINER: the system:expiry actor must be set in transaction
-- context before any status write, so the audit (0002 trigger, booking_transitions)
-- records who expired it. SECURITY DEFINER ensures this runs as service_role
-- (trusted code) and cannot be invoked by the member or anon (RLS would allow
-- arbitrary cancellations). set_config() is transaction-local by design; we set
-- it once at the top, and all UPDATEs inside the loop inherit it.
--
-- Why the loop is safe: the legal graph (0002) permits awaiting_deposit ->
-- cancelled. The status trigger (0002 enforce_booking_transition) validates
-- each UPDATE independently and audits it. The payment update touches only
-- 'pending' rows (paid/refunded MUST NOT regress). The outbox trigger
-- (0004 emit_booking_event) fires once per booking, deduping on (id:cancelled),
-- and guarantees one outbox row per expiry in the same transaction.
-- Idempotent: if the query returns no rows, the function returns 0 and
-- n8n retries harmlessly.

create or replace function expire_stale_deposits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_booking record;
begin
  perform set_config('cabana.actor', 'system:expiry', true);

  for v_booking in
    select id from bookings
    where status = 'awaiting_deposit'
      and created_at < now() - interval '24 hours'
  loop
    update bookings set status = 'cancelled' where id = v_booking.id;
    update payments set status = 'expired'
      where booking_id = v_booking.id and status = 'pending';
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- Service-role only: expiry is system-triggered and must never be callable
-- by application code. The RPC gate (PostgREST, 0009) wraps this in
-- authentication context, but this function's definer posture prevents
-- access from any role except service_role.
revoke execute on function expire_stale_deposits() from public, anon, authenticated;
grant execute on function expire_stale_deposits() to service_role;
