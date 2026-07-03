-- 0012_member_request.sql — atomic member-submitted request insert
-- A member submits a free-text request from the portal. The insert must be
-- audited as actor 'member', but set_config('cabana.actor', …) is txn-local and
-- PostgREST runs each call in its own transaction — so an admin-client insert
-- would fall back to 'system' (same reason transition_booking exists, 0008).
-- One SECURITY DEFINER function = one transaction: set actor + insert.
--
-- Scope note: this is the Phase-2 basic path — the booking lands as 'requested'
-- with a placeholder kind. Day-5 intake (R2) wraps this with Haiku triage that
-- sets the real kind/urgency and routes to awaiting_deposit/needs_review.

create or replace function create_member_request(
  p_business_id uuid,
  p_property_id uuid,
  p_member_id uuid,
  p_request_text text
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  perform set_config('cabana.actor', 'member', true);
  insert into bookings (business_id, property_id, member_id, kind, status, request_text)
  values (p_business_id, p_property_id, p_member_id, 'repair', 'requested', p_request_text)
  returning * into v_booking;
  return v_booking;
end $$;

revoke execute on function create_member_request(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function create_member_request(uuid, uuid, uuid, text) to service_role;
