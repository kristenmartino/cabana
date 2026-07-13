"use client";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AppShell } from "@/components/sailfish/AppShell";
import { submitRequest } from "./actions";

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

const RESPONSE_TIME = "usually within a few minutes";

export default function NewRequest() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      // On success this redirects to the new request's status page.
      const res = await submitRequest(text);
      if (res && !res.ok) setError(res.message);
    });
  }

  return (
    <AppShell>
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-deepwater">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Link>

      <div className="mt-3" style={{ "--stagger-step": "70ms" } as CSSVars}>
        <h1
          className="rise-sm font-display text-[length:var(--text-h1)] leading-tight font-bold text-deepwater"
          style={{ "--i": 0 } as CSSVars}
        >
          What&apos;s going on with your pool?
        </h1>
        <p
          className="rise-sm mt-2 text-[15px] leading-relaxed text-muted-foreground"
          style={{ "--i": 1 } as CSSVars}
        >
          Just describe it in your own words — like you&apos;d text a friend.{" "}
          <span className="italic">
            &ldquo;Pump&apos;s making a grinding noise and the water&apos;s going green.&rdquo;
          </span>
        </p>
      </div>

      <form onSubmit={onSubmit} className="rise-sm mt-6" style={{ "--delay": "160ms" } as CSSVars}>
        <label htmlFor="story" className="sr-only">Describe the issue</label>
        {/* Focus glow: the calm lagoon ring blooms softly on focus so the
            textarea reads as the invited "just tell us" moment. */}
        <div className="group rounded-3xl bg-card p-2 shadow-card transition-shadow duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-within:shadow-hover focus-within:ring-2 focus-within:ring-lagoon focus-within:ring-offset-2 focus-within:ring-offset-background">
          <textarea
            id="story"
            required
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tell us what you're seeing, hearing, or smelling…"
            className="block h-44 w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-[17px] leading-relaxed text-deepwater placeholder:text-muted-foreground/70 focus:outline-none"
          />
        </div>

        {/* Photo attachments flow through to Airtable in v1.5 (P1) — until then
            the intake is text-only rather than a control that silently drops files. */}

        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!text.trim() || pending}
          className="press press-active group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-coral px-4 py-4 text-base font-semibold text-coral-foreground shadow-card transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-card"
        >
          {/* Sheen sweeps across on hover — muted while disabled. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full group-disabled:hidden"
          />
          <span className="relative">{pending ? "Sending…" : "Send to Sailfish"}</span>
          {!pending && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="relative">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          We&apos;ll read this right away and text you back — {RESPONSE_TIME}.
        </p>
      </form>
    </AppShell>
  );
}
