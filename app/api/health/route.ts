// R5 / R8 health probe + OQ3 keep-warm: monitors outbox queue depth and event latency.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const admin = createAdminClient();

    // Fetch outbox depth and oldest unprocessed event in parallel.
    const [depthResult, oldestResult] = await Promise.all([
      admin
        .from("outbox")
        .select("id", { count: "exact", head: true })
        .is("processed_at", null)
        .is("dead_lettered_at", null),
      admin
        .from("outbox")
        .select("created_at")
        .is("processed_at", null)
        .is("dead_lettered_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    // Handle query errors.
    if (depthResult.error || oldestResult.error) {
      const err = depthResult.error ?? oldestResult.error;
      return NextResponse.json(
        {
          ok: false,
          checks: { db: "unreachable" },
          error: err?.message ?? "Unknown database error",
        },
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
