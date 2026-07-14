"use server";
// Shared portal server actions.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_MEMBER_ID, DEMO_MEMBER_EMAIL } from "@/lib/brand";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// The single browser-writable surface (R1): a member updates their own access
// notes. This goes through the AUTHED client — RLS + the access_notes column
// grant (0005) allow exactly this and nothing else, and the stamp trigger
// records who/when. No service role needed.
export async function updateAccessNotes(
  propertyId: string,
  notes: string,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ access_notes: notes.trim() || null })
    .eq("id", propertyId);
  if (error) {
    console.error("updateAccessNotes failed", error);
    return { ok: false, message: "Couldn't save — try again." };
  }
  revalidatePath("/");
  return { ok: true };
}

// Demo session: create or find the demo auth user, link to demo member, and
// log in via verified magic link (a genuine authenticated session, RLS-scoped
// to Ken). No stored password; service role is server-only.
export async function enterDemo(): Promise<void> {
  const admin = createAdminClient();

  // Ensure demo auth user exists (idempotent).
  let demoAuthUserId: string;
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: DEMO_MEMBER_EMAIL,
    email_confirm: true,
  });

  if (!createErr && newUser.user) {
    demoAuthUserId = newUser.user.id;
  } else if (createErr) {
    // User already exists; find it by email.
    const { data: users, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) throw listErr;
    const existing = users.users.find(
      (u) => u.email?.toLowerCase() === DEMO_MEMBER_EMAIL.toLowerCase(),
    );
    if (!existing) throw new Error("Demo auth user not found and could not be created");
    demoAuthUserId = existing.id;
  } else {
    throw new Error("Could not create or find demo auth user");
  }

  // Link auth user to demo member row (service role bypasses RLS). Set it
  // unconditionally so the member always points at the current demo auth user
  // even if a prior run/remap left a stale user_id — RLS keys off this link.
  const { error: linkErr } = await admin
    .from("members")
    .update({ user_id: demoAuthUserId })
    .eq("id", DEMO_MEMBER_ID);
  if (linkErr) throw linkErr;

  // Mint a real session: generate a magic-link token, then verify it on the
  // cookie-bound SSR client so the auth cookies are actually written (mirrors
  // app/auth/callback). Redirecting to the raw action_link would NOT establish
  // a server session. RLS then scopes everything to the demo member.
  const { data, error: genErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_MEMBER_EMAIL,
  });
  if (genErr || !data?.properties?.hashed_token) {
    throw genErr || new Error("Could not generate demo link");
  }
  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyErr) throw verifyErr;

  redirect("/");
}
