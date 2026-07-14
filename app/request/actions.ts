"use server";
// Member submits a free-text request (R1). Reads the member + property from the
// signed-in session (RLS), then inserts via create_member_request (0012), which
// stamps actor 'member' and inserts atomically.
//
// Triage flow (R2): after the booking lands as 'requested', we call triageIntake
// to classify and route. The AI outcome is stored in ai_events and applied to
// the booking atomically via apply_triage (0013), which sets kind/triage/status
// and audits the change. The member is redirected to the booking status page.
// NEVER throws because a model call failed — triageIntake() guarantees a result
// suitable for needs_review (the fallback path).

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { triageIntake, type MemberContext } from "@/lib/triage";
import { DEMO_MEMBER_ID } from "@/lib/brand";

export async function submitRequest(
  text: string,
): Promise<{ ok: false; message: string } | void> {
  const t = text.trim();
  if (!t) return { ok: false, message: "Please describe the problem first." };

  const supabase = await createClient();
  const [{ data: member }, { data: props }] = await Promise.all([
    supabase.from("members").select("id, business_id, full_name").maybeSingle(),
    supabase.from("properties").select("id, address, zip").limit(1),
  ]);
  const property = props?.[0];
  if (!member || !property) {
    return { ok: false, message: "We couldn't find your account. Try signing in again." };
  }

  // Rate-limit demo member intake requests (6 per 600-second window).
  // Real members (paying customers) are never throttled (G1: zero-lost-intake).
  if (member.id === DEMO_MEMBER_ID) {
    try {
      const admin = createAdminClient();
      const headersList = await headers();
      // x-real-ip is set by the Vercel proxy to the TRUE client IP. Do not trust
      // the leftmost x-forwarded-for value — it is client-supplied and spoofable
      // (a caller can prepend a random IP to mint a fresh bucket every request).
      // Fall back to the RIGHTMOST forwarded hop, which the platform appended.
      const realIp = headersList.get("x-real-ip")?.trim();
      const forwardedFor = headersList.get("x-forwarded-for");
      const xffTrusted = forwardedFor
        ? forwardedFor.split(",").map((s) => s.trim()).filter(Boolean).pop()
        : undefined;
      const clientIp = realIp || xffTrusted || "unknown";

      const { data: allowed, error: limiterError } = await admin.rpc("check_rate_limit", {
        p_key: `intake:${clientIp}`,
        p_max: 6,
        p_window_seconds: 600,
      });

      if (limiterError) {
        // Fail open on error: log and continue.
        console.error("check_rate_limit error (failing open)", limiterError);
      } else if (allowed === false) {
        // Throttled: return rate-limit message.
        return {
          ok: false,
          message: "You're going a little fast for the demo — give it a moment and try again.",
        };
      }
    } catch (err) {
      // Fail open on any error (network, parse, etc.): log and continue.
      console.error("rate-limit guard error (failing open)", err);
    }
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

  // Build MemberContext for triage
  const bookingId = (booking as { id: string }).id;

  // Fetch member's properties and service_zips via admin client (service-role only)
  const [{ data: allProps }, { data: serviceZipsData }] = await Promise.all([
    supabase.from("properties").select("address, zip"),
    admin.from("service_zips").select("zip"),
  ]);

  const serviceZips = (serviceZipsData ?? []).map((row: { zip: string }) => row.zip);
  const properties = (allProps ?? []).map((p: { address: string; zip: string }) => ({
    address: p.address,
    zip: p.zip,
    inServiceArea: serviceZips.includes(p.zip),
  }));

  // Fetch membership plan weekly_day
  const { data: memberships } = await supabase
    .from("memberships")
    .select("plans(weekly_day)")
    .eq("member_id", member.id)
    .limit(1);

  const dayLabels = [
    "Sundays",
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
  ];
  const membership = memberships?.[0];
  const plans = Array.isArray(membership?.plans) ? membership.plans[0] : membership?.plans;
  const planDayLabel =
    plans && typeof plans === "object" && "weekly_day" in plans
      ? dayLabels[plans.weekly_day] ?? null
      : null;

  const ctx: MemberContext = {
    memberName: member.full_name,
    properties,
    planDayLabel,
    serviceZips,
  };

  // Call triage (NEVER throws into the flow)
  const outcome = await triageIntake(t, ctx);

  // Insert aiEvent into ai_events via admin client
  const { error: aiEventError } = await admin.from("ai_events").insert(outcome.aiEvent);
  if (aiEventError) {
    console.error("failed to insert ai_event", aiEventError);
    // Do NOT return early — the booking exists, and we must still route it
  }

  // Decide status and kind based on triage route
  let status: "awaiting_deposit" | "needs_review";
  let kind: "repair" | "one_off_clean";

  if (outcome.route === "auto_qualified" && outcome.result?.service_type === "repair") {
    status = "awaiting_deposit";
    kind = "repair";
  } else if (
    outcome.route === "auto_qualified" &&
    outcome.result?.service_type === "one_off_clean"
  ) {
    status = "needs_review";
    kind = "one_off_clean";
  } else {
    // needs_review for any reason
    status = "needs_review";
    kind = outcome.result?.service_type === "one_off_clean" ? "one_off_clean" : "repair";
  }

  // Apply triage atomically via the RPC
  const { error: triageError } = await admin.rpc("apply_triage", {
    p_booking_id: bookingId,
    p_kind: kind,
    p_triage: outcome.result,
    p_to_status: status,
    p_actor: "system",
  });

  if (triageError) {
    console.error("apply_triage failed", triageError);
    // The booking exists at 'requested'; do not strand the member. Redirect anyway.
  }

  redirect(`/request/${bookingId}`);
}
