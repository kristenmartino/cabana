// supabase/functions/telegram-webhook/index.ts
// The owner's front door (R7 / ADR-07). This is an admin surface that happens
// to live in a chat app: it can approve real work orders, so authentication
// comes before everything else.
//
// STATUS: Day-1/Day-8 skeleton. Auth patterns (secret token + allowlist) are
// implemented; command routing is TODO. The Approve/Needs-info callback slice
// (Gate-1 spine) is wired below. Register the webhook with:
//   https://api.telegram.org/bot<TOKEN>/setWebhook
//     ?url=<function-url>&secret_token=<TELEGRAM_WEBHOOK_SECRET>

import { createClient } from "npm:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function tg(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error(`telegram ${method} failed`, await res.text());
  return res;
}

Deno.serve(async (req) => {
  // 1. Authenticity: Telegram echoes the secret_token we registered.
  //    Anything else is not Telegram. Reject before parsing.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    console.warn("telegram-webhook: bad or missing secret token");
    return new Response("forbidden", { status: 403 });
  }

  const update = await req.json();
  const chatId: number | undefined =
    update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;

  if (!chatId) return new Response("ok", { status: 200 }); // channel posts etc. — ignore

  // 2. Authorization: allowlist lookup. Unknown chats are refused, logged,
  //    and (TODO Day-8) rate-limited + alerted to the owner. Anyone can
  //    message any Telegram bot; only these chats may command the business.
  const { data: chat } = await db
    .from("telegram_chats")
    .select("chat_id, role, label")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (!chat) {
    console.warn(`telegram-webhook: unauthorized chat ${chatId}`);
    await tg("sendMessage", {
      chat_id: chatId,
      text: "This bot is private to Sailfish Pool Care staff.",
    });
    return new Response("ok", { status: 200 }); // 200 so Telegram doesn't retry abuse
  }

  // 3. Route. Always answer callback queries (Telegram redelivers otherwise).
  //    Approve idempotency is layered: on success we clear the inline keyboard
  //    (editMessageReplyMarkup) so the message can't be tapped again. A rare
  //    double-tap race that beats the keyboard-clear is still safe — the second
  //    call is scheduled->confirmed while already 'confirmed', which the guard
  //    (0007) treats as a same-status no-op (no P0001, no duplicate audit/outbox
  //    row) and re-answers "Approved". The P0001 "already handled" path below
  //    fires for a genuinely STALE tap: the booking has since left 'scheduled'
  //    to a terminal state (cancelled/completed), making scheduled->confirmed
  //    illegal.
  if (update.callback_query) {
    const cb = update.callback_query;
    // callback_data convention: "approve:<booking_id>" | "needsinfo:<booking_id>"
    const data: string = cb.data ?? "";
    const sep = data.indexOf(":");
    const action = sep === -1 ? data : data.slice(0, sep);
    const bookingId = sep === -1 ? "" : data.slice(sep + 1);

    if (action === "approve" && bookingId) {
      // Apply the transition in ONE transaction via transition_booking (0008),
      // so the audit (booking_transitions) records actor 'owner:telegram' — not
      // 'system'. Never rpc('set_actor') then .update(): PostgREST runs each
      // request in its own transaction and the actor would be lost.
      const { error } = await db.rpc("transition_booking", {
        p_booking_id: bookingId,
        p_to_status: "confirmed",
        p_actor: "owner:telegram",
      });

      if (!error) {
        await tg("answerCallbackQuery", {
          callback_query_id: cb.id,
          text: "✅ Approved",
        });
        // Clear the inline keyboard so the same message can't be tapped again.
        if (cb.message) {
          await tg("editMessageReplyMarkup", {
            chat_id: cb.message.chat.id,
            message_id: cb.message.message_id,
            reply_markup: { inline_keyboard: [] },
          });
        }
      } else if (error.code === "P0001") {
        // Illegal transition: the booking left 'scheduled' for a terminal state
        // (cancelled/completed) before this tap, so scheduled->confirmed is now
        // illegal and the guard (0007) raised P0001. Report it as already
        // handled rather than an error. (A same-status re-tap does NOT reach
        // here — the guard no-ops it and it lands in the success branch above.)
        // Distinguish P0001 from infrastructure errors below.
        console.log(
          `telegram-webhook: approve ${bookingId} already handled (P0001)`,
        );
        await tg("answerCallbackQuery", {
          callback_query_id: cb.id,
          text: "Already handled",
        });
      } else {
        // Anything else (network, permission, missing booking P0002…) is a real
        // failure: tell the owner it didn't go through and leave the buttons so
        // they can retry. Do NOT swallow it as "handled".
        console.error(
          `telegram-webhook: approve ${bookingId} failed`,
          error,
        );
        await tg("answerCallbackQuery", {
          callback_query_id: cb.id,
          text: "Couldn't approve — try again",
          show_alert: true,
        });
      }
      return new Response("ok", { status: 200 });
    }

    if (action === "needsinfo" && bookingId) {
      // v0: acknowledge only. The full needs-info flow (state change + member
      // outreach) lands Day 8; for the spine we just confirm the tap.
      await tg("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "Noted — needs info (Day 8)",
      });
      return new Response("ok", { status: 200 });
    }

    // Unknown callback payload — still answer so Telegram stops redelivering.
    console.warn(`telegram-webhook: unrecognized callback_data ${data}`);
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return new Response("ok", { status: 200 });
  }

  const text: string = update.message?.text ?? "";
  // TODO(D8): command router — /today /week /cancel <id> /brief
  //   /today, /week : query bookings by window in businesses.tz, format compactly
  //   /cancel <id>  : transition with actor 'owner:telegram'
  //   /brief        : Claude summary generated strictly from query results (R7 AC:
  //                   the bot never invents data; empty day => "nothing scheduled")
  await tg("sendMessage", {
    chat_id: chatId,
    text: `Cabana bot online. Commands coming Day 8. You said: ${text.slice(0, 100)}`,
  });

  return new Response("ok", { status: 200 });
});
