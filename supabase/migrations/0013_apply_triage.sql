-- 0013_apply_triage.sql — atomic triage application and status routing
-- A member submits a free-text request; the service-role calls Haiku triage
-- to route it to auto_qualified (repair → awaiting_deposit; one_off_clean → needs_review)
-- or needs_review. The triage result must be stored and the status updated in one
-- transaction, with the actor set before the trigger fires, so the audit (0002)
-- records who/what decided. The kind and deposit_required flag are set together
-- (deposit_required=true only for awaiting_deposit status).

create or replace function apply_triage(
  p_booking_id uuid,
  p_kind text,
  p_triage jsonb,
  p_to_status text,
  p_actor text
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  -- Same allowlist as transition_booking (0008); see lib/supabase/admin.ts.
  if p_actor not in ('member', 'owner:telegram', 'office:airtable',
                     'system:stripe', 'system:expiry', 'system') then
    raise exception 'unknown actor: %', p_actor
      using errcode = 'P0001',
            hint = 'See the actor list in CLAUDE.md; a new channel needs a migration.';
  end if;

  perform set_config('cabana.actor', p_actor, true);

  update bookings
  set kind = p_kind,
      triage = p_triage,
      status = p_to_status,
      deposit_required = (p_to_status = 'awaiting_deposit')
  where id = p_booking_id
  returning * into v_booking;

  if not found then
    raise exception 'booking not found: %', p_booking_id
      using errcode = 'P0002';
  end if;

  return v_booking;
end $$;

-- Service-role only: triage is server-side (Haiku in an edge function),
-- and the transition guard (0002, 0007) validates the status change in the
-- same transaction where the actor is set.
revoke execute on function apply_triage(uuid, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function apply_triage(uuid, text, jsonb, text, text) to service_role;
