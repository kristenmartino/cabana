// tests/rls/rls.test.ts
// The security boundary is the database, so the security tests talk to the
// database — three clients, three privilege levels, adversarial assertions
// (R1/R8, 0005_rls.sql). Runs against the local Supabase stack:
//   supabase start && supabase db reset && npm run test:rls
//
// STATUS: implemented (Day 2, pulled forward from the Day-4 slot — it gates
// everything after it). Fixtures: two auth users created via the local
// service role and linked to seed members Ken (a1...01) and Priya (a1...02);
// service role as the control. Seed UUIDs are stable — referenced directly.
// Booking invariants that need single-transaction control (set_actor + write,
// DST math) go through a direct Postgres connection.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pool } from "pg";
import {
  anonClient,
  awaitApiReady,
  dbPool,
  memberClient,
  serviceClient,
} from "../helpers/local-stack";

// Seed world (supabase/seed.sql — fixed UUIDs by design).
const BUSINESS = "b1000000-0000-4000-8000-000000000001";
const KEN = {
  memberId: "a1000000-0000-4000-8000-000000000001",
  email: "ken.alvarez@example.com",
  propertyId: "c1000000-0000-4000-8000-000000000001",
  bookingIds: [
    "d1000000-0000-4000-8000-000000000003", // awaiting_deposit
    "d1000000-0000-4000-8000-000000000008", // no_show
  ],
  paymentId: "e1000000-0000-4000-8000-000000000003",
};
const PRIYA = {
  memberId: "a1000000-0000-4000-8000-000000000002",
  email: "priya.nair@example.com",
  propertyId: "c1000000-0000-4000-8000-000000000002",
};
const OTHER_MEMBERS_PAYMENT = "e1000000-0000-4000-8000-000000000004"; // Rosa's, paid
const COMPLETED_BOOKING = "d1000000-0000-4000-8000-000000000006"; // terminal state
const TECH_RAY = "7e000000-0000-4000-8000-000000000003";

// Tables with RLS on and no policies: service-role-only by construction.
// Keep in lockstep with the "Intentionally NO policies" list in 0005_rls.sql —
// a table missing here is a table whose isolation nothing tests.
const SERVICE_ONLY_TABLES = [
  "businesses",
  "techs",
  "outbox",
  "stripe_events",
  "ai_events",
  "dead_letters",
  "telegram_chats",
  "sync_log",
  "booking_transitions",
];
const MEMBER_VISIBLE_TABLES = [
  "members",
  "properties",
  "memberships",
  "bookings",
  "payments",
  "plans",
  "service_zips",
];

const MARKER = `rls-test ${Date.now()}`;

let A: SupabaseClient; // member Ken
let B: SupabaseClient; // member Priya
let S: SupabaseClient; // service role (control)
let kenUserId: string;
let pool: Pool;
let priyaOriginalNotes: string | null;
let auditBookingId: string; // created by the set_actor audit test, reused by the dedupe test
const createdBookingIds: string[] = [];

beforeAll(async () => {
  await awaitApiReady();
  S = serviceClient();
  pool = dbPool();
  const [ken, priya] = await Promise.all([
    memberClient(KEN.email, KEN.memberId),
    memberClient(PRIYA.email, PRIYA.memberId),
  ]);
  A = ken.client;
  kenUserId = ken.userId;
  B = priya.client;

  const { data } = await S
    .from("properties")
    .select("access_notes")
    .eq("id", PRIYA.propertyId)
    .single();
  priyaOriginalNotes = data?.access_notes ?? null;
}, 90_000);

afterAll(async () => {
  // Remove rows this run created (children first: FK + outbox share the id).
  if (createdBookingIds.length > 0) {
    await S.from("booking_transitions").delete().in("booking_id", createdBookingIds);
    for (const id of createdBookingIds) {
      await S.from("outbox").delete().like("dedupe_key", `${id}:%`);
    }
    await S.from("bookings").delete().in("id", createdBookingIds);
  }
  await pool.end();
});

describe("RLS: member isolation (three-fixture adversarial suite)", () => {
  it("A reads own member row; B's row is invisible to A", async () => {
    const { data: mine, error } = await A.from("members").select("id");
    expect(error).toBeNull();
    expect(mine!.map((r) => r.id)).toEqual([KEN.memberId]);

    const { data: theirs, error: probeErr } = await A.from("members")
      .select("id")
      .eq("id", PRIYA.memberId);
    expect(probeErr).toBeNull();
    expect(theirs).toEqual([]);

    // Symmetric check from B's side.
    const { data: bMine } = await B.from("members").select("id");
    expect(bMine!.map((r) => r.id)).toEqual([PRIYA.memberId]);
  });

  it("A reads own properties/bookings/payments; B's are invisible (select returns 0 rows, not an error)", async () => {
    const { data: props, error: propsErr } = await A.from("properties").select("id");
    expect(propsErr).toBeNull();
    expect(props!.map((r) => r.id)).toEqual([KEN.propertyId]);

    const { data: bookings, error: bookingsErr } = await A.from("bookings").select("id");
    expect(bookingsErr).toBeNull();
    expect(bookings!.map((r) => r.id).sort()).toEqual([...KEN.bookingIds].sort());

    const { data: payments, error: paymentsErr } = await A.from("payments").select("id");
    expect(paymentsErr).toBeNull();
    expect(payments!.map((r) => r.id)).toEqual([KEN.paymentId]);

    // Targeted probes at B's rows: empty result, not an error.
    const { data: bProp, error: bPropErr } = await A.from("properties")
      .select("id")
      .eq("id", PRIYA.propertyId);
    expect(bPropErr).toBeNull();
    expect(bProp).toEqual([]);
  });

  it("A reads own membership and the reference data (plans, service_zips); B's membership is invisible", async () => {
    const { data: mine, error } = await A.from("memberships").select("member_id, plan_id");
    expect(error).toBeNull();
    expect(mine!.map((m) => m.member_id)).toEqual([KEN.memberId]);

    const { data: theirs, error: probeErr } = await A.from("memberships")
      .select("member_id")
      .eq("member_id", PRIYA.memberId);
    expect(probeErr).toBeNull();
    expect(theirs).toEqual([]);

    // Reference data reads positively — the R1 "what day is my service?" path.
    const { count: planCount } = await A.from("plans")
      .select("*", { count: "exact", head: true });
    expect(planCount).toBe(3);
    const { count: zipCount } = await A.from("service_zips")
      .select("*", { count: "exact", head: true });
    expect(zipCount).toBe(4);
  });

  it("A cannot read another member's payments through the bookings join path", async () => {
    // Embedded join: every payment PostgREST returns must belong to one of
    // A's own bookings — the policy filters the join, not just the base table.
    const { data, error } = await A.from("payments").select("id, bookings!inner(member_id)");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    for (const row of data!) {
      const booking = row.bookings as unknown as { member_id: string };
      expect(booking.member_id).toBe(KEN.memberId);
    }

    // Direct probe at another member's payment (Rosa's paid deposit).
    const { data: probe, error: probeErr } = await A.from("payments")
      .select("id")
      .eq("id", OTHER_MEMBERS_PAYMENT);
    expect(probeErr).toBeNull();
    expect(probe).toEqual([]);
  });

  it("A cannot select from service-role-only tables: outbox, stripe_events, ai_events, dead_letters, telegram_chats, sync_log, booking_transitions", async () => {
    for (const table of SERVICE_ONLY_TABLES) {
      const { data, error } = await A.from(table).select("*").limit(5);
      expect(error, `${table}: expected silent empty result`).toBeNull();
      expect(data, `${table}: must be invisible to members`).toEqual([]);
    }
  });

  it("A cannot insert/update/delete bookings or payments (write lockdown)", async () => {
    const { error: insertErr } = await A.from("bookings").insert({
      business_id: BUSINESS,
      property_id: KEN.propertyId,
      member_id: KEN.memberId,
      kind: "repair",
      status: "requested",
      request_text: MARKER,
    });
    expect(insertErr?.code).toBe("42501");

    const { error: updateErr } = await A.from("bookings")
      .update({ status: "cancelled" })
      .eq("id", KEN.bookingIds[0]);
    expect(updateErr?.code).toBe("42501");

    const { error: deleteErr } = await A.from("bookings").delete().eq("id", KEN.bookingIds[0]);
    expect(deleteErr?.code).toBe("42501");

    const { error: paymentErr } = await A.from("payments")
      .update({ status: "paid" })
      .eq("id", KEN.paymentId);
    expect(paymentErr?.code).toBe("42501");
  });

  it("A can update access_notes on OWN property; stamp trigger records A's uid + timestamp", async () => {
    const notes = `Gate 4482. Dog (friendly lab, name is Biscuit). [${MARKER}]`;
    const { data, error } = await A.from("properties")
      .update({ access_notes: notes })
      .eq("id", KEN.propertyId)
      .select("access_notes, access_notes_updated_by, access_notes_updated_at")
      .single();
    expect(error).toBeNull();
    expect(data!.access_notes).toBe(notes);
    expect(data!.access_notes_updated_by).toBe(kenUserId);
    const stampedAt = new Date(data!.access_notes_updated_at as string).getTime();
    expect(Math.abs(Date.now() - stampedAt)).toBeLessThan(60_000);
  });

  it("A cannot update access_notes on B's property", async () => {
    const { data, error } = await A.from("properties")
      .update({ access_notes: `hijack attempt [${MARKER}]` })
      .eq("id", PRIYA.propertyId)
      .select();
    // Policy filters the row set: zero rows touched, no error leaked.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: check } = await S.from("properties")
      .select("access_notes")
      .eq("id", PRIYA.propertyId)
      .single();
    expect(check!.access_notes).toBe(priyaOriginalNotes);
  });

  it("A cannot update any properties column other than access_notes (column grant)", async () => {
    const { error } = await A.from("properties")
      .update({ address: "1 Hijacked Blvd" })
      .eq("id", KEN.propertyId);
    expect(error?.code).toBe("42501");
  });

  it("A cannot execute the write RPCs: transition_booking and set_actor are service-role only", async () => {
    // EXECUTE goes to PUBLIC by default on new functions — 0009 revokes it.
    // Without that revoke, any anon-key holder could invoke the write helpers.
    const { error: rpcErr } = await A.rpc("transition_booking", {
      p_booking_id: KEN.bookingIds[0],
      p_to_status: "cancelled", // legal from awaiting_deposit — would succeed if allowed
      p_actor: "member",
    });
    expect(rpcErr).not.toBeNull();
    expect(rpcErr!.code).toBe("42501");

    const { data: untouched } = await S.from("bookings")
      .select("status")
      .eq("id", KEN.bookingIds[0])
      .single();
    expect(untouched!.status).toBe("awaiting_deposit");

    const { error: saErr } = await A.rpc("set_actor", { actor: "member" });
    expect(saErr).not.toBeNull();
    expect(saErr!.code).toBe("42501");

    const anon = anonClient();
    const { error: anonErr } = await anon.rpc("transition_booking", {
      p_booking_id: KEN.bookingIds[0],
      p_to_status: "cancelled",
      p_actor: "member",
    });
    expect(anonErr).not.toBeNull();
    expect(anonErr!.code).toBe("42501");
  });

  it("demo member (Ken) reads own bookings, property, and membership; Priya's are invisible", async () => {
    // Verify Ken (the demo member) can access his own data.
    const { data: kenBookings, error: bookingErr } = await A.from("bookings").select("id, member_id");
    expect(bookingErr).toBeNull();
    expect(kenBookings).toHaveLength(2);
    for (const booking of kenBookings!) {
      expect(booking.member_id).toBe(KEN.memberId);
    }

    // Verify Ken's property is visible.
    const { data: kenProperties, error: propErr } = await A.from("properties").select("id, member_id");
    expect(propErr).toBeNull();
    expect(kenProperties!.map((p) => p.id)).toEqual([KEN.propertyId]);

    // Verify Ken's membership is visible.
    const { data: kenMemberships, error: memErr } = await A.from("memberships").select("member_id");
    expect(memErr).toBeNull();
    expect(kenMemberships!.map((m) => m.member_id)).toEqual([KEN.memberId]);

    // Verify Ken's payments are visible.
    const { data: kenPayments, error: payErr } = await A.from("payments").select("id");
    expect(payErr).toBeNull();
    expect(kenPayments!.map((p) => p.id)).toEqual([KEN.paymentId]);

    // Cross-member isolation: target probes at Priya's rows — all return empty, not errors.
    const { data: priyaBookings, error: priyaBookingErr } = await A.from("bookings")
      .select("id")
      .eq("member_id", PRIYA.memberId);
    expect(priyaBookingErr).toBeNull();
    expect(priyaBookings).toEqual([]);

    const { data: priyaProperty, error: priyaPropErr } = await A.from("properties")
      .select("id")
      .eq("member_id", PRIYA.memberId);
    expect(priyaPropErr).toBeNull();
    expect(priyaProperty).toEqual([]);

    const { data: priyaMembership, error: priyaMemErr } = await A.from("memberships")
      .select("member_id")
      .eq("member_id", PRIYA.memberId);
    expect(priyaMemErr).toBeNull();
    expect(priyaMembership).toEqual([]);
  });

  it("anon (signed out) reads nothing from any table", async () => {
    const anon = anonClient();
    for (const table of [...MEMBER_VISIBLE_TABLES, ...SERVICE_ONLY_TABLES]) {
      const { data, error } = await anon.from(table).select("*").limit(5);
      expect(error, `${table}: anon select should not error`).toBeNull();
      expect(data, `${table}: anon must see nothing`).toEqual([]);
    }
  });

  it("service role reads/writes everything (control fixture)", async () => {
    const { count: memberCount } = await S.from("members")
      .select("*", { count: "exact", head: true });
    expect(memberCount).toBe(6);

    const { count: bookingCount } = await S.from("bookings")
      .select("*", { count: "exact", head: true });
    expect(bookingCount).toBeGreaterThanOrEqual(8);

    // Seed inserts emitted booking.created events: the outbox is visible.
    const { count: outboxCount } = await S.from("outbox")
      .select("*", { count: "exact", head: true });
    expect(outboxCount).toBeGreaterThanOrEqual(8);

    const { data: written, error: writeErr } = await S.from("members")
      .update({ phone: "561-555-0101" })
      .eq("id", KEN.memberId)
      .select("id")
      .single();
    expect(writeErr).toBeNull();
    expect(written!.id).toBe(KEN.memberId);
  });
});

describe("Booking invariants (via service role + direct SQL)", () => {
  it("double-booking race: two concurrent 'scheduled' inserts for same tech+window — exactly one succeeds, loser gets exclusion violation", async () => {
    // Far-future, run-unique window so reruns and seed rows never collide.
    const start = new Date(Date.now() + (30 + Math.floor(Math.random() * 300)) * 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    const window = `[${start.toISOString()},${end.toISOString()})`;

    const insert = () =>
      S.from("bookings")
        .insert({
          business_id: BUSINESS,
          property_id: KEN.propertyId,
          member_id: KEN.memberId,
          tech_id: TECH_RAY,
          kind: "repair",
          status: "scheduled",
          request_text: `race [${MARKER}]`,
          window,
        })
        .select("id")
        .single();

    const [r1, r2] = await Promise.all([insert(), insert()]);
    const winners = [r1, r2].filter((r) => !r.error);
    const losers = [r1, r2].filter((r) => r.error);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].error!.code).toBe("23P01"); // exclusion_violation
    createdBookingIds.push(winners[0].data!.id);
  });

  it("illegal transition completed -> scheduled raises P0001", async () => {
    const { error } = await S.from("bookings")
      .update({ status: "scheduled" })
      .eq("id", COMPLETED_BOOKING);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("P0001");
    expect(error!.message).toMatch(/illegal booking transition/);
  });

  it("legal transition writes booking_transitions row with actor from set_actor()", async () => {
    // set_config(..., true) is transaction-local, so actor + write must share
    // one transaction — exactly how server-side SQL is expected to behave.
    const conn = await pool.connect();
    let freshId: string;
    try {
      await conn.query("begin");
      await conn.query("select set_actor($1)", ["member"]);
      const inserted = await conn.query(
        `insert into bookings (business_id, property_id, member_id, kind, status, request_text)
         values ($1, $2, $3, 'repair', 'requested', $4) returning id`,
        [BUSINESS, KEN.propertyId, KEN.memberId, `audit [${MARKER}]`],
      );
      freshId = inserted.rows[0].id;
      await conn.query("select set_actor($1)", ["owner:telegram"]);
      await conn.query("update bookings set status = 'needs_review' where id = $1", [freshId]);
      await conn.query("commit");
    } catch (err) {
      await conn.query("rollback");
      throw err;
    } finally {
      conn.release();
    }
    createdBookingIds.push(freshId);
    auditBookingId = freshId;

    const { data: audit } = await S.from("booking_transitions")
      .select("from_status, to_status, actor")
      .eq("booking_id", freshId)
      .order("id", { ascending: true });
    expect(audit).toEqual([
      { from_status: null, to_status: "requested", actor: "member" },
      { from_status: "requested", to_status: "needs_review", actor: "owner:telegram" },
    ]);
  });

  it("transition_booking() RPC transitions atomically over the API and audits the passed actor (0008)", async () => {
    // The supabase-js path: rpc('set_actor') + .update() spans two PostgREST
    // transactions and mis-attributes to 'system' — transition_booking() is
    // the one-transaction fix. This is the path edge fns and server actions use.
    const { data: fresh, error: insertErr } = await S.from("bookings")
      .insert({
        business_id: BUSINESS,
        property_id: KEN.propertyId,
        member_id: KEN.memberId,
        kind: "repair",
        status: "requested",
        request_text: `rpc [${MARKER}]`,
      })
      .select("id")
      .single();
    expect(insertErr).toBeNull();
    createdBookingIds.push(fresh!.id);

    const { data: updated, error } = await S.rpc("transition_booking", {
      p_booking_id: fresh!.id,
      p_to_status: "needs_review",
      p_actor: "owner:telegram",
    });
    expect(error).toBeNull();
    expect(updated.status).toBe("needs_review");

    const { data: audit } = await S.from("booking_transitions")
      .select("from_status, to_status, actor")
      .eq("booking_id", fresh!.id)
      .order("id", { ascending: true });
    expect(audit).toEqual([
      // PostgREST insert ran without an actor: falls back to 'system'.
      { from_status: null, to_status: "requested", actor: "system" },
      // The RPC carried the actor through in one transaction.
      { from_status: "requested", to_status: "needs_review", actor: "owner:telegram" },
    ]);

    // Unknown actors are refused before any write.
    const { error: badActor } = await S.rpc("transition_booking", {
      p_booking_id: fresh!.id,
      p_to_status: "cancelled",
      p_actor: "intruder",
    });
    expect(badActor?.code).toBe("P0001");

    // Illegal transitions still bubble the guard's P0001 through the RPC.
    const { error: illegal } = await S.rpc("transition_booking", {
      p_booking_id: fresh!.id,
      p_to_status: "completed",
      p_actor: "system",
    });
    expect(illegal?.code).toBe("P0001");
  });

  it("status change emits exactly one outbox row; replaying the same transition is a no-op (dedupe_key)", async () => {
    // Reuses the booking from the set_actor audit test (requested -> needs_review).
    const freshId = auditBookingId;
    const dedupeKey = `${freshId}:needs_review`;

    const countRows = async () => {
      const { count } = await S.from("outbox")
        .select("*", { count: "exact", head: true })
        .eq("dedupe_key", dedupeKey);
      return count;
    };
    expect(await countRows()).toBe(1);

    // Replay: same-status update is a no-op — no error, no second event,
    // no second audit row.
    const { error } = await S.from("bookings")
      .update({ status: "needs_review" })
      .eq("id", freshId);
    expect(error).toBeNull();
    expect(await countRows()).toBe(1);

    const { count: auditCount } = await S.from("booking_transitions")
      .select("*", { count: "exact", head: true })
      .eq("booking_id", freshId);
    expect(auditCount).toBe(2);
  });

  it("DST boundary: booking window across the Nov 2026 fall-back stores UTC and converts correctly in America/New_York", async () => {
    // 2026-11-01 06:00 UTC is the fall-back instant (2:00 EDT -> 1:00 EST).
    // Two real hours of 05:00Z..07:00Z span one wall-clock hour: 01:00 -> 02:00.
    // (DB half of R3 AC #3 — portal/`/today` rendering asserted on Day 9.)
    const inserted = await pool.query(
      `insert into bookings (business_id, property_id, member_id, kind, status, request_text, "window")
       values ($1, $2, $3, 'plan_visit', 'requested', $4,
               tstzrange('2026-11-01T05:00:00Z', '2026-11-01T07:00:00Z'))
       returning id`,
      [BUSINESS, KEN.propertyId, KEN.memberId, `dst [${MARKER}]`],
    );
    const dstId = inserted.rows[0].id as string;
    createdBookingIds.push(dstId);

    const { rows } = await pool.query(
      `select
         extract(epoch from upper("window") - lower("window"))::int as duration_s,
         to_char(lower("window") at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') as local_start,
         to_char(upper("window") at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') as local_end
       from bookings where id = $1`,
      [dstId],
    );
    expect(rows[0].duration_s).toBe(7200);
    expect(rows[0].local_start).toBe("2026-11-01 01:00");
    expect(rows[0].local_end).toBe("2026-11-01 02:00");
  });
});
