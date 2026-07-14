"use client";
import type { CSSProperties } from "react";
import { useState, useTransition } from "react";
import { AppShell } from "@/components/sailfish/AppShell";
import { WaveDivider } from "@/components/sailfish/Logo";
import { sendMagicLink } from "./actions";
import { SUPPORT } from "@/lib/brand";

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;
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
      <div className="pt-6" style={{ "--stagger-step": "90ms" } as CSSVars}>
        <h1
          className="rise-sm font-display text-[length:var(--text-hero)] leading-[1.05] font-bold text-deepwater"
          style={{ "--i": 0 } as CSSVars}
        >
          Welcome back to your <span className="text-lagoon">pool.</span>
        </h1>
        <p
          className="rise-sm mt-3 text-[15px] leading-relaxed text-muted-foreground"
          style={{ "--i": 1 } as CSSVars}
        >
          Sign in to check your next service, see updates from your tech, or let us know
          something needs a look.
        </p>

        {/* First-impression flourish: the divider wave drifts slowly, so the
            page feels like calm water the moment it lands. */}
        <div className="rise-sm my-7" style={{ "--i": 2 } as CSSVars}>
          <WaveDivider className="wave-divider-drift opacity-70" />
        </div>

        {view === "form" && (
          <form
            onSubmit={onSubmit}
            className="settle rounded-3xl bg-card p-6 shadow-card"
            style={{ "--delay": "260ms" } as CSSVars}
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
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3.5 text-base text-deepwater transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-muted-foreground/70 focus:border-lagoon focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--color-lagoon)_28%,transparent)]"
            />
            <button
              type="submit"
              disabled={pending}
              className="press press-active group relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-coral px-4 py-3.5 text-base font-semibold text-coral-foreground shadow-sm transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-hover disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full group-disabled:hidden"
              />
              <span className="relative">{pending ? "Sending…" : "Send me a sign-in link"}</span>
            </button>
            {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              We&apos;ll email you a secure link — no password to remember.
            </p>
          </form>
        )}

        {view === "sent" && (
          <div className="settle rounded-3xl bg-card p-6 text-center shadow-card">
            <div className="pop-in mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-lagoon)_14%,white)]">
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
          <div className="settle rounded-3xl bg-card p-6 text-center shadow-card">
            <div className="pop-in mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-coral)_15%,white)]">
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
              className="press press-active mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-coral px-5 py-3 text-base font-semibold text-coral-foreground shadow-sm transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-hover"
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
