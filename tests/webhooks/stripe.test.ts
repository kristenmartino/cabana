// tests/webhooks/stripe.test.ts
// Gate-2 acceptance suite for the stripe-webhook edge function (R4/ADR-03):
// replay, out-of-order, and signature behavior asserted against the REAL
// function served by the local stack — fixture events signed with the same
// secret the function verifies, no Stripe account required.
//
// Run: supabase start && npm run db:reset && npm run test:webhooks
// Needs supabase/functions/.env (gitignored) providing:
//   STRIPE_SECRET_KEY=sk_test_dummy_key_for_signing_only
//   STRIPE_WEBHOOK_SECRET=whsec_cabana_local_test   (or export the same var here)
// and [functions.stripe-webhook] verify_jwt = false in supabase/config.toml
// (Stripe cannot send Supabase JWTs; authenticity is the signature).
//
// STATUS: authored red->green ahead of the TODO(D6) wiring (execution-plan
// Phase 3). The "signature + ledger" group must be green NOW and stay green;
// the "state wiring" group goes green when the D6 handlers land. Gate 2 is
// not passable until this whole file is green.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { serviceClient, stackEnv } from "../helpers/local-stack";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_cabana_local_test";
const RUN = Date.now();

// Seed anchors (supabase/seed.sql).
const BUSINESS = "b1000000-0000-4000-8000-000000000001";
const KEN = {
  memberId: "a1000000-0000-4000-8000-000000000001",
  propertyId: "c1000000-0000-4000-8000-000000000001",
};

// Run-unique fixtures so reruns never collide with the idempotency ledger.
const CS_MAIN = `cs_test_${RUN}_main`;
const CS_STALE = `cs_test_${RUN}_stale`;
const EVT_COMPLETED = `evt_test_${RUN}_completed`;
const EVT_EXPIRED = `evt_test_${RUN}_expired`;
const EVT_STALE = `evt_test_${RUN}_stale`;
const EVT_UNHANDLED = `evt_test_${RUN}_unhandled`;

const stripe = new Stripe("sk_test_dummy_key_for_signing_only");

function checkoutEvent(id: string, type: string, sessionId: string): string {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: { id: sessionId, object: "checkout.session", payment_status: "paid" } },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  });
}

function fnUrl(): string {
  return `${stackEnv().FUNCTIONS_URL}/stripe-webhook`;
}

async function post(payload: string, signature?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["stripe-signature"] = signature;
  return fetch(fnUrl(), { method: "POST", headers, body: payload });
}

function sign(payload: string): string {
  return stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
}

let S: SupabaseClient;
let mainBookingId: string;
let staleBookingId: string;
const createdPaymentIds: string[] = [];

beforeAll(async () => {
  // Reachability preflight with actionable failures — this suite must never
  // "pass" by silently not talking to the function.
  let probe: Response;
  try {
    probe = await post(checkoutEvent(`evt_test_${RUN}_probe`, "ping", "cs_probe"));
  } catch (err) {
    throw new Error(
      `stripe-webhook is unreachable at ${fnUrl()}. Run \`supabase start\` ` +
        `(edge runtime serves supabase/functions/*).\n${String(err)}`,
    );
  }
  if (probe.status === 401) {
    throw new Error(
      "The functions gateway rejected the request with 401. Add " +
        "[functions.stripe-webhook] verify_jwt = false to supabase/config.toml " +
        "and restart the stack — Stripe authenticates via signature, not JWT.",
    );
  }
  if (probe.status !== 400) {
    throw new Error(
      `Expected 400 (missing signature) from the preflight, got ${probe.status}. ` +
        "If the function failed to boot, check supabase/functions/.env " +
        "(STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET).",
    );
  }

  S = serviceClient();

  // Fixture 1: the money-path booking — awaiting_deposit with a pending
  // payment linked to CS_MAIN (what the server action will create on D5/D6).
  const { data: b1, error: b1Err } = await S.from("bookings")
    .insert({
      business_id: BUSINESS,
      property_id: KEN.propertyId,
      member_id: KEN.memberId,
      kind: "repair",
      status: "awaiting_deposit",
      deposit_required: true,
      request_text: `webhook-test main [run ${RUN}]`,
    })
    .select("id")
    .single();
  if (b1Err) throw new Error(`fixture booking insert failed: ${b1Err.message}`);
  mainBookingId = b1!.id;

  const { data: p1, error: p1Err } = await S.from("payments")
    .insert({
      booking_id: mainBookingId,
      amount_cents: 7500,
      status: "pending",
      stripe_checkout_session_id: CS_MAIN,
    })
    .select("id")
    .single();
  if (p1Err) throw new Error(`fixture payment insert failed: ${p1Err.message}`);
  createdPaymentIds.push(p1!.id);

  // Fixture 2: a booking already PAST awaiting_deposit (late/stale event case).
  const { data: b2, error: b2Err } = await S.from("bookings")
    .insert({
      business_id: BUSINESS,
      property_id: KEN.propertyId,
      member_id: KEN.memberId,
      kind: "repair",
      status: "confirmed",
      deposit_required: true,
      request_text: `webhook-test stale [run ${RUN}]`,
    })
    .select("id")
    .single();
  if (b2Err) throw new Error(`fixture booking insert failed: ${b2Err.message}`);
  staleBookingId = b2!.id;

  const { data: p2, error: p2Err } = await S.from("payments")
    .insert({
      booking_id: staleBookingId,
      amount_cents: 7500,
      status: "paid",
      stripe_checkout_session_id: CS_STALE,
    })
    .select("id")
    .single();
  if (p2Err) throw new Error(`fixture payment insert failed: ${p2Err.message}`);
  createdPaymentIds.push(p2!.id);
});

afterAll(async () => {
  if (!S) return;
  const bookingIds = [mainBookingId, staleBookingId].filter(Boolean);
  if (createdPaymentIds.length > 0) {
    await S.from("payments").delete().in("id", createdPaymentIds);
  }
  if (bookingIds.length > 0) {
    await S.from("booking_transitions").delete().in("booking_id", bookingIds);
    for (const id of bookingIds) {
      await S.from("outbox").delete().like("dedupe_key", `${id}:%`);
    }
    await S.from("bookings").delete().in("id", bookingIds);
  }
  await S.from("stripe_events")
    .delete()
    .in("id", [EVT_COMPLETED, EVT_EXPIRED, EVT_STALE, EVT_UNHANDLED]);
});

describe("signature verification + idempotency ledger (implemented — must stay green)", () => {
  it("unsigned request is rejected with 400", async () => {
    const res = await post(checkoutEvent(`evt_test_${RUN}_unsigned`, "checkout.session.completed", CS_MAIN));
    expect(res.status).toBe(400);
  });

  it("invalid signature is rejected with 400 and never reaches the ledger", async () => {
    const evtId = `evt_test_${RUN}_badsig`;
    const res = await post(
      checkoutEvent(evtId, "checkout.session.completed", CS_MAIN),
      "t=1,v1=deadbeef",
    );
    expect(res.status).toBe(400);

    const { data } = await S.from("stripe_events").select("id").eq("id", evtId);
    expect(data).toEqual([]);
  });

  it("valid signed event is acked 200 and recorded in stripe_events with processed_at", async () => {
    const payload = checkoutEvent(EVT_COMPLETED, "checkout.session.completed", CS_MAIN);
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);

    const { data, error } = await S.from("stripe_events")
      .select("id, type, processed_at")
      .eq("id", EVT_COMPLETED)
      .single();
    expect(error).toBeNull();
    expect(data!.type).toBe("checkout.session.completed");
    expect(data!.processed_at).not.toBeNull();
  });

  it("replaying the same event N times acks 200 each time and leaves exactly one ledger row", async () => {
    const payload = checkoutEvent(EVT_COMPLETED, "checkout.session.completed", CS_MAIN);
    const signature = sign(payload);
    for (let i = 0; i < 3; i++) {
      const res = await post(payload, signature);
      expect(res.status).toBe(200);
    }
    const { count } = await S.from("stripe_events")
      .select("*", { count: "exact", head: true })
      .eq("id", EVT_COMPLETED);
    expect(count).toBe(1);
  });

  it("unhandled event types are acked 200 and ledgered (Stripe must not retry them)", async () => {
    const payload = checkoutEvent(EVT_UNHANDLED, "payment_intent.created", CS_MAIN);
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);

    const { data } = await S.from("stripe_events")
      .select("processed_at")
      .eq("id", EVT_UNHANDLED)
      .single();
    expect(data!.processed_at).not.toBeNull();
  });
});

describe("state wiring — TODO(D6), red until execution-plan Phase 3 lands (R4 AC)", () => {
  it("checkout.session.completed marks the payment paid (exactly one payment row)", async () => {
    // EVT_COMPLETED was delivered (and replayed) above.
    const { data, error } = await S.from("payments")
      .select("id, status")
      .eq("stripe_checkout_session_id", CS_MAIN);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe("paid");
  });

  it("completed event advances awaiting_deposit -> scheduled exactly once, audited as system:stripe", async () => {
    const { data: booking } = await S.from("bookings")
      .select("status")
      .eq("id", mainBookingId)
      .single();
    expect(booking!.status).toBe("scheduled");

    const { data: audit } = await S.from("booking_transitions")
      .select("from_status, to_status, actor")
      .eq("booking_id", mainBookingId)
      .eq("to_status", "scheduled");
    expect(audit).toEqual([
      { from_status: "awaiting_deposit", to_status: "scheduled", actor: "system:stripe" },
    ]);
  });

  it("out-of-order: a late checkout.session.expired after completed does not regress the paid payment", async () => {
    const payload = checkoutEvent(EVT_EXPIRED, "checkout.session.expired", CS_MAIN);
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);

    const { data } = await S.from("payments")
      .select("status")
      .eq("stripe_checkout_session_id", CS_MAIN)
      .single();
    expect(data!.status).toBe("paid");
  });

  it("stale completed event for a booking already past awaiting_deposit records payment and stops (no illegal transition, no 500)", async () => {
    const payload = checkoutEvent(EVT_STALE, "checkout.session.completed", CS_STALE);
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);

    const { data: booking } = await S.from("bookings")
      .select("status")
      .eq("id", staleBookingId)
      .single();
    expect(booking!.status).toBe("confirmed"); // untouched

    const { data: payment } = await S.from("payments")
      .select("status")
      .eq("stripe_checkout_session_id", CS_STALE)
      .single();
    expect(payment!.status).toBe("paid");

    const { data: audit } = await S.from("booking_transitions")
      .select("to_status")
      .eq("booking_id", staleBookingId)
      .eq("to_status", "scheduled");
    expect(audit).toEqual([]);
  });
});
