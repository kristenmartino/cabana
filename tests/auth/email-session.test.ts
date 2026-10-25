import { beforeEach, describe, expect, it, vi } from "vitest";
import { memberEmailPattern, safeNextPath, validEmailToken } from "../../lib/auth/email";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { linkMemberSession } from "../../lib/auth/member-session";
import { completeEmailSignIn } from "../../app/auth/confirm/actions";

const token = "a".repeat(64);
const user = { id: "auth-id", email: "QA_1%test@example.com" };
let signOut: ReturnType<typeof vi.fn>;
let verifyOtp: ReturnType<typeof vi.fn>;
let lookup: Record<string, ReturnType<typeof vi.fn>>;
let update: Record<string, ReturnType<typeof vi.fn>>;
let from: ReturnType<typeof vi.fn>;
let client: Awaited<ReturnType<typeof import("../../lib/supabase/server").createClient>>;

beforeEach(() => {
  vi.clearAllMocks();
  signOut = vi.fn().mockResolvedValue({ error: null });
  verifyOtp = vi.fn().mockResolvedValue({ error: null });
  client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }), signOut, verifyOtp } } as unknown as typeof client;
  lookup = { select: vi.fn(), ilike: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "member-id", user_id: null }, error: null }) };
  lookup.select.mockReturnValue(lookup); lookup.ilike.mockReturnValue(lookup);
  update = { update: vi.fn(), eq: vi.fn(), or: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "member-id" }, error: null }) };
  for (const key of ["update", "eq", "or", "select"]) update[key].mockReturnValue(update);
  from = vi.fn().mockReturnValueOnce(lookup).mockReturnValue(update);
  mocks.admin.mockReturnValue({ from }); mocks.client.mockResolvedValue(client);
});

describe("member authorization after email verification", () => {
  it("links only the matching member with a conditional write and literal email lookup", async () => {
    expect(await linkMemberSession(client)).toBe(true);
    expect(lookup.ilike).toHaveBeenCalledWith("email", "qa\\_1\\%test@example.com");
    expect(update.eq).toHaveBeenCalledWith("id", "member-id");
    expect(update.or).toHaveBeenCalledWith("user_id.is.null,user_id.eq.auth-id");
    expect(signOut).not.toHaveBeenCalled();
  });
  it("accepts an already linked identity without rewriting it", async () => {
    lookup.maybeSingle.mockResolvedValue({ data: { id: "member-id", user_id: user.id }, error: null });
    expect(await linkMemberSession(client)).toBe(true);
    expect(from).toHaveBeenCalledTimes(1);
  });
  it.each([
    [null, null],
    [{ id: "member-id", user_id: "someone-else" }, null],
    [null, { message: "lookup failed" }],
  ])("denies nonmembers, conflicting identities, and lookup failures", async (data, error) => {
    lookup.maybeSingle.mockResolvedValue({ data, error });
    expect(await linkMemberSession(client)).toBe(false);
    expect(from).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it.each([{ data: null, error: null }, { data: null, error: { message: "write failed" } }])("denies a failed or raced link write", async (result) => {
    update.maybeSingle.mockResolvedValue(result);
    expect(await linkMemberSession(client)).toBe(false);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("never trusts an unverified user", async () => {
    vi.mocked(client.auth.getUser).mockResolvedValue({ data: { user: null }, error: null } as never);
    expect(await linkMemberSession(client)).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});

describe("one-time email confirmation", () => {
  function form(value = token) { const body = new FormData(); body.set("token_hash", value); return body; }
  it("verifies the received email token before linking and redirecting", async () => {
    await expect(completeEmailSignIn(form())).rejects.toThrow("redirect:/");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: token, type: "email" });
    expect(update.update).toHaveBeenCalledWith({ user_id: user.id });
  });
  it("rejects malformed tokens before contacting auth", async () => {
    await expect(completeEmailSignIn(form("invalid"))).rejects.toThrow("redirect:/sign-in?error=link");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects expired or reused tokens without linking a member", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    await expect(completeEmailSignIn(form())).rejects.toThrow("redirect:/sign-in?error=link");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not grant a portal session to an authenticated nonmember", async () => {
    lookup.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(completeEmailSignIn(form())).rejects.toThrow("redirect:/sign-in?error=link");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("auth input boundaries", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/ /evil.example", null])("rejects redirect escapes: %s", (path) => {
    expect(safeNextPath(path)).toBe("/");
  });
  it("preserves a same-origin destination", () => expect(safeNextPath("/history?view=all#visit")).toBe("/history?view=all#visit"));
  it("escapes email pattern metacharacters", () => expect(memberEmailPattern(" A_B%\\@example.com ")).toBe("a\\_b\\%\\\\@example.com"));
  it.each([null, "", "short", "x".repeat(513), "x".repeat(30) + "&next=evil"])("rejects invalid token input", (value) => expect(validEmailToken(value)).toBe(false));
});
