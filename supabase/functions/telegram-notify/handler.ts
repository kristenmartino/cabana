export type Event = {
  id: number; topic: string; payload: Record<string, unknown>;
  telegram_delivered_at: string | null; telegram_message_id: number | null;
  dead_lettered_at: string | null;
};
export type Booking = { id: string; status: string; kind: string; request_text: string | null };
export interface DeliveryStore {
  owner(): Promise<number | null>;
  event(id: number): Promise<Event | null>;
  booking(id: string): Promise<Booking | null>;
  claim(id: number): Promise<string | null>;
  complete(id: number, token: string, messageId: number): Promise<boolean>;
  release(id: number, token: string): Promise<void>;
}

export function notificationBody(event: Event, booking: Booking, owner: number) {
  const p = event.payload;
  const lines = [event.topic === "booking.created" ? "🟦 New booking" :
    `🔄 Booking status: ${p.from || "?"} → ${p.to || "?"}`,
    `kind: ${booking.kind}`, `status: ${booking.status}`];
  if (booking.request_text) lines.push(`“${booking.request_text.slice(0, 240)}”`);
  lines.push(`id: ${booking.id}`);
  return {
    chat_id: owner, text: lines.join("\n"), disable_web_page_preview: true,
    ...(booking.status === "scheduled" ? { reply_markup: { inline_keyboard: [[
      { text: "✅ Approve", callback_data: `approve:${booking.id}` },
      { text: "↩︎ Needs info", callback_data: `needsinfo:${booking.id}` },
    ]] } } : {}),
  };
}

export function createHandler(options: {
  authorize: (authorization: string) => Promise<boolean>;
  botToken: string; store: DeliveryStore;
  fetcher?: typeof fetch;
}) {
  const { authorize, botToken, store, fetcher = fetch } = options;
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  return async (req: Request): Promise<Response> => {
    try {
      if (!await authorize(req.headers.get("authorization") || ""))
        return json({ error: "unauthorized" }, 401);
    } catch { return json({ error: "authorization unavailable" }, 503); }
    let claimed: { id: number; token: string } | null = null;
    let acceptedByTelegram = false;
    try {
      // Private transport probe: verifies the same bot without sending a message.
      if (req.method === "GET") {
        const r = await fetcher(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(8000) });
        const body = await r.json();
        return json({ ok: r.ok && body.ok === true }, r.ok && body.ok === true ? 200 : 502);
      }
      if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(k => !["outbox_id", "text"].includes(k)) ||
        ((body.outbox_id !== undefined) === (body.text !== undefined)))
        return json({ error: "supply one outbox_id or alert text" }, 400);
      const owner = await store.owner();
      if (owner === null) return json({ error: "owner destination unavailable" }, 503);
      let outgoing: Record<string, unknown>;
      if (body.outbox_id !== undefined) {
        if (!Number.isSafeInteger(body.outbox_id) || Number(body.outbox_id) <= 0)
          return json({ error: "invalid outbox_id" }, 400);
        const id = Number(body.outbox_id), event = await store.event(id);
        if (!event) return json({ error: "event not found" }, 404);
        if (event.telegram_delivered_at)
          return json({ ok: true, already_delivered: true, message_id: event.telegram_message_id });
        if (event.dead_lettered_at) return json({ error: "operator requeue required" }, 409);
        if (!["booking.created", "booking.status_changed"].includes(event.topic) ||
          typeof event.payload.booking_id !== "string") return json({ error: "unsupported event" }, 422);
        const booking = await store.booking(event.payload.booking_id);
        if (!booking) return json({ error: "booking not found" }, 410);
        const token = await store.claim(id);
        if (!token) return json({ error: "delivery already in progress" }, 409);
        claimed = { id, token };
        outgoing = notificationBody(event, booking, owner);
      } else {
        // Operational alerts may target only the existing, unique owner.
        if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 4000)
          return json({ error: "invalid alert text" }, 400);
        outgoing = { chat_id: owner, text: body.text, disable_web_page_preview: true };
      }
      const r = await fetcher(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(outgoing), signal: AbortSignal.timeout(8000),
      });
      const result = await r.json();
      const messageId = result.result?.message_id;
      if (!r.ok || result.ok !== true || !Number.isSafeInteger(messageId) || messageId <= 0)
        throw new Error("Telegram rejected delivery");
      acceptedByTelegram = true;
      if (claimed && !await store.complete(claimed.id, claimed.token, messageId)) {
        console.error("Telegram receipt write failed", { outbox_id: claimed.id, message_id: messageId });
        throw new Error("Delivery receipt could not be committed");
      }
      return json({ ok: true, message_id: messageId });
    } catch {
      // Never expose an upstream URL: Telegram URLs contain the bot credential.
      if (claimed && !acceptedByTelegram) await store.release(claimed.id, claimed.token).catch(() => {});
      return json({ error: "Telegram delivery failed" }, 502);
    }
  };
}
