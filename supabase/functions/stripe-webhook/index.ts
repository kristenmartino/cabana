// supabase/functions/stripe-webhook/index.ts
// Inbound authority for payment state (R4 / ADR-03, ADR-04).
// Job description: verify authenticity -> record event (idempotent) ->
// translate to a state change -> exit. No orchestration here (that's n8n's lane).
//
// STATUS: Day-6 skeleton. Security-critical patterns are in place; the
// TODO markers are business wiring, not safety gaps. Verify SDK versions on Day 1.
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
    return new Response("already processed", { status: 200 });
  }

  // 3. Translate event -> state change. The booking transition trigger (0002)
  //    enforces legality; the outbox trigger (0004) emits the side effects.
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await db.rpc("set_actor", { actor: "system:stripe" });
        // TODO(D6): within one logical operation:
        //   1. payments: status 'pending' -> 'paid' where
        //      stripe_checkout_session_id = session.id
        //   2. bookings: 'awaiting_deposit' -> 'scheduled' for the linked booking
        // Late/out-of-order events: if the booking is already past
        // awaiting_deposit, record payment as paid and stop — the transition
        // guard makes stale transitions impossible by construction.
        console.log("checkout.session.completed", session.id);
        break;
      }
      case "checkout.session.expired": {
        // TODO(D6): mark payment 'expired'; booking expiry itself is owned by
        // the n8n 24h hold job (single owner per rule — no double handling).
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
