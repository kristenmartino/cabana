# Booking field reconciliation

R5 / ADR-01 / ADR-02. The nightly n8n workflow reads both systems and reports
differences through the existing private `telegram-notify` worker. It never
updates bookings, Airtable records, staff inputs or delivery receipts.

## Comparison contract

Join `bookings.id` to Airtable `booking_id` as a case-insensitive UUID. Check
missing records, unexpected records, duplicate booking IDs and invalid/blank
booking IDs separately from counts. For each matching record compare:

`status`, `kind`, `member_id`, `member_name`, `address`, `tech_name`,
`deposit_status`, `request_text`, `window_start`, `window_end`, `visit_notes`.

The expected projection follows the outbox consumer's current-booking mapping.
Deposit state uses paid-first, then pending, then unpaid when required, otherwise
`n/a`; it does not infer refunds or change the member UI's payment model.
Visit notes compare the existing whitelisted write-back value. Staff-control
fields (`mark_completed`, `mark_missed`, reason/identity/result) and
`last_synced` are excluded. This is a projection audit, not an audit of every
database column or a claim that staff actions succeeded.

Blank, omitted and null Airtable values are equivalent. Text line endings are
normalized; meaningful whitespace is preserved. Window timestamps require an
explicit offset and compare as UTC instants, so equivalent timezone displays
match while an actual hour shift is detected. Invalid target values are drift;
invalid source data fails the scan.

## Scan and reporting

The workflow reads the app, all Airtable pages, then the app again. A booking
whose compared fields or existence changed between app snapshots is deferred;
the report says **incomplete**, even if no other differences exist. Re-run after
delivery settles. This is not a transactionally consistent cross-system snapshot;
an in-flight projection or edit after a read can require another scan.

App requests use ordered 1,000-row pages plus exact counts; Airtable follows all
100-record offset pages. Subsequent HTTP nodes execute once rather than once per
upstream page. Non-2xx responses fail, as do malformed/truncated page sets,
repeated pages and missing exact counts. Failures reach the configured error
workflow in production; manual runs show the error in the editor. A failed scan
cannot send an all-matched report.

Telegram includes totals and a bounded sample (at most 20 issues, under 4,000
characters). Full redacted differences remain in the comparison node output.
Booking/record IDs, field names, valid enums and UTC windows are visible; names,
addresses, member IDs, request text and notes are never included as field values.
The preceding HTTP nodes still contain source data in private n8n execution
history under the existing retention/access policy.

Schedule: 03:00 `America/New_York`, including daylight saving changes. The manual
trigger runs the same chain without exposing a public webhook. Retain the
instance's existing error workflow and stored credential references on import.

## Source and deployment

Edit `ops/n8n/reconciliation.mjs`, then run:

```
node scripts/build-reconciliation.mjs
node scripts/build-reconciliation.mjs --check
npm run typecheck
npm run lint
npm test
```

Tests execute the generated n8n code and check parity with the consumer's
projection. The committed export has placeholder credential IDs. Update the
existing reconciliation workflow, bind its existing Supabase/Airtable
credentials, retain its error handler, and publish the saved version. Never
activate a second scheduled copy. Save the previous version for rollback.

For live verification, snapshot one isolated synthetic QA record, change only
safe Airtable projection fields (never staff checkboxes), run the workflow and
verify the Telegram receipt identifies the booking and mismatched fields. Restore
the exact original values and re-run. Confirm that booking clears and the app
record/audit/outbox did not change. Existing drift elsewhere must remain visible;
do not delete records or rewrite the source just to obtain a green report.
