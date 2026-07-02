// tests/webhooks/stripe.test.ts
// Gate-2 acceptance suite for the stripe-webhook edge function (R4/ADR-03):
// replay, out-of-order, async-settlement, and signature behavior asserted
// against the REAL function served by the local stack — fixture events signed
// with the same secret the function verifies, no Stripe account required.
//
// Run: supabase start && npm run db:reset && npm run test:webhooks
// Needs supabase/functions/.env (gitignored) providing:
//   STRIPE_SECRET_KEY=sk_test_dummy_key_for_signing_only
//   STRIPE_WEBHOOK_SECRET=whsec_cabana_local_test   (or export the same var here)
// and [functions.stripe-webhook] verify_jwt = false in supabase/config.toml
// (Stripe cannot send Supabase JWTs; authenticity is the signature).
//
// STATUS: green — authored red->green on Day 2 and satisfied the same day by
// the pulled-forward D6 wiring. This file is never-cut #2's regression gate;
// it runs in CI's db job and must stay green.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { awaitApiReady, serviceClient, stackEnv } from "../helpers/local-stack";

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
const CS_ASYNC = `cs_test_${RUN}_async`;
const CS_MIDFLIGHT = `cs_test_${RUN}_midflight`;
const EVT_COMPLETED = `evt_test_${RUN}_completed`;
const EVT_EXPIRED = `evt_test_${RUN}_expired`;
const EVT_STALE = `evt_test_${RUN}_stale`;
const EVT_UNHANDLED = `evt_test_${RUN}_unhandled`;
const EVT_ASYNC_UNPAID = `evt_test_${RUN}_async_unpaid`;
const EVT_ASYNC_OK = `evt_test_${RUN}_async_ok`;
const EVT_MIDFLIGHT = `evt_test_${RUN}_midflight`;
const ALL_EVENT_IDS = [
  EVT_COMPLETED,
  EVT_EXPIRED,
  EVT_STALE,
  EVT_UNHANDLED,
  EVT_ASYNC_UNPAID,
  EVT_ASYNC_OK,
  EVT_MIDFLIGHT,
];

const stripe = new Stripe("sk_test_dummy_key_for_signing_only");

function checkoutEvent(
  id: string,
  type: string,
  sessionId: string,
  paymentStatus = "paid",
): string {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type,
    data: {
      object: { id: sessionId, object: "checkout.session", payment_status: paymentStatus },
    },
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
let asyncBookingId: string;
let midflightBookingId: string;
const createdBookingIds: string[] = [];
const createdPaymentIds: string[] = [];

// Booking + linked payment, the shape the D5/D6 server action will create.
async function fixturePair(
  bookingStatus: string,
  paymentStatus: string,
  sessionId: string,
  label: string,
): Promise<string> {
  const { data: b, error: bErr } = await S.from("bookings")
    .insert({
      business_id: BUSINESS,
      property_id: KEN.propertyId,
      member_id: KEN.memberId,
      kind: "repair",
      status: bookingStatus,
      deposit_required: true,
      request_text: `webhook-test ${label} [run ${RUN}]`,
    })
    .select("id")
    .single();
  if (bErr) throw new Error(`fixture booking insert failed: ${bErr.message}`);
  createdBookingIds.push(b!.id);

  const { data: p, error: pErr } = await S.from("payments")
    .insert({
      booking_id: b!.id,
      amount_cents: 7500,
      status: paymentStatus,
      stripe_checkout_session_id: sessionId,
    })
    .select("id")
    .single();
  if (pErr) throw new Error(`fixture payment insert failed: ${pErr.message}`);
  createdPaymentIds.push(p!.id);
  return b!.id;
}

beforeAll(async () => {
  await awaitApiReady();
  // Reachability preflight with actionable failures — this suite must never
  // "pass" by silently not talking to the function. Retries cover the edge
  // runtime warming up after `supabase start` / `db reset` container restarts.
  let probe: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      probe = await post(checkoutEvent(`evt_test_${RUN}_probe`, "ping", "cs_probe"));
      if (probe.status !== 502 && probe.status !== 503) break;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (!probe) {
    throw new Error(
      `stripe-webhook is unreachable at ${fnUrl()}. Run \`supabase start\` ` +
        `(edge runtime serves supabase/functions/*).\n${String(lastErr)}`,
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
  // The money-path booking: awaiting_deposit + pending payment (D5/D6 shape).
  mainBookingId = await fixturePair("awaiting_deposit", "pending", CS_MAIN, "main");
  // A booking already PAST awaiting_deposit (late/stale event case).
  staleBookingId = await fixturePair("confirmed", "paid", CS_STALE, "stale");
  // Async-settlement path: completes unpaid, settles later.
  asyncBookingId = await fixturePair("awaiting_deposit", "pending", CS_ASYNC, "async");
  // Died-mid-flight reprocess path.
  midflightBookingId = await fixturePair("awaiting_deposit", "pending", CS_MIDFLIGHT, "midflight");
}, 90_000);

afterAll(async () => {
  if (!S) return;
  if (createdPaymentIds.length > 0) {
    await S.from("payments").delete().in("id", createdPaymentIds);
  }
  if (createdBookingIds.length > 0) {
    await S.from("booking_transitions").delete().in("booking_id", createdBookingIds);
    for (const id of createdBookingIds) {
      await S.from("outbox").delete().like("dedupe_key", `${id}:%`);
    }
    await S.from("bookings").delete().in("id", createdBookingIds);
  }
  await S.from("stripe_events").delete().in("id", ALL_EVENT_IDS);
});

describe("signature verification + idempotency ledger", () => {
  it("unsigned request is rejected with 400", async () => {
    const res = await post(
      checkoutEvent(`evt_test_${RUN}_unsigned`, "checkout.session.completed", CS_MAIN),
    );
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

  it("a duplicate whose first attempt died mid-flight (ledger row, processed_at null) is reprocessed, not acked away", async () => {
    // Simulate a crash between ledger insert and handler: row exists,
    // processed_at null, state never advanced. Stripe's retry must reprocess.
    const { error: preErr } = await S.from("stripe_events").insert({
      id: EVT_MIDFLIGHT,
      type: "checkout.session.completed",
      payload: {},
    });
    expect(preErr).toBeNull();

    const payload = checkoutEvent(EVT_MIDFLIGHT, "checkout.session.completed", CS_MIDFLIGHT);
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);

    const { data: payment } = await S.from("payments")
      .select("status")
      .eq("stripe_checkout_session_id", CS_MIDFLIGHT)
      .single();
    expect(payment!.status).toBe("paid");

    const { data: booking } = await S.from("bookings")
      .select("status")
      .eq("id", midflightBookingId)
      .single();
    expect(booking!.status).toBe("scheduled");

    const { data: ledger } = await S.from("stripe_events")
      .select("processed_at")
      .eq("id", EVT_MIDFLIGHT)
      .single();
    expect(ledger!.processed_at).not.toBeNull();
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

describe("state wiring (R4 acceptance — Gate 2 regression gate)", () => {
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

  it("completed with payment_status 'unpaid' records nothing — money truth is payment_status, not session completion", async () => {
    const payload = checkoutEvent(
      EVT_ASYNC_UNPAID,
      "checkout.session.completed",
      CS_ASYNC,
      "unpaid",
    );
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);

    const { data: payment } = await S.from("payments")
      .select("status")
      .eq("stripe_checkout_session_id", CS_ASYNC)
      .single();
    expect(payment!.status).toBe("pending");

    const { data: booking } = await S.from("bookings")
      .select("status")
      .eq("id", asyncBookingId)
      .single();
    expect(booking!.status).toBe("awaiting_deposit");

    const { data: ledger } = await S.from("stripe_events")
      .select("processed_at")
      .eq("id", EVT_ASYNC_UNPAID)
      .single();
    expect(ledger!.processed_at).not.toBeNull();
  });

  it("async_payment_succeeded settles the deposit: paid + scheduled, audited as system:stripe", async () => {
    const payload = checkoutEvent(
      EVT_ASYNC_OK,
      "checkout.session.async_payment_succeeded",
      CS_ASYNC,
    );
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);

    const { data: payment } = await S.from("payments")
      .select("status")
      .eq("stripe_checkout_session_id", CS_ASYNC)
      .single();
    expect(payment!.status).toBe("paid");

    const { data: booking } = await S.from("bookings")
      .select("status")
      .eq("id", asyncBookingId)
      .single();
    expect(booking!.status).toBe("scheduled");

    const { data: audit } = await S.from("booking_transitions")
      .select("from_status, to_status, actor")
      .eq("booking_id", asyncBookingId)
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
