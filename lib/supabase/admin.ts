// lib/supabase/admin.ts
// Service-role client for server actions ONLY. Bypasses RLS — every status
// write goes through transitionBooking() so the audit trail records who acted:
//   await transitionBooking(db, bookingId, "scheduled", "system:stripe");
// NEVER import this from anything that could reach the client bundle.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // server env only, never NEXT_PUBLIC_
    { auth: { persistSession: false } },
  );
}

export type Actor =
  | "member"
  | "owner:telegram"
  | "office:airtable"
  | "system:stripe"
  | "system:expiry"
  | "system";

// Mirrors the status check constraint in 0002_bookings.sql.
export type BookingStatus =
  | "requested"
  | "needs_review"
  | "awaiting_deposit"
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

// Atomic status transition via transition_booking() (0008): set_config +
// UPDATE run in ONE transaction, so the transition guard (0007) audits the
// actor instead of falling back to 'system'. The trigger still enforces the
// legal graph — an illegal transition surfaces here as a thrown P0001.
export async function transitionBooking(
  db: ReturnType<typeof createAdminClient>,
  bookingId: string,
  toStatus: BookingStatus,
  actor: Actor,
) {
  const { data, error } = await db.rpc("transition_booking", {
    p_booking_id: bookingId,
    p_to_status: toStatus,
    p_actor: actor,
  });
  if (error) throw error;
  return data;
}

/**
 * @deprecated Broken over the API: PostgREST wraps every request in its own
 * transaction, so the transaction-local setting made here is gone before any
 * subsequent .update() — the audit trigger logs 'system' regardless of the
 * actor passed. Use transitionBooking() instead. The SQL function set_actor()
 * (0006) remains valid where caller and write share one transaction
 * (seed.sql, psql, pg test clients).
 */
export async function setActor(
  db: ReturnType<typeof createAdminClient>,
  actor: Actor,
) {
  await db.rpc("set_actor", { actor });
}
