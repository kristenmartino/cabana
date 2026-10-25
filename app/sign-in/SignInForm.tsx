"use client";
import { useState, useTransition } from "react";
import { AppShell } from "@/components/sailfish/AppShell";
import { sendMagicLink } from "./actions";
import { enterDemo } from "@/app/actions";

export default function SignInForm({ initialError = null }: { initialError?: string | null }) {
  const [email, setEmail] = useState("");
  const [view, setView] = useState<"form" | "sent" | "not_member">("form");
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await sendMagicLink(email);
      if (res.ok) setView("sent");
      else if (res.reason === "not_member") setView("not_member");
      else setError(res.message ?? "Something went wrong. Try again.");
    });
  }

  return (
    <AppShell showNav={false}>
      <div className="pt-6">
        <h1
          className="font-display text-[length:var(--text-hero)] leading-[1.05] font-bold text-deepwater"
        >
          Sign in to your account
        </h1>
        <p
          className="mt-3 text-[15px] leading-relaxed text-muted-foreground"
        >
          Use the email linked to your member account.
        </p>

        {view === "form" && (
          <form
            onSubmit={onSubmit}
            className="mt-7 rounded-2xl bg-card p-6 border border-border"
          >
            <label htmlFor="email" className="block text-sm font-semibold text-deepwater">
              Your email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ken@example.com"
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3.5 text-base text-deepwater transition-colors duration-150 placeholder:text-muted-foreground/70 focus:border-lagoon focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--color-lagoon)_28%,transparent)]"
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-coral transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-coral)_88%,white)] px-4 py-3.5 text-base font-semibold text-coral-foreground border border-border disabled:opacity-60"
            >
              <span>{pending ? "Sending…" : "Send me a sign-in link"}</span>
            </button>
            {error && <p role="alert" className="mt-3 text-center text-sm text-destructive">{error}</p>}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Sign in with a link sent to your email.
            </p>
          </form>
        )}

        {view === "sent" && (
          <div className="rounded-2xl bg-card p-6 text-center border border-border">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-lagoon)_14%,white)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7l8 6 8-6M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M4 7a2 2 0 012-2h12a2 2 0 012 2" stroke="var(--color-lagoon)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-deepwater">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We just sent a sign-in link to <span className="[overflow-wrap:anywhere] font-medium text-deepwater">{email}</span>.
              Open the link, then select Sign in to confirm.
            </p>
            <button
              onClick={() => setView("form")}
              className="mt-5 inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-lagoon underline-offset-4 hover:underline"
            >
              Use a different email
            </button>
          </div>
        )}

        {view === "not_member" && (
          <div className="rounded-2xl bg-card p-6 text-center border border-border">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-coral)_15%,white)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 8v5M12 16h.01M10.3 4.3l-7 12A2 2 0 005 20h14a2 2 0 001.7-3l-7-12a2 2 0 00-3.4 0z" stroke="var(--color-coral)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-deepwater">
              We don&apos;t have that email on file
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use another member email, or explore the shared demo below.
            </p>
            <button
              onClick={() => setView("form")}
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-lagoon underline-offset-4 hover:underline"
            >
              Try a different email
            </button>
          </div>
        )}

        <form action={enterDemo} className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Explore with sample data. No sign-up required.
          </p>
          <button
            type="submit"
            className="mt-2 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-lagoon underline-offset-4 hover:underline"
          >
            Enter the demo
          </button>
        </form>
      </div>
    </AppShell>
  );
}
