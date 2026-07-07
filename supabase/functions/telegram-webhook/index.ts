// supabase/functions/telegram-webhook/index.ts
// The owner's front door (R7 / ADR-07). This is an admin surface that happens
// to live in a chat app: it can approve real work orders, so authentication
// comes before everything else.
//
// STATUS: shipped. Auth (secret token + allowlist) → Approve/Needs-info
// callbacks → command router (/today /week /cancel /brief). Register the
// webhook with:
//   https://api.telegram.org/bot<TOKEN>/setWebhook
//     ?url=<function-url>&secret_token=<TELEGRAM_WEBHOOK_SECRET>

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

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

// Escape free-text (member/address/tech display names) before it lands in an
// HTML-parsed Telegram message — an unescaped '&', '<', or '>' makes Telegram
// reject the whole send with 400, so the owner sees nothing.
function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      // Acknowledge the tap; the follow-up (reaching out to the member) is
      // Dana's — templated member outreach from the bot is a v1.5 item (P1).
      await tg("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "Noted — reach out to the member for details.",
      });
      return new Response("ok", { status: 200 });
    }

    // Unknown callback payload — still answer so Telegram stops redelivering.
    console.warn(`telegram-webhook: unrecognized callback_data ${data}`);
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return new Response("ok", { status: 200 });
  }

  const text: string = update.message?.text ?? "";
  const [cmd, ...args] = text.trim().split(/\s+/);

  // /today — show today's schedule
  if (cmd === "/today") {
    const { data: rows, error } = await db.rpc("get_schedule", { p_span: "today" });
    if (error) {
      console.error("telegram-webhook: get_schedule('today') failed", error);
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Couldn't load the schedule — try again.",
      });
      return new Response("ok", { status: 200 });
    }

    if (!rows || rows.length === 0) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Nothing scheduled today.",
      });
      return new Response("ok", { status: 200 });
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });

    let message = "🗓 Today\n\n";
    for (const row of rows) {
      const timeStr = formatter.format(new Date(row.win_start));
      const memberSafe = esc(row.member || "");
      const addressSafe = esc(row.address || "");
      const techSafe = esc(row.tech || "unassigned");
      message += `• ${timeStr} — ${memberSafe}, ${addressSafe} [${row.status}] (${techSafe})\n`;
    }

    await tg("sendMessage", {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });
    return new Response("ok", { status: 200 });
  }

  // /week — show this week's schedule, grouped by tech
  if (cmd === "/week") {
    const { data: rows, error } = await db.rpc("get_schedule", { p_span: "week" });
    if (error) {
      console.error("telegram-webhook: get_schedule('week') failed", error);
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Couldn't load the schedule — try again.",
      });
      return new Response("ok", { status: 200 });
    }

    if (!rows || rows.length === 0) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Nothing scheduled this week.",
      });
      return new Response("ok", { status: 200 });
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });

    // Group by tech
    const byTech = new Map<string, typeof rows>();
    for (const row of rows) {
      const tech = row.tech || "Unassigned";
      if (!byTech.has(tech)) {
        byTech.set(tech, []);
      }
      byTech.get(tech)!.push(row);
    }

    let message = "🗓 This week\n\n";
    for (const [tech, techRows] of byTech) {
      message += `<b>${esc(tech)}</b>\n`;
      for (const row of techRows) {
        const timeStr = formatter.format(new Date(row.win_start));
        const memberSafe = esc(row.member || "");
        const addressSafe = esc(row.address || "");
        message += `  • ${timeStr} — ${memberSafe}, ${addressSafe} [${row.status}]\n`;
      }
      message += "\n";
    }

    await tg("sendMessage", {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });
    return new Response("ok", { status: 200 });
  }

  // /cancel <booking_id> — cancel a booking
  if (cmd === "/cancel") {
    const id = args[0];
    if (!id) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Usage: /cancel <booking id>",
      });
      return new Response("ok", { status: 200 });
    }

    const { error } = await db.rpc("transition_booking", {
      p_booking_id: id,
      p_to_status: "cancelled",
      p_actor: "owner:telegram",
    });

    if (!error) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "✅ Booking cancelled.",
      });
    } else if (error.code === "P0001") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Can't cancel — that booking isn't in a cancellable state.",
      });
    } else if (error.code === "P0002") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "No booking with that id.",
      });
    } else {
      console.error("telegram-webhook: cancel failed", error);
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Couldn't cancel — try again.",
      });
    }

    return new Response("ok", { status: 200 });
  }

  // /brief — AI-generated one-paragraph summary of today
  if (cmd === "/brief") {
    try {
      const { data: rows, error } = await db.rpc("get_schedule", { p_span: "today" });
      if (error) {
        console.error("telegram-webhook: /brief get_schedule failed", error);
        await tg("sendMessage", {
          chat_id: chatId,
          text: "Brief unavailable right now.",
        });
        return new Response("ok", { status: 200 });
      }

      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });

      // Build a plain summary of today's rows
      let summary: string;
      if (!rows || rows.length === 0) {
        summary = "Nothing scheduled today.";
      } else {
        const bookingLines = rows.map(
          (row) =>
            `${formatter.format(new Date(row.win_start))} - ${row.member} at ${row.address} (${row.status}, ${row.tech})`
        );
        summary = bookingLines.join("\n");
      }

      const anthropic = new Anthropic({
        apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
      });

      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: `Summarize TODAY for Dana in ONE short paragraph using ONLY the provided rows. Never invent bookings, names, or times. If there are zero rows, say exactly "Nothing scheduled today."\n\nToday's bookings:\n${summary}`,
          },
        ],
      });

      const briefText = message.content[0].type === "text" ? message.content[0].text : "Brief unavailable.";

      await tg("sendMessage", {
        chat_id: chatId,
        text: briefText,
      });
    } catch (err) {
      console.error("telegram-webhook: /brief failed", err);
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Brief unavailable right now.",
      });
    }

    return new Response("ok", { status: 200 });
  }

  // Unknown command — show help
  await tg("sendMessage", {
    chat_id: chatId,
    text: `<b>Cabana bot commands:</b>
/today — Show today's schedule
/week — Show this week's schedule
/cancel &lt;id&gt; — Cancel a booking
/brief — AI summary of today`,
    parse_mode: "HTML",
  });

  return new Response("ok", { status: 200 });
});
