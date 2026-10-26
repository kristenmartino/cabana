# Airtable staff action: Mark missed

R3 / R6 / ADR-01 amendment, October 26, 2026.

Enter `missed_reason`, then check `mark_missed`. Only a confirmed visit with a finite recorded window that has already ended is eligible. A missing reason, missing staff identity, unassigned/future window or non-confirmed status is refused. `missed_result` explains the outcome. The booking's `status` is always projected from Supabase; do not edit it manually.

## Fields on Bookings

| Field | Type | Purpose |
|---|---|---|
| `missed_reason` | Long text, plain text | Action input, 1–1000 characters after trimming. |
| `mark_missed` | Checkbox | Explicit submission, after entering the reason. |
| `missed_by` | Last modified by; specific field = **mark_missed only** | Airtable collaborator who submitted the checkbox. Computed; no typed identity. |
| `missed_result` | Long text, plain text | Automation feedback; staff read this field. |

Create **Bookings: mark_missed → app write-back** with “When a record is updated,” Bookings, watched field `mark_missed` only. Add a Run script action with input `recordId` mapped to the trigger's Airtable record ID. Reuse the existing `WRITEBACK_SHARED_SECRET` secret. Paste [the versioned script](../ops/airtable/mark-missed.js). Publish only this automation; leave completion and visit-note automations unchanged.

The script reads the current row and computed collaborator, validates the input, then calls the existing authenticated write-back function with field `mark_missed`, value `true`, reason, staff ID/name, and Airtable record ID. Changing the reason alone does not submit an action.

## Authoritative write and safeguards

`mark_visit_missed` locks the booking, validates the status, window, reason and staff attribution, inserts the private `booking_missed_actions` audit record, and invokes `transition_booking(..., 'no_show', 'office:airtable')` in one transaction. The existing trigger writes the status audit and outbox. n8n updates the existing Airtable row and sends the normal Telegram notification; the member portal shows Missed in Service history.

The audit retains the original reason, Airtable collaborator ID/name, record ID and timestamp. It is service-role-only and is not a member-facing visit note. Repeat delivery of the identical action is a no-op. Different input cannot overwrite a terminal action. Completion/cancellation/scheduling races serialize on the booking row; no partial staff audit survives a rejected transition. Payment records are untouched.

On a definite 4xx refusal the script clears the checkbox and writes the error. The resulting unchecked event is ignored, so it cannot loop. On a network or 5xx failure the outcome may be ambiguous: retain the checkbox, show “Delivery not confirmed,” and inspect the app before retrying. Unchecking never reopens the visit. `missed_reason` remains an action input; the original accepted text is retained in the private audit even if someone later edits the input.

## Verification

Automated tests cover elapsed/finite windows, confirmed-only status, required reason/collaborator, terminal protection, concurrent replay, conflicting completion, RPC permissions, authentication, and the completion/notes routes. Live acceptance uses isolated fictional bookings: eligible success, future-window refusal, missing-reason refusal and unconfirmed refusal, with app/Airtable/Telegram and audit/outbox receipts compared. No real appointment or payment is involved.
