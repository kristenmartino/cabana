"use server";
// Magic-link sign-in (R1). Members only: we look the email up against the
// members table (service role, pre-auth) and only send a link if it's a real
// member. A non-member gets a polite dead end — never an account, never an
// error page (R1 acceptance criteria). The auth user is linked to the member
// row on first sign-in, in the /auth/callback route.
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: "not_member" | "error"; message?: string };

export async function sendMagicLink(email: string): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return { ok: false, reason: "error", message: "Enter a valid email." };
  }

  // Pre-auth membership check (service role bypasses RLS). Case-insensitive.
  const admin = createAdminClient();
  const { data: member, error: lookupErr } = await admin
    .from("members")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();

  if (lookupErr) {
    console.error("sign-in: member lookup failed", lookupErr);
    return { ok: false, reason: "error", message: "Something went wrong. Try again." };
  }
  if (!member) {
    // Polite dead end — the UI shows Dana's number.
    return { ok: false, reason: "not_member" };
  }

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // First-time members have no auth user yet; create it, then link in the
      // callback. Only members reach this line, so no stranger gets an account.
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("sign-in: signInWithOtp failed", error);
    return { ok: false, reason: "error", message: "Couldn't send the link. Try again." };
  }
  return { ok: true };
}
