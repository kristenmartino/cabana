"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { linkMemberSession } from "@/lib/auth/member-session";
import { validEmailToken } from "@/lib/auth/email";

export async function completeEmailSignIn(form: FormData): Promise<void> {
  const tokenHash = form.get("token_hash");
  if (!validEmailToken(tokenHash)) redirect("/sign-in?error=link");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) redirect("/sign-in?error=link");
  if (!(await linkMemberSession(supabase))) redirect("/sign-in?error=link");
  redirect("/");
}
