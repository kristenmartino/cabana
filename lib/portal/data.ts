import "server-only";
// Member-portal read layer (R1). Every query uses the cookie-bound server
// client, so RLS (0005) scopes results to the signed-in member's own rows —
// isolation is enforced at the database, not here. This module maps the raw
// schema shapes to the view-models the pages render (the Lovable field names
// reconciled to real columns: request_text, access_notes, the status enum → a
// StatusPill tone + label, etc.).
import { createClient } from "@/lib/supabase/server";
import type { Tone } from "@/components/sailfish/StatusPill";

const TZ = "America/New_York";

const STATUS_META: Record<string, { tone: Tone; label: string }> = {
  requested: { tone: "review", label: "Received" },
  needs_review: { tone: "review", label: "Needs review" },
  awaiting_deposit: { tone: "deposit", label: "Awaiting deposit" },
  scheduled: { tone: "scheduled", label: "Scheduled" },
  confirmed: { tone: "scheduled", label: "Confirmed" },
  completed: { tone: "done", label: "Completed" },
  cancelled: { tone: "info", label: "Cancelled" },
  no_show: { tone: "info", label: "Missed" },
};

export function statusMeta(status: string): { tone: Tone; label: string } {
  return STATUS_META[status] ?? { tone: "info", label: status };
}

const KIND_LABEL: Record<string, string> = {
  repair: "Repair",
  one_off_clean: "One-off clean",
  plan_visit: "Weekly service",
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, month: "short", day: "numeric",
  }).format(new Date(iso));
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

// Lower bound of a Postgres tstzrange as PostgREST renders it, e.g.
// ["2026-07-10T14:00:00+00:00","2026-07-10T16:00:00+00:00").
function windowStart(win: unknown): string | null {
  if (typeof win !== "string") return null;
  const m = win.match(/[[(]\s*"?([^",\])]+)"?/);
  return m ? m[1] : null;
}

// Next calendar date (rendered in the business tz) matching the plan's weekly
// service day. weekly_day: 0 = Sunday … 6 = Saturday.
function nextServiceLabel(weeklyDay: number): string {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
  const now = Date.now();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now + i * 86_400_000);
    if (WEEKDAY_INDEX[wd.format(d)] === weeklyDay) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: TZ, weekday: "long", month: "short", day: "numeric",
      }).format(d);
    }
  }
  return "Coming up";
}

const OPEN_STATUSES = new Set([
  "requested", "needs_review", "awaiting_deposit", "scheduled", "confirmed",
]);
const HISTORY_STATUSES = new Set(["completed", "cancelled", "no_show"]);
const REQUEST_KINDS = new Set(["repair", "one_off_clean"]);

export type HomeData = {
  firstName: string;
  nextService: { dateLabel: string; planName: string } | null;
  openRequests: {
    id: string; summary: string; tone: Tone; label: string; submitted: string;
  }[];
  history: { id: string; title: string; date: string; note: string }[];
  property: { id: string; accessNotes: string | null } | null;
};

export async function getHomeData(): Promise<HomeData | null> {
  const supabase = await createClient();

  const [memberRes, propsRes, membershipsRes, bookingsRes] = await Promise.all([
    supabase.from("members").select("id, full_name").maybeSingle(),
    supabase.from("properties").select("id, access_notes").limit(1),
    supabase.from("memberships").select("plans(name, weekly_day)"),
    supabase
      .from("bookings")
      .select("id, kind, status, request_text, window, created_at, visit_notes")
      .order("created_at", { ascending: false }),
  ]);

  const member = memberRes.data;
  if (!member) return null; // signed in but not linked to a member row

  const property = propsRes.data?.[0]
    ? { id: propsRes.data[0].id, accessNotes: propsRes.data[0].access_notes }
    : null;

  const plan = (membershipsRes.data?.[0]?.plans ?? null) as
    | { name: string; weekly_day: number }
    | null;
  const nextService = plan
    ? { dateLabel: nextServiceLabel(plan.weekly_day), planName: plan.name }
    : null;

  const bookings = bookingsRes.data ?? [];
  const openRequests = bookings
    .filter((b) => REQUEST_KINDS.has(b.kind) && OPEN_STATUSES.has(b.status))
    .map((b) => ({
      id: b.id,
      summary: b.request_text ?? KIND_LABEL[b.kind] ?? "Service request",
      ...statusMeta(b.status),
      submitted: fmtDateTime(b.created_at),
    }));

  const history = bookings
    .filter((b) => HISTORY_STATUSES.has(b.status))
    .map((b) => ({
      id: b.id,
      title: KIND_LABEL[b.kind] ?? "Service",
      date: fmtDate(windowStart(b.window) ?? b.created_at),
      note: b.visit_notes ?? b.request_text ?? "",
    }));

  return {
    firstName: member.full_name.split(" ")[0],
    nextService,
    openRequests,
    history,
    property,
  };
}

export type StepKey = "received" | "reviewed" | "deposit" | "scheduled" | "confirmed";

const STATUS_STEP: Record<string, StepKey> = {
  requested: "received",
  needs_review: "reviewed",
  awaiting_deposit: "deposit",
  scheduled: "scheduled",
  confirmed: "confirmed",
  completed: "confirmed",
  cancelled: "received",
  no_show: "confirmed",
};

export type RequestStatusData = {
  id: string;
  requestText: string;
  status: string;
  tone: Tone;
  label: string;
  submitted: string;
  currentStep: StepKey;
  deposit: { amount: number; status: string; due: boolean } | null;
};

export async function getRequestStatus(id: string): Promise<RequestStatusData | null> {
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, request_text, created_at, deposit_required")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return null; // RLS: not this member's booking (or doesn't exist)

  const { data: payment } = await supabase
    .from("payments")
    .select("amount_cents, status")
    .eq("booking_id", id)
    .maybeSingle();

  const meta = statusMeta(booking.status);
  return {
    id: booking.id,
    requestText: booking.request_text ?? "",
    status: booking.status,
    tone: meta.tone,
    label: meta.label,
    submitted: fmtDateTime(booking.created_at),
    currentStep: STATUS_STEP[booking.status] ?? "received",
    deposit: booking.deposit_required
      ? {
          amount: (payment?.amount_cents ?? 7500) / 100,
          status: payment?.status ?? "pending",
          due: booking.status === "awaiting_deposit" && (payment?.status ?? "pending") === "pending",
        }
      : null,
  };
}

// The member's most recent open request — used to point the home "open
// requests" cards and the post-submit redirect at a real status page.
export async function getLatestOpenRequestId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id")
    .in("status", ["requested", "needs_review", "awaiting_deposit", "scheduled", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
