-- 0018_dead_letter_terminal.sql — make dead-letter a terminal state
-- Bug #23: n8n dead-letters a row (POST to dead_letters table) but never marked
-- the outbox row as processed. The sweep (0004) fetches WHERE processed_at is null,
-- so dead-lettered rows re-retry forever (~800 duplicate dead_letters, infinite
-- alerts, attempts 19–22+). Fix: outbox.dead_lettered_at (timestamptz, nullable)
-- signals terminal DLQ state. The sweep skips rows where dead_lettered_at IS NOT NULL.
--
-- Redrive: operator manually clears dead_lettered_at and resets attempts to 0
-- to re-queue the row. The dead-letter INSERT and alert remain (diagnostics),
-- but the row stops looping once marked terminal.
--
-- Traces: R5 (outbox guarantee) / ADR-02 (delivery contract) / never-cut #3 /
-- closes #23.

alter table outbox add column dead_lettered_at timestamptz;

-- The sweep (0004 outbox_unprocessed_idx) finds unprocessed rows and re-tries them.
-- A row is "done" when:
--   - processed_at IS NOT NULL (delivered to n8n workflow), OR
--   - dead_lettered_at IS NOT NULL (dead-lettered, pending manual redrive)
-- Update the index to skip both terminal states.

drop index outbox_unprocessed_idx;
create index outbox_unprocessed_idx on outbox (id)
  where processed_at is null and dead_lettered_at is null;
