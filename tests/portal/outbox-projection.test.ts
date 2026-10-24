import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = JSON.parse(readFileSync(new URL("../../ops/n8n/workflows/outbox-consumer.json", import.meta.url), "utf8"));
const code = workflow.nodes.find((node: { name: string }) => node.name === "Build actions").parameters.jsCode;

function replay(status: string, payload: Record<string, string>, window: string | null = null) {
  const run = new Function("$", "$json", "$env", code);
  return run(() => ({ item: { json: { id: 1, topic: "booking.status_changed", payload, attempts: 0 } } }),
    { id: "booking", status, window, kind: "repair", deposit_required: true, payments: [{ status: "paid" }] },
    { OWNER_CHAT_ID: "0" }).json;
}

describe("outbox status projection after an outage", () => {
  it("projects both bounds of the current visit window, even on a historical event", () => {
    const result = replay("confirmed", { booking_id: "booking", to: "scheduled" }, '["2026-10-27 13:00:00+00","2026-10-27 15:00:00+00")');
    expect(result.airtable_records[0].fields).toMatchObject({ status: "confirmed", window_start: "2026-10-27 13:00:00+00", window_end: "2026-10-27 15:00:00+00" });
    expect(result.show_approve).toBe(false);
  });

  it("clears both office bounds when a visit window is removed", () => {
    expect(replay("confirmed", { booking_id: "booking" }).airtable_records[0].fields).toMatchObject({ window_start: null, window_end: null });
  });
  it("keeps the notification retry path open after an earlier Airtable delivery", () => {
    const mark = workflow.nodes.find((node: { name: string }) => node.name === "Mark airtable delivered");
    // A conditional PATCH returning [] produces no n8n output items and stops
    // the downstream Telegram retry. Each successful upsert must acknowledge.
    expect(mark.parameters.queryParameters.parameters.map((p: { name: string }) => p.name)).toEqual(["id"]);
    expect(mark.parameters.headerParameters.parameters).toContainEqual({ name: "Prefer", value: "return=representation" });
  });

  it("keeps the paid booking current when an older deposit event is replayed", () => {
    const result = replay("scheduled", { booking_id: "booking", from: "requested", to: "awaiting_deposit" });
    expect(result.airtable_records[0].fields).toMatchObject({ status: "scheduled", deposit_status: "paid" });
    expect(result.show_approve).toBe(true);
  });

  it("does not re-offer approval when an older scheduling event is replayed", () => {
    const result = replay("confirmed", { booking_id: "booking", from: "awaiting_deposit", to: "scheduled" });
    expect(result.airtable_records[0].fields.status).toBe("confirmed");
    expect(result.show_approve).toBe(false);
    expect(result.telegram_body.reply_markup).toBeUndefined();
  });
});
