"use server";
// Deposit checkout (R4 / D6). Reads the booking (RLS-scoped) and validates state,
// creates a Stripe Checkout Session, inserts a pending payment row, then redirects.
// The webhook (stripe-webhook function) verifies and transitions the booking after
// payment confirms — the redirect back with ?paid=1 is cosmetic (R4, never-cut #2).
//
// redirect() throws NEXT_REDIRECT as control flow; the try/catch guards ONLY the
// Stripe/insert calls so the throw isn't swallowed and the navigation actually
// happens.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDepositCheckoutSession } from "@/lib/stripe/checkout";

export async function startDepositCheckout(
  bookingId: string,
): Promise<{ ok: false; message: string } | void> {
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, deposit_required")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    return { ok: false, message: "We couldn't find that request." };
  }
  if (booking.status !== "awaiting_deposit") {
    return { ok: false, message: "This request isn't awaiting a deposit." };
  }

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  let url: string;
  try {
    const session = await createDepositCheckoutSession({ bookingId, origin });
    const admin = createAdminClient();
    // The webhook matches on stripe_checkout_session_id — the row MUST exist
    // before the user completes checkout for the webhook to flip it to 'paid'.
    // If this insert fails, we CANNOT redirect: the user would pay and the
    // webhook would have nothing to authorize (never-cut #2).
    const { error: payErr } = await admin.from("payments").insert({
      booking_id: bookingId,
      amount_cents: 7500,
      status: "pending",
      stripe_checkout_session_id: session.sessionId,
    });
    if (payErr) throw payErr;
    url = session.url;
  } catch (error) {
    console.error("startDepositCheckout failed", error);
    return { ok: false, message: "Couldn't open checkout — try again." };
  }

  redirect(url); // outside try/catch: its NEXT_REDIRECT throw must propagate
}
