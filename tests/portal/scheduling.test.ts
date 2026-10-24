import { describe, expect, it } from "vitest";
import { parseScheduleCommand } from "../../supabase/functions/telegram-webhook/schedule";
import { formatVisitWindow, notificationBody } from "../../supabase/functions/telegram-notify/handler";
import { formatVisitWindow as memberWindow } from "../../lib/portal/request-state";

const id = "6e3c82d6-b30a-4007-b666-eb0c4ea9a6e6";
describe("owner scheduling command", () => {
  it("converts explicit Eastern offsets into the expected UTC instants", () => {
    expect(parseScheduleCommand([id, "2026-10-27T09:00-04:00", "2026-10-27T11:00-04:00"])).toEqual({ id, start: "2026-10-27T13:00:00.000Z", end: "2026-10-27T15:00:00.000Z" });
  });
  it.each([
    [id, "2026-10-27T09:00", "2026-10-27T11:00"],
    [id, "2026-10-27T13:00Z", "2026-10-27T12:00Z"],
    [id, "2026-10-27T13:00Z", "2026-10-27T13:00Z"],
    ["invalid", "2026-10-27T13:00Z", "2026-10-27T15:00Z"],
    [id, "bad", "2026-10-27T15:00Z"],
    [id, "2026-02-30T13:00Z", "2026-03-03T15:00Z"],
    [id, "2026-10-27T24:00Z", "2026-10-28T15:00Z"],
  ])("refuses ambiguous or invalid scheduling input %j", (...args) => {
    expect(parseScheduleCommand(args)).toBeNull();
  });
});

describe("visit notification dates", () => {
  it.each([
    '["2026-10-27 13:00:00+00","2026-10-27 15:00:00+00")',
    '["2026-11-01T05:30:00Z","2026-11-01T07:30:00Z")',
  ])("matches the member display, including DST offsets", (window) => {
    expect(formatVisitWindow(window)).toBe(memberWindow(window));
  });
  it("includes both visit bounds on a scheduling event without re-offering approval", () => {
    const body = notificationBody({ id: 1, topic: "booking.visit_window_changed", payload: {}, telegram_delivered_at: null, telegram_message_id: null, dead_lettered_at: null },
      { id, status: "confirmed", kind: "repair", request_text: null, window: '["2026-10-27T13:00:00Z","2026-10-27T15:00:00Z")' }, 123);
    expect(body.text).toContain("Visit window updated");
    expect(body.text).toContain("9:00 AM EDT"); expect(body.text).toContain("11:00 AM EDT");
    expect(body.reply_markup).toBeUndefined();
  });
});
