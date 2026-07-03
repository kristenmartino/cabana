// Magic-link callback (R1). Supabase redirects here with a one-time `code`;
// we exchange it for a session, then link the auth user to the member row by
// email on first sign-in (members.user_id is null until now). The link write
// needs the service role — RLS locks members down to reads.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        const admin = createAdminClient();
        const { error: linkErr } = await admin
          .from("members")
          .update({ user_id: user.id })
          .ilike("email", user.email)
          .is("user_id", null);
        if (linkErr) console.error("auth callback: member link failed", linkErr);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("auth callback: code exchange failed", error);
  }
  return NextResponse.redirect(`${origin}/sign-in?error=link`);
}
