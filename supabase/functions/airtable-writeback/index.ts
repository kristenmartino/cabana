// supabase/functions/airtable-writeback/index.ts
// The fenced exception to one-way sync (R6 / ADR-01). Airtable automations
// call this with a shared secret when Marie edits a WHITELISTED field.
// Supabase stays authoritative: this function validates, applies, audits.
// Non-whitelisted fields never reach here by construction — and if they do,
// they are rejected and logged, not applied.
//
// STATUS: Day-8 skeleton. Whitelist enforcement implemented; apply logic TODO.

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
    await db.from("sync_log").insert({
      direction: "writeback",
      entity: "bookings",
      entity_id: body.booking_id,
      airtable_record_id: body.airtable_record_id,
      result: `rejected: field '${body.field}' not whitelisted`,
    });
    return new Response("field not whitelisted", { status: 422 });
  }

  try {
    // TODO(D8): set actor 'office:airtable' for the transition audit, then:
    //   field 'visit_notes'    -> update bookings.visit_notes
    //   field 'mark_completed' -> transition 'confirmed' -> 'completed'
    //     (the guard trigger rejects it from any other state; report that back
    //      to Airtable as a comment/log rather than silently diverging)
    // Then log success to sync_log. The normal outbox flow re-projects the
    // change to Airtable, converging both sides.

    await db.from("sync_log").insert({
      direction: "writeback",
      entity: "bookings",
      entity_id: body.booking_id,
      airtable_record_id: body.airtable_record_id,
      result: `TODO applied: ${body.field}`,
    });

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("airtable-writeback failed", err);
    return new Response("error", { status: 500 });
  }
});
