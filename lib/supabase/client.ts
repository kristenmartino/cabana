// lib/supabase/client.ts
// Browser client. Anon key only — RLS is the security boundary (0005_rls.sql).
// The browser can read its own rows and update access_notes; nothing else.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
