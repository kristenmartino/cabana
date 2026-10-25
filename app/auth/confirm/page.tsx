import { redirect } from "next/navigation";
import { AppShell } from "@/components/sailfish/AppShell";
import { validEmailToken } from "@/lib/auth/email";
import { completeEmailSignIn } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Confirm sign-in · Sailfish Pool Care",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ConfirmEmail({ searchParams }: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  if (type !== "email" || !validEmailToken(tokenHash)) redirect("/sign-in?error=link");

  // Loading this page does not consume the token. Only the POST verifies it.
  return (
    <AppShell showNav={false}>
      <section className="pt-6">
        <h1 className="font-display text-[length:var(--text-h1)] leading-tight font-bold text-deepwater">
          Sign in to Sailfish Pool Care
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Confirm to open your member account. This email link can only be used once.
        </p>
        <form action={completeEmailSignIn} className="mt-6">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <button type="submit" className="flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-coral px-4 py-3.5 text-base font-semibold text-coral-foreground">
            Sign in
          </button>
        </form>
      </section>
    </AppShell>
  );
}
