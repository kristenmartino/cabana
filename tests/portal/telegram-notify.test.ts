import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHandler, type DeliveryStore, type Event } from "../../supabase/functions/telegram-notify/handler";

const event: Event = { id: 7, topic: "booking.status_changed", payload: { booking_id: "booking", from: "awaiting_deposit", to: "scheduled" }, telegram_delivered_at: null, telegram_message_id: null, dead_lettered_at: null };
let store: DeliveryStore;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const request = (body: unknown, key = "worker-secret") => new Request("https://demo.invalid/telegram-notify", {
  method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body),
});
const handler = () => createHandler({ authorize: async h => h === "Bearer worker-secret", botToken: "private-token", store, fetcher });

beforeEach(() => {
  store = {
    owner: vi.fn().mockResolvedValue(123), event: vi.fn().mockResolvedValue({ ...event }),
    booking: vi.fn().mockResolvedValue({ id: "booking", status: "scheduled", kind: "repair", request_text: "Pump grinding" }),
    claim: vi.fn().mockResolvedValue("lease"), complete: vi.fn().mockResolvedValue(true), release: vi.fn().mockResolvedValue(undefined),
  };
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, result: { message_id: 456 } }));
});

describe("private Telegram delivery", () => {
  it.each(["", "member-jwt", "anonymous-key"])("refuses a non-worker credential %s before reading data", async key => {
    expect((await handler()(request({ outbox_id: 7 }, key))).status).toBe(401);
    expect(store.owner).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });

  it("cannot override the recipient or supply arbitrary booking text", async () => {
    expect((await handler()(request({ outbox_id: 7, chat_id: 999 }))).status).toBe(400);
    expect((await handler()(request({ outbox_id: 7, text: "override" }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("records the provider receipt only after a successful send to the existing owner", async () => {
    const response = await handler()(request({ outbox_id: 7 }));
    expect(await response.json()).toEqual({ ok: true, message_id: 456 });
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(sent.chat_id).toBe(123); expect(sent.text).toContain("status: scheduled");
    expect(sent.reply_markup.inline_keyboard[0][0].callback_data).toBe("approve:booking");
    expect(store.complete).toHaveBeenCalledWith(7, "lease", 456);
    expect(store.release).not.toHaveBeenCalled();
  });

  it("does not present a stale approval button for an already approved booking", async () => {
    vi.mocked(store.booking).mockResolvedValue({ id: "booking", status: "confirmed", kind: "repair", request_text: null });
    await handler()(request({ outbox_id: 7 }));
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).reply_markup).toBeUndefined();
  });

  it("skips an acknowledged event without sending again", async () => {
    vi.mocked(store.event).mockResolvedValue({ ...event, telegram_delivered_at: "2026-10-24", telegram_message_id: 42 });
    expect(await (await handler()(request({ outbox_id: 7 }))).json()).toMatchObject({ already_delivered: true, message_id: 42 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a dead-lettered event until an operator requeues it", async () => {
    vi.mocked(store.event).mockResolvedValue({ ...event, dead_lettered_at: "2026-10-24" });
    expect((await handler()(request({ outbox_id: 7 }))).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a concurrent send when the delivery lease is held", async () => {
    vi.mocked(store.claim).mockResolvedValue(null);
    expect((await handler()(request({ outbox_id: 7 }))).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([Response.json({ ok: false }, { status: 429 }), Response.json({ ok: true, result: {} })])("does not acknowledge a rejected or malformed provider result", async result => {
    fetcher.mockResolvedValue(result);
    expect((await handler()(request({ outbox_id: 7 }))).status).toBe(502);
    expect(store.complete).not.toHaveBeenCalled(); expect(store.release).toHaveBeenCalledWith(7, "lease");
  });

  it("does not leak credentials or acknowledge on a network failure", async () => {
    fetcher.mockRejectedValue(new Error("https://api.telegram.org/botprivate-token/sendMessage timeout"));
    const r = await handler()(request({ outbox_id: 7 }));
    expect(await r.text()).not.toContain("private-token");
    expect(store.complete).not.toHaveBeenCalled(); expect(store.release).toHaveBeenCalledWith(7, "lease");
  });

  it("keeps the lease after Telegram accepted a send whose receipt write failed", async () => {
    vi.mocked(store.complete).mockResolvedValue(false);
    expect((await handler()(request({ outbox_id: 7 }))).status).toBe(502);
    expect(store.release).not.toHaveBeenCalled();
  });

  it("fails closed if the owner destination is ambiguous", async () => {
    vi.mocked(store.owner).mockResolvedValue(null);
    expect((await handler()(request({ text: "Health alert" }))).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends bounded operational alerts only to the same owner", async () => {
    expect((await handler()(request({ text: "Health alert" }))).status).toBe(200);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ chat_id: 123, text: "Health alert" });
    expect((await handler()(request({ text: "x".repeat(4001) }))).status).toBe(400);
    expect(store.claim).not.toHaveBeenCalled();
  });
});
