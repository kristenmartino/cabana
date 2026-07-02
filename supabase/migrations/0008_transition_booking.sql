-- 0008_transition_booking.sql — atomic, actor-attributed status transitions
-- Bug: set_actor() (0006) is transaction-local by design, but PostgREST wraps
-- every HTTP request in its own transaction — so rpc('set_actor') followed by
-- .update() from supabase-js spans TWO transactions. The setting was gone
-- before the update ran, and the transition guard (0007) fell back to
-- actor 'system': every status write through the API was mis-attributed.
-- Fix: one function = one transaction. set_config + UPDATE together, so the
-- guard sees the actor. The trigger still owns legality (legal graph, 0007)
-- and the audit write; the outbox emit (0004) fires in the same transaction.
-- set_actor() stays for contexts where caller and write share a transaction
-- (seed.sql, psql, pg test clients) — it is just never useful over PostgREST.

create or replace function transition_booking(
  p_booking_id uuid,
  p_to_status text,
  p_actor text
) returns bookings language plpgsql as $$
declare
  v_booking bookings;
begin
  -- Same allowlist as the Actor union in lib/supabase/admin.ts ('seed' is
  -- seed.sql-only and never comes through this function).
  if p_actor not in ('member', 'owner:telegram', 'office:airtable',
                     'system:stripe', 'system:expiry', 'system') then
    raise exception 'unknown actor: %', p_actor
      using errcode = 'P0001',
            hint = 'See the actor list in CLAUDE.md; a new channel needs a migration.';
  end if;

  perform set_config('cabana.actor', p_actor, true);

  update bookings set status = p_to_status
  where id = p_booking_id
  returning * into v_booking;

  if not found then
    raise exception 'booking not found: %', p_booking_id
      using errcode = 'P0002';
  end if;

  return v_booking;
end $$;

-- Service-role only, same posture as set_actor (0006).
revoke execute on function transition_booking(uuid, text, text) from anon, authenticated;
