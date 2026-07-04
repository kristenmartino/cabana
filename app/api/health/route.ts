// R5 / R8 health probe + OQ3 keep-warm: monitors outbox queue depth and event latency.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const admin = createAdminClient();

    // Fetch outbox depth and oldest unprocessed event in parallel.
    // Dead-lettering is a separate `dead_letters` table (see outbox-consumer.json's
    // Dead-letter node), not a column on outbox — so processed_at IS NULL is the
    // whole definition of "still queued for delivery." Rows the consumer gave up
    // on remain here with processed_at null AND attempts >= 5; they're intentionally
    // visible to the health probe because a growing giveup pile is exactly the
    // signal we want.
    const [depthResult, oldestResult] = await Promise.all([
      admin
        .from("outbox")
        .select("id", { count: "exact", head: true })
        .is("processed_at", null),
      admin
        .from("outbox")
        .select("created_at")
        .is("processed_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    // Handle query errors. PostgREST 400s (missing column, RLS, etc.) sometimes
    // come back with an empty .message; fall through details/hint/code so we
    // never emit `error: ""` again.
    if (depthResult.error || oldestResult.error) {
      const err = depthResult.error ?? oldestResult.error;
      const detail =
        err?.message || err?.details || err?.hint || err?.code || "unknown";
      return NextResponse.json(
        { ok: false, checks: { db: "unreachable" }, error: detail },
        { status: 503 }
      );
    }

    // Compute queue age.
    const pending = depthResult.count ?? 0;
    const oldestData = oldestResult.data;
    const oldest_seconds = oldestData
      ? Math.floor((Date.now() - new Date(oldestData.created_at).getTime()) / 1000)
      : 0;

    // Health thresholds: unhealthy if pending > 100 OR oldest event > 5 min.
    const ok = pending <= 100 && oldest_seconds <= 300;

    return NextResponse.json(
      {
        ok,
        checks: {
          db: "ok",
          outbox: { pending, oldest_seconds },
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
