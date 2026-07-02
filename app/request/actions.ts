"use server";
// Member submits a free-text request (R1). Reads the member + property from the
// signed-in session (RLS), then inserts via create_member_request (0012), which
// stamps actor 'member' and inserts atomically. Browsers can't write bookings
// (write lockdown), so the insert itself runs through the service role.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function submitRequest(
  text: string,
): Promise<{ ok: false; message: string } | void> {
  const t = text.trim();
  if (!t) return { ok: false, message: "Please describe the problem first." };

  const supabase = await createClient();
  const [{ data: member }, { data: props }] = await Promise.all([
    supabase.from("members").select("id, business_id").maybeSingle(),
    supabase.from("properties").select("id").limit(1),
  ]);
  const property = props?.[0];
  if (!member || !property) {
    return { ok: false, message: "We couldn't find your account. Try signing in again." };
  }

  const admin = createAdminClient();
  const { data: booking, error } = await admin.rpc("create_member_request", {
    p_business_id: member.business_id,
    p_property_id: property.id,
    p_member_id: member.id,
    p_request_text: t,
  });
  if (error || !booking) {
    console.error("submitRequest failed", error);
    return { ok: false, message: "Something went wrong sending your request." };
  }

  redirect(`/request/${(booking as { id: string }).id}`);
}
