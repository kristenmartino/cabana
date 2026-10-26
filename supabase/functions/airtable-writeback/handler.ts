export type WritebackPayload = {
  booking_id: string;
  field: string;
  value: string | boolean | null;
  airtable_record_id: string;
  reason?: string;
  staff_id?: string;
  staff_name?: string;
};
type DbError = { code?: string; message?: string };
export type Store = {
  complete(id: string): Promise<DbError | null>;
  notes(id: string, value: string | null): Promise<boolean>;
  missed(body: WritebackPayload): Promise<DbError | null>;
  log(body: WritebackPayload, result: string): Promise<void>;
};
const WHITELIST = new Set(["visit_notes", "mark_completed", "mark_missed"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missedErrors: Record<string, string> = {
  missed_reason_required: "Enter a missed-visit reason (1–1000 characters).",
  missed_staff_identity_required: "Staff identity is required. Check the Airtable modified-by field.",
  missed_visit_requires_confirmed: "Only confirmed visits can be marked missed.",
  missed_visit_requires_elapsed_window: "A visit can only be marked missed after its recorded window ends.",
  missed_visit_already_recorded: "This visit is already marked missed; its original staff record is retained.",
};

export function createHandler(secret: string, store: Store) {
  return async (req: Request): Promise<Response> => {
    if (!secret || req.headers.get("x-writeback-secret") !== secret) return new Response("forbidden", { status: 403 });
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    let body: WritebackPayload;
    try {
      body = await req.json();
      if (!body || typeof body !== "object" || !UUID.test(body.booking_id)
          || typeof body.field !== "string" || !/^rec[A-Za-z0-9]+$/.test(body.airtable_record_id)
          || !(body.value === null || typeof body.value === "string" || typeof body.value === "boolean")) {
        return new Response("invalid writeback payload", { status: 400 });
      }
    } catch { return new Response("bad json", { status: 400 }); }
    if (!WHITELIST.has(body.field)) {
      await store.log(body, `rejected: field '${body.field}' not whitelisted`);
      return new Response("field not whitelisted", { status: 422 });
    }
    try {
      if (body.field === "mark_completed" || body.field === "mark_missed") {
        if (!(body.value === true || body.value === "true")) {
          await store.log(body, `ignored: ${body.field} value not true`);
          return new Response("ignored", { status: 200 });
        }
        if (body.field === "mark_missed") {
          if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.trim().length > 1000) {
            await store.log(body, "rejected: missed_reason_required");
            return new Response(missedErrors.missed_reason_required, { status: 422 });
          }
          if (typeof body.staff_id !== "string" || !/^usr[A-Za-z0-9]+$/.test(body.staff_id)
              || typeof body.staff_name !== "string" || !body.staff_name.trim() || body.staff_name.trim().length > 200) {
            await store.log(body, "rejected: missed_staff_identity_required");
            return new Response(missedErrors.missed_staff_identity_required, { status: 422 });
          }
        }
        const error = body.field === "mark_missed" ? await store.missed(body) : await store.complete(body.booking_id);
        if (error) {
          if (error.code === "P0002") {
            await store.log(body, "rejected: booking not found");
            return new Response("booking not found", { status: 404 });
          }
          if (error.code === "P0001" || error.code === "22023") {
            const message = body.field === "mark_missed" ? missedErrors[error.message ?? ""] : "booking not in a completable state";
            if (!message) throw error;
            await store.log(body, `rejected: ${error.message ?? "cannot complete"}`);
            return new Response(message, { status: error.code === "22023" ? 422 : 409 });
          }
          throw error;
        }
        await store.log(body, body.field === "mark_missed" ? "applied: mark_missed (audited office action or identical replay)" : "applied: mark_completed (confirmed -> completed)");
        return new Response("ok", { status: 200 });
      }
      const notes = body.value == null ? null : String(body.value);
      if (!(await store.notes(body.booking_id, notes))) {
        await store.log(body, "rejected: booking not found (visit_notes)");
        return new Response("booking not found", { status: 404 });
      }
      await store.log(body, "applied: visit_notes");
      return new Response("ok", { status: 200 });
    } catch (err) {
      console.error("airtable-writeback failed", err);
      return new Response("error", { status: 500 });
    }
  };
}
