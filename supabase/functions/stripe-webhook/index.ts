// supabase/functions/stripe-webhook/index.ts
// Inbound authority for payment state (R4 / ADR-03, ADR-04).
// Job description: verify authenticity -> record event (idempotent) ->
// translate to a state change -> exit. No orchestration here (that's n8n's lane).
//
// STATUS: wired (D6 pulled forward with the 0008 actor-attribution fix).
// Acceptance suite: tests/webhooks/stripe.test.ts — replay, out-of-order,
// stale-event, and signature behavior; keep it green (never-cut #2).
//
// Local dev: `stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook`

import Stripe from "npm:stripe";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// Service role: this function is trusted; RLS does not apply to it.
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  // 1. Verify the signature against the RAW body. An unsigned or invalid
  //    request is logged and rejected — never processed "just in case".
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("stripe-webhook: signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  // 2. Idempotency ledger: insert the event id; a conflict means we've already
  //    processed it (or are processing it) — ack 200 and exit. This is what
  //    makes Stripe's retries and duplicates safe (R4 acceptance criteria).
  const { data: inserted, error: insertErr } = await db
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
    .select("id")
    .maybeSingle();

  if (insertErr && insertErr.code !== "23505") {
    // Unexpected DB failure: do NOT ack — let Stripe retry.
    console.error("stripe-webhook: ledger insert failed", insertErr);
    return new Response("ledger error", { status: 500 });
  }
  if (!inserted) {
    // Duplicate delivery. Ack only if a previous attempt FINISHED — a ledger
    // row with processed_at null means processing failed mid-flight, so fall
    // through and reprocess (every handler below is idempotent). Concurrent
    // duplicates may race past this check; the handlers tolerate that, and
    // the loser's retry lands here again once processed_at is set.
    const { data: prior, error: priorErr } = await db
      .from("stripe_events")
      .select("processed_at")
      .eq("id", event.id)
      .single();
    if (priorErr) {
      console.error("stripe-webhook: ledger lookup failed", priorErr);
      return new Response("ledger error", { status: 500 });
    }
    if (prior.processed_at) {
      return new Response("already processed", { status: 200 });
    }
  }

  // 3. Translate event -> state change. The booking transition trigger (0002)
  //    enforces legality; the outbox trigger (0004) emits the side effects.
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;

        // A session can complete UNPAID (delayed-notification methods: ACH,
        // bank transfer, OXXO…). Money truth is payment_status, not session
        // completion — settlement arrives later as async_payment_succeeded/
        // failed (R4, never-cut #2). Ack and wait; nothing to record yet.
        if (session.payment_status !== "paid") {
          console.log("stripe-webhook: session completed but unpaid, awaiting async result", session.id);
          break;
        }

        // Money truth first: the payment row flips to paid wherever the
        // booking is — late events still record the money accurately (R4).
        const { data: payment, error: payErr } = await db
          .from("payments")
          .update({ status: "paid" })
          .eq("stripe_checkout_session_id", session.id)
          .select("booking_id")
          .maybeSingle();
        if (payErr) throw payErr;
        if (!payment) {
          // No payment row for this session. The ledger keeps the payload for
          // the nightly reconciliation; ack — a retry cannot fix this.
          console.error("stripe-webhook: no payment for session", session.id);
          break;
        }

        const { data: booking, error: bookingErr } = await db
          .from("bookings")
          .select("status")
          .eq("id", payment.booking_id)
          .single();
        if (bookingErr) throw bookingErr;

        // Advance only from awaiting_deposit; anything else is a late/stale
        // event — payment recorded above, booking already moved on.
        // transition_booking (0008) runs set_config + UPDATE in ONE
        // transaction so the audit row says 'system:stripe'. Never
        // rpc("set_actor") then .update(): each PostgREST request is its own
        // transaction, so the actor dies with the first call and the audit
        // would say 'system'.
        if (booking.status === "awaiting_deposit") {
          const { error: trErr } = await db.rpc("transition_booking", {
            p_booking_id: payment.booking_id,
            p_to_status: "scheduled",
            p_actor: "system:stripe",
          });
          if (trErr) throw trErr;
        }
        console.log(event.type, session.id);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Async settlement failed: release the hold like an expiry —
        // pending-only, so a paid row can never regress.
        const { error: failErr } = await db
          .from("payments")
          .update({ status: "expired" })
          .eq("stripe_checkout_session_id", session.id)
          .eq("status", "pending");
        if (failErr) throw failErr;
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Only a pending payment can expire — a late 'expired' after
        // 'completed' must not regress a paid row. Booking expiry itself is
        // owned by the n8n 24h hold job (single owner per rule — no double
        // handling).
        const { error: expErr } = await db
          .from("payments")
          .update({ status: "expired" })
          .eq("stripe_checkout_session_id", session.id)
          .eq("status", "pending");
        if (expErr) throw expErr;
        break;
      }
      default:
        // Unhandled event types are recorded in the ledger and acked.
        break;
    }

    await db.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("stripe-webhook: processing failed", err);
    // Leave processed_at null; Stripe will retry; ledger row makes the retry idempotent.
    return new Response("processing error", { status: 500 });
  }
});
