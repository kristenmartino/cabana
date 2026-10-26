/* global input, base */
// Airtable automation: Bookings mark_missed -> app write-back.
// Watch only mark_missed. Input: recordId (trigger's Airtable record ID).
// Secret: existing WRITEBACK_SHARED_SECRET. missed_by is a Last modified by
// field watching only mark_missed; never substitute a typed staff name.
const cfg = input.config();
const table = base.getTable("Bookings");
const record = await table.selectRecordAsync(cfg.recordId);
if (record && record.getCellValue("mark_missed") === true) {
  const staff = record.getCellValue("missed_by");
  const reason = record.getCellValueAsString("missed_reason").trim();
  const reject = async (message) => {
    await table.updateRecordAsync(record.id, { mark_missed: false, missed_result: message });
    throw new Error(message);
  };
  if (!reason || reason.length > 1000) await reject("Enter a missed-visit reason (1–1000 characters), then check Mark missed again.");
  if (!staff?.id || !staff?.name) await reject("Staff identity is missing. Ask the owner to check the missed_by field configuration.");
  const secret = input.secret("WRITEBACK_SHARED_SECRET");
  let response;
  try {
    response = await fetch("https://uuviebpmiwzjyabucheo.supabase.co/functions/v1/airtable-writeback", {
      method: "POST",
      headers: { "content-type": "application/json", "x-writeback-secret": secret },
      body: JSON.stringify({ booking_id: record.getCellValueAsString("booking_id"),
        field: "mark_missed", value: true, airtable_record_id: record.id,
        reason, staff_id: staff.id, staff_name: staff.name }),
    });
  } catch {
    await table.updateRecordAsync(record.id, { missed_result: "Delivery not confirmed. Check the app status before retrying the same action." });
    throw new Error("Missed-visit delivery not confirmed; checkbox retained for review.");
  }
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) await reject(await response.text());
    await table.updateRecordAsync(record.id, { missed_result: "Delivery not confirmed. Check the app status before retrying the same action." });
    throw new Error(`Missed-visit write-back returned ${response.status}; checkbox retained for review.`);
  }
  await table.updateRecordAsync(record.id, { missed_result: "Recorded as missed. Staff and reason saved in the app audit." });
}
// Unchecking is a no-op; it cannot reopen a terminal visit or loop on rejection.
