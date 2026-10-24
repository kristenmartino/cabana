-- Date-only edits must reach the same durable delivery pipeline as status edits.
create function public.assign_visit_window(
  p_booking_id uuid, p_start timestamptz, p_end timestamptz, p_actor text
) returns public.bookings language plpgsql security invoker set search_path = public as $$
declare v_booking bookings;
begin
  if p_actor not in ('owner:telegram', 'office:airtable') or p_actor is null then
    raise exception 'invalid scheduling actor' using errcode = 'P0001';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start)
    or not isfinite(p_end) or p_end <= p_start then
    raise exception 'invalid visit window' using errcode = '22023';
  end if;
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if v_booking.status not in ('scheduled', 'confirmed') then
    raise exception 'booking is not ready for scheduling' using errcode = 'P0001';
  end if;
  perform set_config('cabana.actor', p_actor, true);
  update bookings set "window" = tstzrange(p_start, p_end, '[)')
  where id = p_booking_id returning * into v_booking;
  return v_booking;
end;
$$;
revoke all on function public.assign_visit_window(uuid,timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.assign_visit_window(uuid,timestamptz,timestamptz,text) to service_role;

create function public.emit_visit_window_event()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new."window" is distinct from old."window" then
    insert into outbox(topic,dedupe_key,payload) values (
      'booking.visit_window_changed', new.id::text || ':visit:' || gen_random_uuid()::text,
      jsonb_build_object('booking_id',new.id,'kind',new.kind,'member_id',new.member_id,
        'from_window',old."window"::text,'to_window',new."window"::text,
        'actor',coalesce(nullif(current_setting('cabana.actor',true),''),'system'))
    );
  end if;
  return new;
end;
$$;
create trigger booking_visit_window_emit after update of "window" on public.bookings
for each row execute function public.emit_visit_window_event();
