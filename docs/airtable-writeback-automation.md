# Airtable Write-Back Automation: mark_completed

**Purpose:** Syncs the "mark completed" checkbox from Airtable back to the Sailfish app, with automatic revert on app rejection.

When a record's `mark_completed` field is checked or unchecked in the Bookings table, this automation sends the change to the app's write-back edge function. If the app declines (e.g., because the booking isn't in a completable state), the checkbox automatically clears, keeping the Airtable console honest with the app's truth.

## How it triggers

Automation name: **"Bookings: mark_completed → app write-back"**
- Trigger: "When a record is updated"
- Watched field: `mark_completed` (the checkbox)
- Table: **Bookings**

The automation runs whenever anyone checks or unchecks the box.

## Configure in Airtable's automation UI

Use "Run script" as the action. Set these input variables in the Airtable automation UI's "Input variables" section:
- `recordId` ← "Airtable record ID" of the triggering record
- `bookingId` ← the record's `booking_id` field (the Supabase booking UUID)
- `markCompleted` ← the record's `mark_completed` field (the checkbox, boolean)

Then add the secret:
- `WRITEBACK_SHARED_SECRET` ← the shared secret (same value as the edge function's `WRITEBACK_SHARED_SECRET` env var)

## The script

Paste this into the "Run script" field, verbatim:

```js
// Airtable automation: "Bookings: mark_completed -> app write-back"
// Trigger: "When a record is updated", watched field = mark_completed, table = Bookings.
// Run-script INPUT VARIABLES to configure in the UI (input.config() reads these):
//   recordId      <- "Airtable record ID" of the triggering record
//   bookingId     <- the record's booking_id field (Supabase bookings.id)
//   markCompleted <- the record's mark_completed field (the checkbox)
// SECRET (input.secret): WRITEBACK_SHARED_SECRET (same value as the edge fn's env).
const cfg = input.config();
const secret = input.secret("WRITEBACK_SHARED_SECRET");
const FN_URL = "https://<PROJECT_REF>.supabase.co/functions/v1/airtable-writeback";

const res = await fetch(FN_URL, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-writeback-secret": secret,
  },
  body: JSON.stringify({
    booking_id: cfg.bookingId,
    field: "mark_completed",
    value: cfg.markCompleted === true, // only a checked box means "complete this"
    airtable_record_id: cfg.recordId,
  }),
});

if (!res.ok) {
  // The app refused it (e.g. 409 = booking not in a completable state). Airtable
  // is a projection, so the console must show the app's truth: revert the box.
  // Guarded to an actual check so we never "revert" a value we didn't set.
  if (cfg.markCompleted === true) {
    const table = base.getTable("Bookings");
    await table.updateRecordAsync(cfg.recordId, { "mark_completed": false });
    // The uncheck re-fires this automation once with value:false -> edge fn
    // returns 200 "ignored" -> res.ok true -> no re-revert. Settles, no loop.
  }
  throw new Error(`airtable-writeback ${res.status}: ${await res.text()}`);
}
```

## Why reverting is loop-free

When the app declines a mark_completed request (e.g., 409 "booking not in a completable state"), the script checks if the box was ticked, then unchecks it via `table.updateRecordAsync()`.

Unchecking the box triggers the automation **again** with `markCompleted = false`. But the edge function is designed to handle this:

When `mark_completed` is `false` or `"false"` (anything other than `true`), the edge function returns `200 "ignored"` with no side effect. In Airtable, a successful HTTP response (`res.ok === true`) means the script stops without throwing. So:

1. User ticks box → edge fn rejects with 409 → script reverts box → automation fires again.
2. Automation fires with `markCompleted = false` → edge fn returns 200 "ignored" → script exits cleanly (no throw).
3. Settles. No loop.

(See `supabase/functions/airtable-writeback/index.ts` for the edge function's full contract.)

## Scope: mark_completed only

The whitelist in the edge function includes two fields: `mark_completed` and `visit_notes`. This automation handles only `mark_completed`.

`visit_notes` is deliberately NOT reverted on app rejection because:
- Failures for visit_notes are rare (only 404 not-found if the booking was deleted).
- Free-text fields don't have a "prior value" easily available in Airtable's automation runtime, so reverting to an older value is awkward.

If visit_notes submission fails, the field retains the entered text, and the operator can troubleshoot via the app logs or by asking Dana.

## Related

- Edge function: `supabase/functions/airtable-writeback/index.ts` (the authoritative contract and guard logic)
- Operator guide: `docs/marie-console.md` (Marie's view of the mark_completed behavior — always cleared on app rejection)
