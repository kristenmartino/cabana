"use client";
import { useState, useTransition } from "react";
import { AppShell } from "@/components/sailfish/AppShell";
import { WaveDivider } from "@/components/sailfish/Logo";
import { sendMagicLink } from "./actions";

const SUPPORT = { name: "Dana", phone: "(561) 555-0100" };
const telHref = `tel:${SUPPORT.phone.replace(/[^\d]/g, "")}`;

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [view, setView] = useState<"form" | "sent" | "not_member">("form");
  const [error, setError] = useState<string | null>(null);
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
        <h1 className="font-display text-[34px] leading-[1.05] font-bold text-deepwater">
          Welcome back to your <span className="text-lagoon">pool.</span>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Sign in to check your next service, see updates from your tech, or let us know
          something needs a look.
        </p>

        <WaveDivider className="my-7 opacity-70" />

        {view === "form" && (
          <form onSubmit={onSubmit} className="rounded-3xl bg-card p-6 shadow-card">
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
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3.5 text-base text-deepwater placeholder:text-muted-foreground/70 focus:border-lagoon focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-coral px-4 py-3.5 text-base font-semibold text-coral-foreground shadow-sm transition hover:brightness-95 active:brightness-90 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send me a sign-in link"}
            </button>
            {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              We&apos;ll email you a secure link — no password to remember.
            </p>
          </form>
        )}

        {view === "sent" && (
          <div className="rounded-3xl bg-card p-6 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-lagoon)_14%,white)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7l8 6 8-6M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M4 7a2 2 0 012-2h12a2 2 0 012 2" stroke="var(--color-lagoon)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-deepwater">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We just sent a sign-in link to <span className="font-medium text-deepwater">{email}</span>.
              Tap the link on this phone and you&apos;re in.
            </p>
            <button
              onClick={() => setView("form")}
              className="mt-5 text-sm font-medium text-lagoon underline-offset-4 hover:underline"
            >
              Use a different email
            </button>
          </div>
        )}

        {view === "not_member" && (
          <div className="rounded-3xl bg-card p-6 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-coral)_15%,white)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 8v5M12 16h.01M10.3 4.3l-7 12A2 2 0 005 20h14a2 2 0 001.7-3l-7-12a2 2 0 00-3.4 0z" stroke="var(--color-coral)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-deepwater">
              We don&apos;t have that email on file
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This portal is for Sailfish members. If you think this is a mistake, or you&apos;d like
              to become a member, give {SUPPORT.name} a call — she&apos;ll get you set up.
            </p>
            <a
              href={telHref}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-coral px-5 py-3 text-base font-semibold text-coral-foreground shadow-sm transition hover:brightness-95"
            >
              Call {SUPPORT.name} · {SUPPORT.phone}
            </a>
            <button
              onClick={() => setView("form")}
              className="mt-4 block w-full text-sm font-medium text-lagoon underline-offset-4 hover:underline"
            >
              Try a different email
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Not a member yet? Call {SUPPORT.name} at{" "}
          <a href={telHref} className="font-semibold text-deepwater underline-offset-4 hover:underline">
            {SUPPORT.phone}
          </a>
          .
        </p>
      </div>
    </AppShell>
  );
}
