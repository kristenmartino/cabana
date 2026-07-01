-- 0007_booking_insert_transition.sql
-- Fix: BEFORE INSERT on bookings logged to booking_transitions before the parent
-- row existed, violating booking_transitions_booking_id_fkey during seed/reset.
-- INSERT audit moves to AFTER INSERT; UPDATE validation stays BEFORE UPDATE.

create or replace function enforce_booking_transition()
returns trigger language plpgsql as $$
declare
  v_actor text := coalesce(nullif(current_setting('cabana.actor', true), ''), 'system');
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := (old.status, new.status) in (
    ('requested','needs_review'),
    ('requested','awaiting_deposit'),
    ('requested','cancelled'),
    ('needs_review','awaiting_deposit'),
    ('needs_review','scheduled'),
    ('needs_review','cancelled'),
    ('awaiting_deposit','scheduled'),
    ('awaiting_deposit','cancelled'),
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

create or replace function log_booking_insert_transition()
returns trigger language plpgsql as $$
declare
  v_actor text := coalesce(nullif(current_setting('cabana.actor', true), ''), 'system');
begin
  insert into booking_transitions (booking_id, from_status, to_status, actor)
  values (new.id, null, new.status, v_actor);
  return new;
end $$;

drop trigger if exists booking_transition_guard on bookings;

create trigger booking_transition_guard
  before update of status on bookings
  for each row execute function enforce_booking_transition();

create trigger booking_insert_transition_log
  after insert on bookings
  for each row execute function log_booking_insert_transition();
