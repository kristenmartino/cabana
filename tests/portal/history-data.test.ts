import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  from: (table: string) => ({ select: () => {
    if (table === "members") return { maybeSingle: async () => ({ data: { id: "member", full_name: "Test Member" } }) };
    if (table === "properties") return { limit: async () => ({ data: [] }) };
    if (table === "memberships") return Promise.resolve({ data: [] });
    return { order: () => ({ limit: async () => ({ data: ["completed", "cancelled", "no_show"].map(status => ({
      id: status, kind: "plan_visit", status, window: null,
      created_at: "2026-10-26T12:00:00Z", visit_notes: status === "completed" ? "Checked circulation." : null,
      request_text: null,
    })) }) }) };
  } }),
}) }));
import { getHomeData } from "../../lib/portal/data";

it("keeps completed, cancelled, and missed visits distinguishable in history", async () => {
  const home = await getHomeData();
  expect(home?.history.map(({ id, label, tone }) => ({ id, label, tone }))).toEqual([
    { id: "completed", label: "Completed", tone: "done" },
    { id: "cancelled", label: "Cancelled", tone: "info" },
    { id: "no_show", label: "Missed", tone: "info" },
  ]);
  expect(home?.history.map(row => row.note)).toEqual(["Checked circulation.", "", ""]);
});
