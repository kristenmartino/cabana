// scripts/spine-demo.ts — Gate-1 spine driver (R5/ADR-02).
//
// Exercises the transactional-outbox spine end to end against the CLOUD
// project:
//   booking write (status 'scheduled')
//     -> emit_booking_event() writes a 'booking.created' outbox row in the SAME
//        transaction (0004)
//     -> the 0010 AFTER INSERT trigger nudges n8n; the 60s sweep is the backstop
//     -> n8n upserts one Airtable row (idempotent) + pings the owner on Telegram
//        with an Approve button (created rows whose status is 'scheduled')
//     -> owner taps Approve -> transition_booking scheduled->confirmed,
//        actor 'owner:telegram' -> a booking_transitions row.
//
// This script drives the LEFT half (the DB write) and OBSERVES the outbox +
// transitions; the Airtable/Telegram/Approve legs run in n8n + Telegram and are
// asserted by watching processed_at flip and (after you tap Approve) the
// confirmed transition appear.
//
// Talks to PostgREST with the service role (bypasses RLS), matching the test
// style in tests/helpers/local-stack.ts — no new dependencies.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/spine-demo.ts
//   ...                                             npx tsx scripts/spine-demo.ts --cleanup
//
// Env (both map to the CLOUD project, e.g. https://uuviebpmiwzjyabucheo.supabase.co):
//   SUPABASE_URL                 project URL (no trailing slash needed)
//   SUPABASE_SERVICE_ROLE_KEY    service-role key (bypasses RLS; never commit it)
//
// Flags:
//   --cleanup   after the run, delete the demo booking + its outbox and
//               booking_transitions rows (leaves the seed world pristine).

// --- Seeded fixtures (supabase/seed.sql) -----------------------------------
const BUSINESS_ID = "b1000000-0000-4000-8000-000000000001"; // Sailfish Pool Care
const MEMBER_KEN = "a1000000-0000-4000-8000-000000000001"; // Ken Alvarez
const PROPERTY_KEN = "c1000000-0000-4000-8000-000000000001"; // 118 Pelican Way
const TECH_RAY = "7e000000-0000-4000-8000-000000000003"; // Ray

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const REST = `${SUPABASE_URL}/rest/v1`;
const CLEANUP = process.argv.includes("--cleanup");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `Missing env ${name}. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to the ` +
        `CLOUD project before running (see the header of this file).`,
    );
    process.exit(2);
  }
  return v;
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

async function rest(
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<Response> {
  const { prefer, ...rest } = init;
  const res = await fetch(`${REST}${path}`, {
    ...rest,
    headers: {
      ...headers,
      ...(prefer ? { Prefer: prefer } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
  });
  return res;
}

async function restJson<T = unknown>(
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<T> {
  const res = await rest(path, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type OutboxRow = {
  id: number;
  topic: string;
  dedupe_key: string;
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
};

type TransitionRow = {
  from_status: string | null;
  to_status: string;
  actor: string;
  at: string;
};

// --------------------------------------------------------------------------

async function findExistingDemoBooking(): Promise<string | null> {
  // request_text is tagged 'spine-demo ...'; grab the most recent demo booking.
  const rows = await restJson<{ id: string }[]>(
    `/bookings?request_text=like.spine-demo%25&order=created_at.desc&limit=1&select=id`,
  );
  return rows[0]?.id ?? null;
}

async function insertDemoBooking(): Promise<string> {
  const tag = `spine-demo ${new Date().toISOString()}`;
  // Each run needs its OWN window: the no_tech_overlap exclusion constraint
  // (0002) rejects a second scheduled/confirmed booking for the same tech whose
  // window overlaps. Base ~30 days out; a time-derived slot spreads runs across
  // ~2 weeks, and if two runs still collide on Ray we bump +2h and retry
  // (PostgREST maps the exclusion_violation to HTTP 409 / SQLSTATE 23P01). This
  // keeps the restart-survival test ("re-run a few times while n8n is down")
  // reliable.
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 30);
  base.setUTCHours(0, 0, 0, 0);
  const jitterMin = Math.floor(Date.now() / 1000) % (14 * 24 * 60); // ~2-week spread

  for (let attempt = 0; attempt < 6; attempt++) {
    const startMin = jitterMin + attempt * 120; // +2h per retry
    const start = new Date(base.getTime() + startMin * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const windowRange = `[${start.toISOString()},${end.toISOString()})`;

    const res = await rest(`/bookings`, {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        property_id: PROPERTY_KEN,
        member_id: MEMBER_KEN,
        tech_id: TECH_RAY,
        kind: "repair",
        status: "scheduled",
        request_text: tag,
        window: windowRange,
      }),
    });

    if (res.ok) {
      const [booking] = (await res.json()) as { id: string; status: string }[];
      console.log(
        `inserted booking ${booking.id} at status '${booking.status}' (window ${windowRange})`,
      );
      console.log(`  request_text tag: ${tag}`);
      return booking.id;
    }

    const text = await res.text();
    if (res.status === 409 || text.includes("23P01")) {
      console.log(`  window ${windowRange} taken for Ray; bumping +2h and retrying…`);
      continue;
    }
    throw new Error(`POST /bookings -> ${res.status} ${text}`);
  }
  throw new Error("could not find a free window for tech Ray after 6 attempts");
}

async function outboxRowsFor(bookingId: string): Promise<OutboxRow[]> {
  // The outbox payload holds booking_id; filter on the JSONB field.
  return restJson<OutboxRow[]>(
    `/outbox?payload->>booking_id=eq.${bookingId}` +
      `&order=id.asc&select=id,topic,dedupe_key,processed_at,attempts,last_error`,
  );
}

async function transitionsFor(bookingId: string): Promise<TransitionRow[]> {
  return restJson<TransitionRow[]>(
    `/booking_transitions?booking_id=eq.${bookingId}` +
      `&order=at.asc&select=from_status,to_status,actor,at`,
  );
}

async function pollUntilCreatedProcessed(bookingId: string): Promise<boolean> {
  const createdDedupe = `${bookingId}:created`;
  const deadline = Date.now() + 90_000; // give the 60s sweep at least one cycle
  const seenProcessed = new Set<string>();
  console.log(
    `\npolling outbox for booking ${bookingId} (created dedupe_key ${createdDedupe})…`,
  );
  while (Date.now() < deadline) {
    const rows = await outboxRowsFor(bookingId);
    for (const r of rows) {
      if (r.processed_at && !seenProcessed.has(r.dedupe_key)) {
        seenProcessed.add(r.dedupe_key);
        console.log(
          `  ✓ ${r.dedupe_key} (${r.topic}) processed_at=${r.processed_at}` +
            (r.attempts ? ` attempts=${r.attempts}` : ""),
        );
      }
      if (r.last_error) {
        console.log(
          `  ! ${r.dedupe_key} last_error=${r.last_error} attempts=${r.attempts}`,
        );
      }
    }
    const created = rows.find((r) => r.dedupe_key === createdDedupe);
    if (created?.processed_at) {
      return true;
    }
    await sleep(3000);
  }
  return false;
}

async function cleanup(bookingId: string): Promise<void> {
  console.log(`\n--cleanup: removing demo booking ${bookingId} and its trail…`);
  // Children first (FKs), then the booking. dead_letters.outbox_id references
  // outbox(id), so any dead-letters for this booking's outbox rows must go
  // BEFORE the outbox rows themselves, or the outbox DELETE hits an FK violation.
  const outboxRows = await outboxRowsFor(bookingId);
  const outboxIds = outboxRows.map((r) => r.id);
  if (outboxIds.length > 0) {
    await rest(`/dead_letters?outbox_id=in.(${outboxIds.join(",")})`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }
  await rest(`/booking_transitions?booking_id=eq.${bookingId}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  await rest(`/outbox?payload->>booking_id=eq.${bookingId}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  await rest(`/bookings?id=eq.${bookingId}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  console.log("  cleaned up.");
}

async function main() {
  if (CLEANUP) {
    const existing = await findExistingDemoBooking();
    if (!existing) {
      console.log("--cleanup: no spine-demo booking found; nothing to do.");
      process.exit(0);
    }
    await cleanup(existing);
    process.exit(0);
  }

  const bookingId = await insertDemoBooking();

  const ok = await pollUntilCreatedProcessed(bookingId);

  console.log("\nbooking_transitions so far:");
  const transitions = await transitionsFor(bookingId);
  if (transitions.length === 0) {
    console.log("  (none yet)");
  }
  for (const t of transitions) {
    console.log(
      `  ${t.from_status ?? "∅"} -> ${t.to_status}  by ${t.actor}  at ${t.at}`,
    );
  }

  if (ok) {
    console.log(
      `\nspine-demo: booking.created row processed. Airtable should hold exactly ` +
        `one row for ${bookingId}; the owner has an Approve ping. Tap Approve to ` +
        `see a 'scheduled -> confirmed' transition by 'owner:telegram' (re-run ` +
        `with the same booking or query booking_transitions to confirm).`,
    );
    console.log(
      `\nTo remove the demo data: npx tsx scripts/spine-demo.ts --cleanup`,
    );
    process.exit(0);
  } else {
    console.error(
      `\nspine-demo: booking.created row for ${bookingId} was NOT processed within ` +
        `the poll window. Check that the n8n outbox-consumer is running (webhook + ` +
        `60s sweep) and that its Supabase/Airtable/Telegram credentials resolve.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("spine-demo failed:", err);
  process.exit(1);
});
