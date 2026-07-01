# Chaos run (Day 9 — the day the guarantees get earned)

Proves M3: **zero lost events, zero duplicates** across 50 bookings with
injected failures. The output log is committed as evidence and referenced
from the top-level README.

## Procedure
1. `supabase db reset` — clean world.
2. `npm run chaos -- --phase inject` — creates 50 bookings via server-action
   path at randomized intervals; tags each with a chaos marker.
3. Mid-run, in this order:
   - kill the n8n container/process for 90s, restart (outbox sweep must drain);
   - replay 5 captured Stripe events verbatim (`stripe events resend` or fixture POSTs) — idempotency ledger must swallow them;
   - flip the Airtable token to an invalid value for 60s, restore — retries then success, or dead-letter + alert, never silence;
   - double-tap two Telegram Approve buttons — second tap reports "already handled."
4. `npm run chaos -- --phase verify` — asserts:
   - every chaos booking has exactly one Airtable record (query by marker);
   - outbox: `processed_at` set on all rows OR row present in `dead_letters` with a Telegram alert logged — no third state;
   - member email count == qualifying transitions (no duplicates);
   - every `payments.status='paid'` joins to a `stripe_events` row.
5. Commit the verify output to `scripts/chaos/runs/<date>.log`.

## Status
`run.ts` is a Day-9 stub — inject/verify phases sketched, marked TODO.
The procedure above is the contract; the script automates it.
