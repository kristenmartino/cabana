import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberEmailPattern } from "./email";

// A verified email proves identity; an existing member row grants portal access.
export async function linkMemberSession(client: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (!userError && user?.email) {
    const admin = createAdminClient();
    const { data: member, error } = await admin.from("members")
      .select("id, user_id")
      .ilike("email", memberEmailPattern(user.email))
      .maybeSingle();

    if (!error && member && (!member.user_id || member.user_id === user.id)) {
      if (member.user_id === user.id) return true;
      const { data: linked, error: linkError } = await admin.from("members")
        .update({ user_id: user.id })
        .eq("id", member.id)
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .select("id")
        .maybeSingle();
      if (!linkError && linked) return true;
    }
  }
  // Refusing a newly authenticated non-member must not revoke other devices.
  await client.auth.signOut({ scope: "local" });
  return false;
}
