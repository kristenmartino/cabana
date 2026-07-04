// supabase/functions/airtable-writeback/index.ts
// The fenced exception to one-way sync (R6 / ADR-01). Airtable automations
// call this with a shared secret when Marie edits a WHITELISTED field.
// Supabase stays authoritative: this function validates, applies, audits.
// Non-whitelisted fields never reach here by construction — and if they do,
// they are rejected and logged, not applied.
//
// STATUS: Day-8 complete. Whitelist enforcement + apply logic wired
// (mark_completed -> transition_booking RPC; visit_notes -> direct update).

import { createClient } from "npm:@supabase/supabase-js@2";

const SHARED_SECRET = Deno.env.get("WRITEBACK_SHARED_SECRET")!;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// The entire write-back surface. Expanding this list requires a code change
// and an ADR-01 amendment — deliberately (every field here is a consistency
// liability and should cost a decision).
const WHITELIST = new Set(["visit_notes", "mark_completed"]);

type WritebackPayload = {
  booking_id: string;
  field: string;
  value: string | boolean | null;
  airtable_record_id: string;
};

// Evidence trail (R6/ADR-01): every outcome — applied, ignored, rejected — gets
// a row. The apply already committed by the time we log, so we never fail the
// request over a lost audit row; but a failed audit insert must not be silent
// either (never-cut #3), so surface it to the function logs.
async function logSync(body: WritebackPayload, result: string) {
  const { error } = await db.from("sync_log").insert({
    direction: "writeback",
    entity: "bookings",
    entity_id: body.booking_id,
    airtable_record_id: body.airtable_record_id,
    result,
  });
  if (error) console.error("airtable-writeback: sync_log insert failed", result, error);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-writeback-secret") !== SHARED_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let body: WritebackPayload;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (!WHITELIST.has(body.field)) {
    await logSync(body, `rejected: field '${body.field}' not whitelisted`);
    return new Response("field not whitelisted", { status: 422 });
  }

  try {
    if (body.field === "mark_completed") {
      // Airtable checkbox. Only a checked box (true) means "complete this".
      // Treat true or "true" as checked.
      const checked = body.value === true || body.value === "true";
      if (!checked) {
        // Unchecking is not an un-complete path — record and ack, don't act.
        await logSync(body, "ignored: mark_completed value not true");
        return new Response("ignored", { status: 200 });
      }
      // Completion goes through transition_booking (0008) — one audited
      // transaction, actor 'office:airtable', guard-validated (confirmed ->
      // completed only). Never a direct status UPDATE (that would skip the
      // guard, the audit, and the outbox re-projection).
      const { error } = await db.rpc("transition_booking", {
        p_booking_id: body.booking_id,
        p_to_status: "completed",
        p_actor: "office:airtable",
      });
      if (error) {
        if (error.code === "P0001") {
          // Illegal transition (booking not in 'confirmed'). Report back so
          // Airtable can surface/revert it — do NOT silently diverge.
          await logSync(body, "rejected: cannot complete — booking not in 'confirmed' state");
          return new Response("booking not in a completable state", { status: 409 });
        }
        if (error.code === "P0002") {
          await logSync(body, "rejected: booking not found");
          return new Response("booking not found", { status: 404 });
        }
        throw error; // unexpected -> outer catch -> 500 so Airtable retries
      }
      await logSync(body, "applied: mark_completed (confirmed -> completed)");
      return new Response("ok", { status: 200 });
    }

    if (body.field === "visit_notes") {
      const notes =
        typeof body.value === "string"
          ? body.value
          : body.value == null
            ? null
            : String(body.value);
      const { data, error } = await db
        .from("bookings")
        .update({ visit_notes: notes })
        .eq("id", body.booking_id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        await logSync(body, "rejected: booking not found (visit_notes)");
        return new Response("booking not found", { status: 404 });
      }
      await logSync(body, "applied: visit_notes");
      return new Response("ok", { status: 200 });
    }

    // WHITELIST guarantees we never reach here, but be explicit rather than
    // fall through silently.
    return new Response("unhandled field", { status: 422 });
  } catch (err) {
    console.error("airtable-writeback failed", err);
    return new Response("error", { status: 500 });
  }
});
