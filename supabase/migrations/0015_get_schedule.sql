-- 0015_get_schedule.sql — schedule query by day/week in business timezone
-- R7: Telegram /today and /week commands need to fetch bookings in the right time span,
-- calculated in the business's local timezone (not UTC). The range math (date boundaries)
-- must live in SQL so it's timezone-correct; the edge function only formats the result
-- for display. This RPC returns a stable, service-role-only view of scheduled bookings
-- for a named span ('today' or 'week'), with all data resolved and formatted for display.
--
-- IANA timezone is stored in businesses.tz (default 'America/New_York'). The trick:
-- PostgreSQL's date_trunc works on timestamptz, but "truncate at midnight in timezone tz"
-- requires converting to wall-clock time in tz, truncating, then converting back to timestamptz.

create or replace function get_schedule(p_span text)
returns table(
  booking_id uuid,
  status text,
  kind text,
  win_start timestamptz,
  win_end timestamptz,
  tech text,
  member text,
  address text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_range tstzrange;
begin
  -- Resolve the business timezone. In v1, exactly one business exists; fall back to NY.
  select tz into v_tz from businesses order by created_at limit 1;
  v_tz := coalesce(v_tz, 'America/New_York');

  -- Compute the start of today/week in the business's wall-clock time, then convert back
  -- to timestamptz so we can query the "window" tstzrange.
  if p_span = 'today' then
    -- Midnight (start of today) in the business's timezone, as a wall-clock timestamp,
    -- then convert back to UTC timestamptz.
    v_start := (date_trunc('day', now() at time zone v_tz)::date) at time zone v_tz;
    v_end := v_start + interval '1 day';
  elsif p_span = 'week' then
    -- Monday at midnight in the business's timezone.
    v_start := (date_trunc('week', now() at time zone v_tz)::date) at time zone v_tz;
    v_end := v_start + interval '7 days';
  else
    raise exception 'invalid span: % (use ''today'' or ''week'')', p_span
      using errcode = '22023';
  end if;

  v_range := tstzrange(v_start, v_end);

  -- Return bookings that fall in the range and have a window (exclude unscheduled).
  return query
    select
      b.id,
      b.status,
      b.kind,
      lower(b."window"),
      upper(b."window"),
      coalesce(t.display_name, 'Unassigned'),
      coalesce(m.full_name, ''),
      coalesce(p.address, '')
    from bookings b
    left join techs t on b.tech_id = t.id
    left join members m on b.member_id = m.id
    left join properties p on b.property_id = p.id
    where b."window" is not null
      and b."window" && v_range
      and b.status <> 'cancelled'   -- a cancelled slot is off the schedule
    order by lower(b."window") nulls last;
end $$;

-- Service-role only: used by Telegram webhook to fetch and display schedules.
revoke execute on function get_schedule(text) from public, anon, authenticated;
grant execute on function get_schedule(text) to service_role;
