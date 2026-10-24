"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AppShell } from "@/components/sailfish/AppShell";
import { submitRequest } from "./actions";


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
      <Link href="/" className="inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-muted-foreground hover:text-deepwater">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Link>

      <div className="mt-3">
        <h1
          className="font-display text-[length:var(--text-h1)] leading-tight font-bold text-deepwater"
        >
          What&apos;s going on with your pool?
        </h1>
        <p
          className="mt-2 text-[15px] leading-relaxed text-muted-foreground"
        >
          Describe the problem. Include any equipment names or error codes.{" "}
          <span className="italic">
            &ldquo;Pump&apos;s making a grinding noise and the water&apos;s going green.&rdquo;
          </span>
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-6">
        <label htmlFor="story" className="sr-only">Describe the issue</label>
        <div className="rounded-2xl bg-card p-2 border border-border focus-within:ring-2 focus-within:ring-lagoon focus-within:ring-offset-2 focus-within:ring-offset-background">
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
          className="mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-coral transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-coral)_88%,white)] px-4 py-4 text-base font-semibold text-coral-foreground border border-border disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{pending ? "Sending…" : "Send to Sailfish"}</span>
          {!pending && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          After you send this, you can check its status in the portal.
        </p>
      </form>
    </AppShell>
  );
}
