import type { Tone } from "@/components/sailfish/StatusPill";

const TZ = "America/New_York";

// A scheduling status alone does not establish that a visit window was assigned.
export function formatVisitWindow(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^[[(]"?([^",]+)"?,\s*"?([^"\])]+)"?[\])]$/);
  if (!match) return null;
  const start = new Date(match[1]);
  const end = new Date(match[2]);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  return `${format.format(start)} – ${format.format(end)}`;
}

export function requestState(status: string, window: unknown = null): {
  tone: Tone;
  label: string;
  description: string;
  visitWindow: string | null;
} {
  const visitWindow = ["scheduled", "confirmed"].includes(status) ? formatVisitWindow(window) : null;
  const states: Record<string, { tone: Tone; label: string; description: string }> = {
    requested: { tone: "review", label: "Received", description: "Your request has been received." },
    needs_review: { tone: "review", label: "Awaiting review", description: "Your request is awaiting staff review." },
    awaiting_deposit: { tone: "deposit", label: "Awaiting deposit", description: "A repair deposit is required. A visit time has not been confirmed." },
    scheduled: {
      tone: "scheduled",
      label: visitWindow ? "Awaiting approval" : "Awaiting visit time",
      description: visitWindow
        ? "A visit window is recorded. The request is awaiting approval."
        : "A visit time has not been assigned. The request is awaiting approval.",
    },
    confirmed: {
      tone: "scheduled",
      label: visitWindow ? "Confirmed" : "Approved · time pending",
      description: visitWindow ? "Your request is approved for the visit window below." : "Your request is approved. A visit time has not been assigned.",
    },
    completed: { tone: "done", label: "Completed", description: "This request is marked completed." },
    cancelled: { tone: "info", label: "Cancelled", description: "This request is cancelled." },
    no_show: { tone: "info", label: "Missed", description: "This visit is marked missed." },
  };
  return {
    ...(states[status] ?? { tone: "info" as const, label: "Status unavailable", description: "The request status is unavailable." }),
    visitWindow,
  };
}
