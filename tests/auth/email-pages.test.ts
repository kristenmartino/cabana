import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const verify = vi.hoisted(() => vi.fn());
vi.mock("@/components/sailfish/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/app/auth/confirm/actions", () => ({ completeEmailSignIn: verify }));
vi.mock("@/app/sign-in/actions", () => ({ sendMagicLink: vi.fn() }));
vi.mock("@/app/actions", () => ({ enterDemo: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import ConfirmEmail from "../../app/auth/confirm/page";
import SignIn from "../../app/sign-in/page";

describe("email link pages", () => {
  it("renders a confirmation on repeated GETs without consuming the one-time token", async () => {
    for (let count = 0; count < 2; count++) {
      const html = renderToStaticMarkup(await ConfirmEmail({ searchParams: Promise.resolve({ token_hash: "a".repeat(64), type: "email" }) }));
      expect(html).toContain("This email link can only be used once.");
      expect(html).toContain('type="submit"');
    }
    expect(verify).not.toHaveBeenCalled();
  });
  it.each([{}, { token_hash: "short", type: "email" }, { token_hash: "a".repeat(64), type: "recovery" }])("rejects invalid confirmation URLs", async (params) => {
    await expect(ConfirmEmail({ searchParams: Promise.resolve(params) })).rejects.toThrow("redirect:/sign-in?error=link");
  });
  it("shows recovery instructions after an expired or invalid link", async () => {
    const html = renderToStaticMarkup(await SignIn({ searchParams: Promise.resolve({ error: "link" }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("This sign-in link is invalid or has expired. Request a new link.");
  });
});
