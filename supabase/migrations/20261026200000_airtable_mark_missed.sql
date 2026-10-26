-- R3/R6, ADR-01 amendment: a fenced office action, not editable booking status.
create table public.booking_missed_actions (
  booking_id uuid primary key references public.bookings(id),
  airtable_record_id text not null check (airtable_record_id ~ '^rec[A-Za-z0-9]+$'),
  staff_id text not null check (staff_id ~ '^usr[A-Za-z0-9]+$'),
  staff_name text not null check (length(btrim(staff_name)) between 1 and 200),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  at timestamptz not null default now()
);
alter table public.booking_missed_actions enable row level security;
revoke all on public.booking_missed_actions from public, anon, authenticated;
grant all on public.booking_missed_actions to service_role;

create function public.mark_visit_missed(
  p_booking_id uuid, p_reason text, p_airtable_record_id text,
  p_staff_id text, p_staff_name text
) returns public.bookings language plpgsql security invoker set search_path = public as $$
declare
  v_booking bookings;
  v_action booking_missed_actions;
  v_reason text := regexp_replace(p_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_staff_name text := regexp_replace(p_staff_name, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if p_reason is null or length(v_reason) not between 1 and 1000 then
    raise exception 'missed_reason_required' using errcode = '22023';
  end if;
  if p_airtable_record_id is null or p_airtable_record_id !~ '^rec[A-Za-z0-9]+$'
     or p_staff_id is null or p_staff_id !~ '^usr[A-Za-z0-9]+$'
     or p_staff_name is null or length(v_staff_name) not between 1 and 200 then
    raise exception 'missed_staff_identity_required' using errcode = '22023';
  end if;
  -- Serialize against scheduling, completion, cancellation and duplicate runs.
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if v_booking.status = 'no_show' then
    select * into v_action from booking_missed_actions where booking_id = p_booking_id;
    if found and v_action.reason = v_reason
       and v_action.airtable_record_id = p_airtable_record_id
       and v_action.staff_id = p_staff_id and v_action.staff_name = v_staff_name then
      return v_booking;
    end if;
    raise exception 'missed_visit_already_recorded' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'missed_visit_requires_confirmed' using errcode = 'P0001';
  end if;
  if v_booking."window" is null or isempty(v_booking."window")
     or lower_inf(v_booking."window") or upper_inf(v_booking."window")
     or not isfinite(lower(v_booking."window")) or not isfinite(upper(v_booking."window"))
     or upper(v_booking."window") > clock_timestamp() then
    raise exception 'missed_visit_requires_elapsed_window' using errcode = 'P0001';
  end if;
  insert into booking_missed_actions(booking_id,airtable_record_id,staff_id,staff_name,reason)
  values(p_booking_id,p_airtable_record_id,p_staff_id,v_staff_name,v_reason);
  -- Existing transition owns the status audit and durable outbox in this transaction.
  select * into v_booking from transition_booking(p_booking_id,'no_show','office:airtable');
  return v_booking;
end;
$$;
revoke all on function public.mark_visit_missed(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.mark_visit_missed(uuid,text,text,text,text) to service_role;
