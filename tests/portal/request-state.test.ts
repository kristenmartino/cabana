import { describe, expect, it } from "vitest";
import { formatVisitWindow, requestState } from "../../lib/portal/request-state";

const visit = '["2026-10-27 14:00:00+00","2026-10-27 16:00:00+00")';

describe("member request facts", () => {
  it("does not treat a payment-triggered scheduling status as an assigned visit", () => {
    const result = requestState("scheduled");
    expect(result.label).toBe("Awaiting visit time");
    expect(result.description).toContain("awaiting approval");
    expect(result.visitWindow).toBeNull();
  });

  it("shows a recorded visit window without implying approval", () => {
    const result = requestState("scheduled", visit);
    expect(result.label).toBe("Awaiting approval");
    expect(result.description).toContain("awaiting approval");
    expect(result.visitWindow).toContain("10:00 AM EDT");
    expect(result.visitWindow).toContain("12:00 PM EDT");
  });

  it("distinguishes approval from a confirmed appointment", () => {
    expect(requestState("confirmed").label).toBe("Approved · time pending");
    expect(requestState("confirmed", visit).label).toBe("Confirmed");
  });

  it.each(["completed", "cancelled", "no_show"])("does not show a future visit for terminal state %s", (status) => {
    const result = requestState(status, visit);
    expect(result.visitWindow).toBeNull();
    expect(result.description).not.toMatch(/will|awaiting|soon|text|Dana/i);
  });

  it("does not infer a staff review or slot reservation from auto-qualification", () => {
    const result = requestState("awaiting_deposit");
    expect(result.description).not.toMatch(/reviewed|Dana|held|reserved/i);
    expect(result.visitWindow).toBeNull();
  });

  it("keeps unrecognized states neutral", () => {
    expect(requestState("unexpected", visit)).toMatchObject({ label: "Status unavailable", visitWindow: null });
  });
});

describe("recorded visit windows", () => {
  it.each([null, "empty", "(,)", '["invalid","invalid")', '["2026-10-28","2026-10-27")'])("ignores missing or invalid window %s", (value) => {
    expect(formatVisitWindow(value)).toBeNull();
  });

  it("keeps both timezone offsets visible across the fall DST transition", () => {
    const label = formatVisitWindow('["2026-11-01T05:30:00Z","2026-11-01T07:30:00Z")');
    expect(label).toContain("1:30 AM EDT");
    expect(label).toContain("2:30 AM EST");
  });
});
