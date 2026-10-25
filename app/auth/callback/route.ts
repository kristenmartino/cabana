// Magic-link callback (R1). Supabase redirects here with a one-time `code`;
// we exchange it for a session, then link the auth user to the member row by
// email on first sign-in (members.user_id is null until now). The link write
// needs the service role — RLS locks members down to reads.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkMemberSession } from "@/lib/auth/member-session";
import { safeNextPath } from "@/lib/auth/email";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && await linkMemberSession(supabase)) {
      const response = NextResponse.redirect(new URL(next, origin));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    if (error) console.error("auth callback: code exchange failed", error.code);
  }
  const response = NextResponse.redirect(`${origin}/sign-in?error=link`);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
