-- 0019_decouple_delivery_legs.sql — decouple the Airtable and Telegram delivery legs (#20)
--
-- Before: the outbox-consumer marked a row `processed` only when BOTH the
-- Airtable upsert AND the Telegram ping succeeded in one pass. So the
-- Railway->Telegram TCP flake (#20) re-ran the (idempotent) Airtable upsert and
-- BLOCKED the row from completing even though its data had already landed in
-- Airtable — a flaky Telegram leg could dead-letter a row whose projection was
-- already correct.
--
-- After: the two legs are tracked independently (airtable_delivered_at,
-- telegram_delivered_at), and a BEFORE UPDATE trigger stamps processed_at once
-- BOTH are set. Completion is atomic and DB-owned, so the n8n consumer only has
-- to mark each leg as it succeeds. A Telegram-only failure no longer undoes or
-- blocks the Airtable projection: airtable_delivered_at is durable, and if the
-- Telegram leg exhausts its attempts the row dead-letters on that leg alone
-- (Airtable stays delivered, the office board stays correct).
--
-- This does NOT add a delivery channel — Telegram remains the owner's one ping
-- ("owner chose one channel"); it only removes the coupling that let a Telegram
-- flake block a landed row. processed_at keeps its meaning: fully delivered.
--
-- Traces: R5 (delivery guarantees) / ADR-02 / never-cut #3 / closes #20.

alter table outbox add column airtable_delivered_at timestamptz;
alter table outbox add column telegram_delivered_at timestamptz;

-- Completion is DB-owned: processed_at is stamped the moment both legs are
-- delivered. BEFORE UPDATE so the same statement that sets the second leg also
-- stamps processed_at — one round-trip, no window where both legs are done but
-- the row still reads unprocessed. Only ever moves forward (never clears).
create or replace function set_outbox_processed()
returns trigger
language plpgsql
as $$
begin
  if new.processed_at is null
     and new.airtable_delivered_at is not null
     and new.telegram_delivered_at is not null then
    new.processed_at := now();
  end if;
  return new;
end $$;

create trigger outbox_processed_when_both_legs
  before update on outbox
  for each row
  execute function set_outbox_processed();
