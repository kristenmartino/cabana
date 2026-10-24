import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = JSON.parse(readFileSync(new URL("../../ops/n8n/workflows/outbox-consumer.json", import.meta.url), "utf8"));
const code = workflow.nodes.find((node: { name: string }) => node.name === "Build actions").parameters.jsCode;

function replay(status: string, payload: Record<string, string>) {
  const run = new Function("$", "$json", "$env", code);
  return run(() => ({ item: { json: { id: 1, topic: "booking.status_changed", payload, attempts: 0 } } }),
    { id: "booking", status, kind: "repair", deposit_required: true, payments: [{ status: "paid" }] },
    { OWNER_CHAT_ID: "0" }).json;
}

describe("outbox status projection after an outage", () => {
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
