"use server";
// Shared portal server actions.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
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
