// supabase/functions/telegram-webhook/index.ts
// The owner's front door (R7 / ADR-07). This is an admin surface that happens
// to live in a chat app: it can approve real work orders, so authentication
// comes before everything else.
//
// STATUS: Day-1/Day-8 skeleton. Auth patterns (secret token + allowlist) are
// implemented; command routing is TODO. Register the webhook with:
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

  // 3. Route. Always answer callback queries (Telegram redelivers otherwise);
  //    idempotency for Approve comes free from the transition guard — a second
  //    tap attempts an illegal transition and is reported as "already handled."
  if (update.callback_query) {
    const cb = update.callback_query;
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    // callback_data convention: "approve:<booking_id>" | "needsinfo:<booking_id>"
    // TODO(D8): apply transition via rpc('transition_booking', { p_actor:
    // 'owner:telegram' }) (0008 — one transaction); on P0001 (illegal
    // transition) reply "already handled by <actor> at <time>".
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
