-- Refresh only the fictional repair description (R1 / ADR-10).
-- Preserve the deployed reset definition and privileges; change only its
-- sample-text constant. Do not invoke the reset or alter active booking states.
do $migration$
declare
  definition text := pg_get_functiondef('public.reset_demo_member()'::regprocedure);
begin
  if position('Heater will not ignite. Pentair MasterTemp, error code and everything. Gate code on file.' in definition) > 0 then
    execute replace(definition,
      'Heater will not ignite. Pentair MasterTemp, error code and everything. Gate code on file.',
      'My Pentair MasterTemp heater will not ignite. The gate code is on file.');
  elsif position('My Pentair MasterTemp heater will not ignite. The gate code is on file.' in definition) = 0 then
    raise exception 'Unexpected demo fixture: review reset_demo_member before updating its sample text';
  end if;
end
$migration$;

-- Touch only the canonical sample if it still contains the original text.
update public.bookings
set request_text = 'My Pentair MasterTemp heater will not ignite. The gate code is on file.'
where id = 'd1000000-0000-4000-8000-000000000003'::uuid
  and member_id = 'a1000000-0000-4000-8000-000000000001'::uuid
  and request_text = 'Heater will not ignite. Pentair MasterTemp, error code and everything. Gate code on file.';
