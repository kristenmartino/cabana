// R6 / ADR-01: authenticated, whitelisted office actions. Supabase is authoritative.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler, type WritebackPayload } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
async function log(body: WritebackPayload, result: string) {
  const { error } = await db.from("sync_log").insert({ direction: "writeback", entity: "bookings",
    entity_id: body.booking_id, airtable_record_id: body.airtable_record_id, result });
  if (error) console.error("airtable-writeback: sync_log insert failed", result, error);
}
Deno.serve(createHandler(Deno.env.get("WRITEBACK_SHARED_SECRET")!, {
  log,
  async complete(id) {
    const { error } = await db.rpc("transition_booking", { p_booking_id: id, p_to_status: "completed", p_actor: "office:airtable" });
    return error;
  },
  async notes(id, notes) {
    const { data, error } = await db.from("bookings").update({ visit_notes: notes }).eq("id", id).select("id");
    if (error) throw error;
    return !!data?.length;
  },
  async missed(body) {
    const { error } = await db.rpc("mark_visit_missed", {
      p_booking_id: body.booking_id, p_reason: body.reason,
      p_airtable_record_id: body.airtable_record_id, p_staff_id: body.staff_id, p_staff_name: body.staff_name,
    });
    return error;
  },
}));
