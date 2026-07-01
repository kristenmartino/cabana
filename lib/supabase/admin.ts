// lib/supabase/admin.ts
// Service-role client for server actions ONLY. Bypasses RLS — every use must
// set the actor for the audit trail before status writes:
//   await setActor(db, "member");
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

// Calls the Postgres function set_actor(text) from 0006_helpers.sql —
// transaction-local set_config('cabana.actor', ...) so the audit trigger
// (0002) records who did what through which channel.
export async function setActor(
  db: ReturnType<typeof createAdminClient>,
  actor: Actor,
) {
  await db.rpc("set_actor", { actor });
}
