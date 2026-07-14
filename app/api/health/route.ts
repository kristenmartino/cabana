// R5 / R8 health probe + OQ3 keep-warm: monitors outbox DELIVERY BACKLOG.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Backlog thresholds (503 when exceeded).
const BACKLOG_DEEP = 100; // un-projected rows queued up
const BACKLOG_STALE_SECONDS = 300; // oldest un-projected row (5 min)
// Backstop for the decoupled Telegram leg. Normal Telegram flaking dead-letters
// after 5 attempts on the ~60s sweep (~5 min), so a healthy-but-flaky leg never
// approaches this. A leg still pending far past that window means dead-lettering
// itself isn't advancing — e.g. the "Mark telegram delivered" PATCH fails after a
// successful ping, so `attempts` (incremented only on the ping's own error path)
// never reaches 5, the row never dead-letters, and the owner is re-pinged every
// sweep. Without this backstop that row is invisible to the probe (its Airtable
// leg is delivered, so it's excluded from the backlog) — a "quiet but stuck"
// state R8 forbids. 30 min is generous enough not to fire on transient flakes.
const TELEGRAM_WEDGED_SECONDS = 1800; // 30 min

export async function GET() {
  try {
    const admin = createAdminClient();

    // Delivery is decoupled into two legs (0019 / issue #20): the Airtable
    // projection (the office board's source of record) and the Telegram owner
    // ping (best-effort — a persistent failure dead-letters that leg ALONE and
    // is surfaced by the dead-letter email alert). A row is fully delivered
    // (processed_at set) only once BOTH legs land.
    //
    // So `processed_at IS NULL` no longer means "the pipeline is backing up": a
    // row whose Airtable leg landed but whose Telegram ping is merely flaking
    // (the Railway->Telegram ETIMEDOUT gremlin) is NOT a pipeline emergency, and
    // treating it as one re-couples at the health layer exactly what #20
    // decoupled at delivery — pinning the probe red for the whole retry window,
    // and forever once dead-lettering went terminal (#23). The primary 503 signal
    // therefore keys on the GENUINE backlog: rows still owed their Airtable
    // projection and not yet given up on —
    //   processed_at IS NULL AND dead_lettered_at IS NULL AND airtable_delivered_at IS NULL
    // — the set that grows on the real failures (consumer down, DB webhook broken,
    // Airtable API down). The Telegram leg gets its own generous age backstop
    // (see TELEGRAM_WEDGED_SECONDS). telegram_pending / dead_lettered are reported
    // for visibility only.
    //
    // Known limitation: a MANUALLY redriven row (0018 redrive: operator clears
    // dead_lettered_at + resets attempts) re-enters with its original created_at,
    // so both age signals read from emission time, not requeue time — a fresh
    // redrive can briefly read as "old" until it re-delivers or re-dead-letters.
    // Redrive is a rare manual op and the blip self-clears; the old probe had the
    // same property, so this is not a regression. Accepted, not papered over.
    const [backlogDepth, backlogOldest, telegramPending, telegramOldest, deadLettered] =
      await Promise.all([
        admin
          .from("outbox")
          .select("id", { count: "exact", head: true })
          .is("processed_at", null)
          .is("dead_lettered_at", null)
          .is("airtable_delivered_at", null),
        admin
          .from("outbox")
          .select("created_at")
          .is("processed_at", null)
          .is("dead_lettered_at", null)
          .is("airtable_delivered_at", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        admin
          .from("outbox")
          .select("id", { count: "exact", head: true })
          .is("processed_at", null)
          .is("dead_lettered_at", null)
          .not("airtable_delivered_at", "is", null)
          .is("telegram_delivered_at", null),
        admin
          .from("outbox")
          .select("created_at")
          .is("processed_at", null)
          .is("dead_lettered_at", null)
          .not("airtable_delivered_at", "is", null)
          .is("telegram_delivered_at", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        admin
          .from("outbox")
          .select("id", { count: "exact", head: true })
          .not("dead_lettered_at", "is", null)
          .is("processed_at", null),
      ]);

    // Handle query errors. PostgREST 400s (missing column, RLS, etc.) sometimes
    // come back with an empty .message; fall through details/hint/code so we
    // never emit `error: ""` again.
    const err =
      backlogDepth.error ??
      backlogOldest.error ??
      telegramPending.error ??
      telegramOldest.error ??
      deadLettered.error;
    if (err) {
      const detail =
        err.message || err.details || err.hint || err.code || "unknown";
      return NextResponse.json(
        { ok: false, checks: { db: "unreachable" }, error: detail },
        { status: 503 }
      );
    }

    const ageSeconds = (row: { created_at: string } | null) =>
      row ? Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000) : 0;

    // `pending` = the genuine (un-projected, not-given-up) backlog depth.
    const pending = backlogDepth.count ?? 0;
    const oldest_seconds = ageSeconds(backlogOldest.data);
    const telegram_oldest_seconds = ageSeconds(telegramOldest.data);

    // Unhealthy if the genuine backlog is deep or old, OR a Telegram leg is wedged
    // far past its dead-letter window (see the notes above). Transient Telegram
    // flaking does NOT count.
    const ok =
      pending <= BACKLOG_DEEP &&
      oldest_seconds <= BACKLOG_STALE_SECONDS &&
      telegram_oldest_seconds <= TELEGRAM_WEDGED_SECONDS;

    return NextResponse.json(
      {
        ok,
        checks: {
          db: "ok",
          outbox: {
            pending,
            oldest_seconds,
            telegram_pending: telegramPending.count ?? 0,
            telegram_oldest_seconds,
            dead_lettered: deadLettered.count ?? 0,
          },
        },
      },
      { status: ok ? 200 : 503 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 503 }
    );
  }
}
