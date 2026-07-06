# Chaos Run (Day 9 — the day the guarantees get earned)

Proves **M3: zero lost events, zero duplicates** across 50 bookings with injected failures.
The output log is committed as evidence and referenced from the top-level README.

Key departure from the original plan: **no database reset**. The pipeline under test
(Railway n8n + Airtable + Telegram) is wired to the live cloud project. Resetting would
wipe demo data AND desync Airtable (which cannot be reset). Instead, marker-scoped injection
and targeted cleanup preserve every assertion while leaving the demo intact.

## What This Proves

Four M3 guarantees, tested in concert:

1. **Exactly one Airtable record per booking.** Query by marker; duplicates surface immediately.
2. **No lost outbox rows.** Every row is either `processed_at` set, or in `dead_letters` with alert logged. No third state.
3. **No duplicate events.** Outbox `dedupe_key` uniqueness prevents re-emission; Stripe `stripe_events` idempotency key stops double-charges.
4. **Webhook authority over UI.** Payment truth flows from Stripe `stripe_events` ledger, not success redirects. Replayed webhooks are swallowed.

The human interventions (n8n kill/restart, Airtable token break, Telegram double-tap, Stripe replays)
prove the system survives real chaos without losing or duplicating work.

## Prerequisites

1. **`.env.chaos` at repo root** (git-ignored via `.env.*`)  
   Required vars:
   - `NEXT_PUBLIC_SUPABASE_URL` — cloud Supabase project URL (from dashboard)
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (Settings → API)
   - `ANTHROPIC_API_KEY` — for triage calls (from console)
   - `AIRTABLE_PAT` — personal access token (Airtable account settings, must have `data.records:read` and `data.records:write` scopes)
   - `AIRTABLE_BASE_ID` — base id (required; the Cabana base id `appqBebMTUb0qsB1f` — same value the
     n8n workflows use)

2. **Live services running and connected:**
   - Supabase cloud project: seeded with members, properties, service_zips
   - Railway n8n: Bookings, Airtable, and Telegram workflows active
   - Airtable base: Bookings table with `request_text` field (for marker filtering)
   - Telegram: bot webhook active, owner's chat in allowlist, phone at hand for double-taps

3. **Stripe test mode:** the dashboard webhook endpoint pointing at the Supabase edge function
   (`https://<ref>.supabase.co/functions/v1/stripe-webhook`) — already registered since Gate 2

## The Run — a Human+Script Duet (Timeline)

| Time | Actor | Action | Why |
|------|-------|--------|-----|
| T+0 | script | `npm run chaos -- --phase inject` | creates 50 bookings via real server-action path, each tagged with `[chaos:<runId>]`; saves run state |
| ~2m in | human | **RAILWAY:** stop n8n service; wait 90s; start it | forces outbox sweep to drain any backlog before restart |
| ~4m in | human | **STRIPE:** open test mode → Webhooks → Events; find `checkout.session.completed` events from Gate-2 phase; click Resend ~5 times total | injects duplicate events; `stripe_events` idempotency must swallow them |
| ~5m in | human | **N8N:** open Airtable credential; append 'BROKEN' to the token value; wait 60s; restore exact original | breaks auth; n8n must retry then succeed, or dead-letter + Telegram alert; never silent failure |
| ~6m in | human | **TELEGRAM:** double-tap the Approve button on TWO of the chaos booking pings (visible in your chat) | second tap must report "already handled"; idempotency key prevents duplicate status writes |
| after inject completes, dust settles (~8-10m total) | script | `npm run chaos -- --phase verify` | polls the drain; asserts four M3 guarantees; exits 0 (pass) or 1 (fail); writes log |

## Expected Behavior by Intervention

### N8n restart (T~2m)
- Outbox rows created before restart: should have `processed_at` set or be in `dead_letters` with Telegram alert (if Airtable failed mid-run)
- Booking statuses should reflect successful transitions (all rows either moved to next state or stuck in `needs_review` if triage failed)

### Stripe replays (T~4m)
- Duplicate `checkout.session.completed` deliveries carry the SAME event id; `stripe_events.id` is the
  primary key, so the webhook's ledger insert conflicts, sees `processed_at` already set, and acks
  "already processed" without touching payments or bookings (the exact behavior the webhook test suite pins)
- The order of replays and n8n restarts is intentional: tests both idempotency and process resilience

### Airtable token break (T~5m)
- During the 60s outage, n8n Airtable calls fail with 401
- n8n retry logic kicks in with backoff; after token restore, next attempt succeeds
- If max retries exhaust, dead-letter row appears + Telegram alert sent
- Post-fix: the workflow resumes and completes successfully

### Telegram double-tap (T~6m)
- First tap: normal Approve flow → status transition → Airtable re-projection
- Second tap: the guard (0007) treats the same-status re-transition as a no-op — the bot re-answers
  "Approved" and no duplicate audit row is written (a genuinely stale tap gets "already handled" via P0001)
- `booking_transitions` has exactly ONE row for the transition regardless of taps — that is what verify's A3 asserts

## Running the Chaos Sequence

### Step 1: Inject
```bash
npm run chaos -- --phase inject
```
Output: 50 bookings created, state saved to `scripts/chaos/runs/<runId>.state.json`.
The script prints a `[chaos:<timestamp>]` marker; use it to track bookings through logs.

### Step 2: Human Interventions (while script waits for you)
Follow the timeline table above. The chaos bookings are visible in:
- Airtable: filter by marker in `request_text`
- n8n: execution logs during the run
- Telegram: bot pings for Approve buttons (if status reaches that point)
- Stripe dashboard: test mode → Events → filter by timestamp

Take notes on failures, retries, and alerts. This is the evidence that the system handled chaos.

### Step 3: Verify
```bash
npm run chaos -- --phase verify
```
After interventions complete and the pipeline has settled (typically 2-3 min post-last human action).

Output: four assertions, pass/fail for each, a summary log written to `scripts/chaos/runs/<runId>.log`.
Exit code: 0 (all pass) or 1 (any fail).

Example log (shape, not real numbers):
```
=== CHAOS RUN LOG (M3 evidence) ===
Verified at: 2026-07-06T21:40:12.481Z
Run ID: cx20260706T2110
Marker: [chaos:cx20260706T2110]
Injected at: 2026-07-06T21:10:03.112Z
Bookings: 50 (awaiting_deposit: 31, needs_review: 19)
Drain: 214s

[PASS] A1: Airtable exactly-once
  50 marker records for 50 bookings — missing: 0, duplicated: 0, outside chaos set: 0
[PASS] A2: Outbox no-third-state
  102 chaos outbox rows — limbo: 0, bookings with ZERO outbox rows: 0, dead-lettered: 2 [outbox ids 61, 74 — cross-check the Telegram/email alert fired for each]
[PASS] A3: No duplicate delivery
  duplicate booking.created events: 0, duplicate (booking,to_status) transitions: 0 (C3: member-email leg not built; 0 emails expected and 0 sent)
[PASS] A4: Payment idempotency
  2 paid payments checked, 0 violations

M2 submit->processed over 100 chaos rows: p50 4.2s, p95 96.1s (includes the 90s n8n kill window — the guarantee under test is delivery, not latency)
```

### Step 4: Cleanup (Optional)
```bash
npm run chaos -- --phase cleanup
```
Deletes all chaos bookings, outbox rows, and Airtable records by marker.
Preserves: `ai_events` table (historical audit), committed logs in `scripts/chaos/runs/`.

Useful to repeat the run on the same live stack without accumulating test data.

## Assertions in Detail

### Assertion 1: Airtable exactly-once (per booking, both directions)
Queries Airtable with `FIND('<marker>', {request_text})`, paginated, then checks **per booking** — a
total-count comparison would let one lost booking plus one duplicated booking cancel out to a false pass.
- **Pass:** every chaos booking has exactly one Airtable record, and no marker record exists outside the chaos set
- **Fail:** any booking with 0 records (lost), >1 (duplicated), or a stray marker record

### Assertion 2: Outbox Processing
Fetches outbox rows by booking_id; for each, checks:
- `processed_at` is not null (n8n nudge or sweep marked it done), OR
- row exists in `dead_letters` with a `workflow` and `error` (dead-lettered with alert logged)
- **Pass:** all rows in one state or the other; no rows stuck in limbo
- **Fail:** any row with null `processed_at` AND no dead_letter entry (lost event, no alert)

Note: If n8n is slow, outbox rows may still be unprocessed at verify time. Increase the wait time or check n8n logs.

### Assertion 3: No duplicate delivery
The outbox `dedupe_key` column is database-unique, so asserting its uniqueness would be a tautology. The
real duplicate-work signals under chaos are checked instead:
- **exactly one `booking.created` outbox event per chaos booking** (a re-emit would mean duplicate downstream work)
- **no duplicated `(booking_id, to_status)` pair in `booking_transitions`** — a replayed webhook or double-tap
  that slipped past the guard's no-op protection would appear here
- **C3 note:** the member-email leg is not built (deferred cut), so the original "email count == qualifying
  transitions" assertion is adapted to the above; 0 member emails expected and 0 sent — stated in the log.

### Assertion 4: Stripe Event Verification
For each payment with `status='paid'`, checks that `payments.stripe_checkout_session_id` has a matching row in `stripe_events` (query by `payload->'data'->'object'->>'id'`).
- **Pass:** all paid payments have a stripe_events entry
- **Fail:** any paid payment without corresponding event (order processed without proof, payment never verified)

## Troubleshooting

### Timeout: Rows Stuck in Limbo
- Check n8n execution logs: are the Bookings, Airtable, Telegram workflows hanging or erroring?
- Check Railway logs: any CPU/memory limits or deployment issues?
- If Airtable 401: did you forget to restore the token after the break test?
- If Telegram failures: check the bot's webhook delivery logs (n8n UI → Telegram trigger history)
- **Fix:** manually trigger n8n executions, fix the root error, and re-run verify

### Airtable: 404 or 401
- 404: `AIRTABLE_BASE_ID` is wrong or the base is deleted
- 401: `AIRTABLE_PAT` has expired, was revoked, or doesn't have `data.records:read/write` scopes
- Fix: update `.env.chaos` and re-run

### Stripe Events Not Matched
- Check Stripe dashboard: did the `checkout.session.completed` event fire?
- Check `payments` table: does the booking have a `stripe_checkout_session_id`?
- Check `stripe_events` table: does the event exist? (search by session id in `payload`)
- If event exists but payment doesn't: the webhook may have fired before the booking was created (race condition in the test; increase the delay in inject phase)

### Telegram Idempotency Fails (Double-Tap Doesn't Say "Already Handled")
- Check the bot's webhook logs in n8n: did the second callback arrive?
- Check booking transitions: are there two transitions to the same status?
- The idempotency check is in the Telegram edge function; if it's not working, review that code and the dedupe key logic

### Airtable Sync Gaps After N8n Restart
- Expected if the sync lag was long and you restarted n8n early
- Wait 2-3 min after restart before running verify to let outbox sweep drain
- Alternatively, manually trigger n8n's outbox poller to flush any remaining rows

## Interpretation: What Passes Means

A green verify log means:
- **Zero lost:** all 50 bookings exist in Airtable; outbox has no orphaned rows
- **Zero duplicates:** dedupe keys are unique; no status transition re-applied; no Airtable rows double-written; Stripe payments matched once
- **Resilience:** the system survived n8n restart, Airtable outage, Stripe duplicates, and Telegram double-taps without data loss or corruption
- **Idempotency:** webhooks can be replayed; the ledger absorbs them; the UI is eventually consistent

A red log names the specific failure: e.g., "Airtable 45/50 records", or "Outbox 5 rows in limbo".
The test is **fail-fast**: the first assertion that fails names the root issue (usually n8n hung or alert missing).

## Logs and Evidence

Logs are written to `scripts/chaos/runs/`:
- `<runId>.state.json` — internal state from inject phase (loaded by verify)
- `<runId>.log` — summary from verify phase (committed as evidence)

Example: commit `scripts/chaos/runs/cx20260706T2110.log` (and its `.state.json`) to the repo.

These logs are the proof that M3 held on a specific run; they're also the starting point for
any post-incident investigation.

## Known Flakes and Workarounds

**Railway <-> Telegram latency (Issue #20):** Telegram callbacks sometimes take 30-60s to arrive after n8n sends them. This is expected; if you see Telegram dead-letters, wait a few minutes and re-run verify. The edge function's idempotency key will prevent double-transitions even if the callback arrives late.

**Stripe test mode webhook delivery:** If your Vercel deployment or local tunnel isn't reachable, Stripe queues retries. Check your function logs and Stripe dashboard event history.

**N8n CPU spikes after restart:** If you see timeouts immediately after restart, give n8n 30-60s to settle before running verify.

## Daily Use

Day 9 (once): run the full sequence, commit the log, move on.

Ad-hoc (debugging): you can re-run inject with a different marker to test a specific flow,
or re-run verify manually if you think the system recovered from an issue.

Do NOT run inject twice with the same `runId` on the same live stack (creates duplicate chaos bookings).
The script auto-generates `runId` from the current timestamp, so running at different times is safe.

## Definition of Success

The chaos test passes when:
- All four M3 assertions are green
- The log is committed to the repo
- The top-level README references this run as evidence (tagged `v1.0` or later)

A failed assertion is **not** a reason to panic; it's a reason to:
1. Identify the root cause (n8n, Airtable, Telegram, Stripe, or the app code)
2. Fix it
3. Re-run inject + verify to confirm the fix
4. Commit the second log (or amend the first with a note)

The point of Day 9 is to find and fix issues *before* production. The test is working as designed if it catches something.
