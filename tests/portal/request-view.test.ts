import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { requestState } from "../../lib/portal/request-state";
import type { RequestStatusData } from "../../lib/portal/data";

const data = vi.hoisted(() => ({ request: vi.fn(), home: vi.fn() }));
vi.mock("@/lib/portal/data", () => ({ getRequestStatus: data.request, getHomeData: data.home }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error("not found"); } }));
vi.mock("@/app/actions", () => ({ signOut: vi.fn(), enterDemo: vi.fn(), updateAccessNotes: vi.fn() }));
vi.mock("@/app/request/[id]/actions", () => ({ startDepositCheckout: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "fixture" } } }) } }) }));

import RequestStatus from "../../app/request/[id]/page";
import Home from "../../app/page";

async function renderRequest(status: string, deposit: RequestStatusData["deposit"], paid?: string) {
  data.request.mockResolvedValue({
    id: "fixture", status, requestText: "The pool pump is making a grinding noise.",
    submitted: "Oct 24, 10:00 AM", ...requestState(status), deposit,
    // A stored draft must not become a staff reply.
    ackDraft: "Dana has reviewed this and will text you in five minutes.",
  });
  const view = await RequestStatus({ params: Promise.resolve({ id: "fixture" }), searchParams: Promise.resolve({ paid }) });
  return renderToStaticMarkup(view);
}

function savePreview(name: string, html: string) {
  if (process.env.CABANA_REVIEW_DIR) writeFileSync(`${process.env.CABANA_REVIEW_DIR}/${name}.fragment.html`, html);
}

describe("member status page", () => {
  it("reports auto-qualified intake without presenting AI copy as staff review", async () => {
    const html = await renderRequest("awaiting_deposit", { amount: 75, status: "pending", due: true });
    expect(html).toContain("Repair deposit: $75");
    expect(html).toContain("A visit time will be confirmed separately.");
    expect(html).toContain("4242 4242 4242 4242");
    expect(html).toContain("shared fictional data");
    expect(html).not.toMatch(/Dana has reviewed|five minutes|your spot|Triaged/);
    savePreview("deposit", html);
  });

  it("a payment return URL alone does not establish receipt", async () => {
    const html = await renderRequest("awaiting_deposit", { amount: 75, status: "pending", due: true }, "1");
    expect(html).toContain("Confirming your payment");
    expect(html).not.toContain("Deposit received");
    expect(html).not.toContain("Pay $75 deposit");
    savePreview("confirming", html);
  });

  it("payment receipt does not invent an assigned appointment or human review", async () => {
    const html = await renderRequest("scheduled", { amount: 75, status: "paid", due: false });
    expect(html).toContain("Deposit received");
    expect(html).toContain("Awaiting visit time");
    expect(html).not.toMatch(/Dana checked|soonest|spot is held/);
    savePreview("paid", html);
  });

  it.each(["cancelled", "completed", "no_show"])("terminal %s requests do not show future payment or progress actions", async (status) => {
    const html = await renderRequest(status, null);
    expect(html).not.toMatch(/Pay \$|Finding the|IN PROGRESS|Tech and time|will text/);
  });

  it("an inaccessible request uses the not-found path", async () => {
    data.request.mockResolvedValue(null);
    await expect(RequestStatus({ params: Promise.resolve({ id: "other-member" }), searchParams: Promise.resolve({}) })).rejects.toThrow("not found");
  });

  it("renders the home page with a plan day separate from booking status", async () => {
    data.home.mockResolvedValue({ firstName: "Ken", nextService: { dateLabel: "Tuesdays", planName: "Weekly Essential" }, openRequests: [{ id: "fixture", summary: "The pool pump is making a grinding noise.", submitted: "Oct 24, 10:00 AM", ...requestState("scheduled") }], history: [], property: { id: "property", accessNotes: "Gate code on file. Please close the gate after service." } });
    const home = renderToStaticMarkup(await Home());
    expect(home).toContain("Regular service day");
    expect(home).toContain("Tuesdays");
    expect(home).toContain("Awaiting visit time");
    savePreview("dashboard", home);
  });
});
