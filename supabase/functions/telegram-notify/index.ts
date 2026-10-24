import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler, type DeliveryStore } from "./handler.ts";

const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
function check(error: unknown) { if (error) throw new Error("Delivery store unavailable"); }
const store: DeliveryStore = {
  async owner() {
    const { data, error } = await db.from("telegram_chats").select("chat_id").eq("role", "owner").limit(2);
    check(error);
    return data?.length === 1 ? Number(data[0].chat_id) : null;
  },
  async event(id) {
    const { data, error } = await db.from("outbox").select("id,topic,payload,telegram_delivered_at,telegram_message_id,dead_lettered_at").eq("id", id).maybeSingle();
    check(error); return data;
  },
  async booking(id) {
    const { data, error } = await db.from("bookings").select("id,status,kind,request_text,window").eq("id", id).maybeSingle();
    check(error); return data;
  },
  async claim(id) {
    const { data, error } = await db.rpc("claim_telegram_delivery", { p_outbox_id: id });
    check(error); return data;
  },
  async complete(id, token, messageId) {
    const { data, error } = await db.rpc("complete_telegram_delivery", {
      p_outbox_id: id, p_claim_token: token, p_message_id: messageId,
    });
    check(error); return data === true;
  },
  async release(id, token) {
    const { error } = await db.from("outbox").update({ telegram_claim_token: null, telegram_claim_until: null }).eq("id", id).eq("telegram_claim_token", token);
    check(error);
  },
};
async function authorize(authorization: string) {
  if (!authorization.startsWith("Bearer ")) return false;
  // PostgREST verifies the caller's JWT. This RPC is executable only by the
  // existing service_role, so member/anonymous tokens cannot send notifications.
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await caller.rpc("authorize_telegram_worker");
  return !error && data === true;
}
Deno.serve(createHandler({ authorize, botToken: Deno.env.get("TELEGRAM_BOT_TOKEN")!, store }));
