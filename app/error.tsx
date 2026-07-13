"use client";

import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";

const SUPPORT = { name: "Dana", phone: "(561) 555-0100" };

// Branded error boundary — an unexpected failure shows this, not a stack trace.
// The real detail is in the server logs; the member gets a calm way out.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <div className="settle relative mt-10 overflow-hidden rounded-2xl bg-card p-6 shadow-card">
        {/* Calm wave motif — even the failure page stays on-brand and unhurried. */}
        <div aria-hidden className="wave-divider wave-divider-drift pointer-events-none absolute inset-x-0 top-0 opacity-20" />
        <div className="relative">
          <span className="pop-in inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-warn)_18%,white)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 8v5M12 16h.01M10.3 4.3l-7 12A2 2 0 005 20h14a2 2 0 001.7-3l-7-12a2 2 0 00-3.4 0z" stroke="var(--color-warn)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="mt-4 font-display text-[length:var(--text-h1)] font-bold text-deepwater">
            Something went wrong on our end.
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            That&apos;s on us, not you. Try again in a moment — nothing you
            submitted is lost.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={reset}
              className="press press-active inline-flex items-center gap-2 rounded-xl bg-coral px-4 py-3 text-sm font-semibold text-coral-foreground shadow-card transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-hover"
            >
              Try again
            </button>
            <Link
              href="/"
              className="press press-active inline-flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-sm font-semibold text-deepwater ring-1 ring-inset ring-border transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-muted"
            >
              Back to home
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            If it keeps happening, text {SUPPORT.name} at{" "}
            <a href={`tel:${SUPPORT.phone.replace(/[^\d]/g, "")}`} className="font-semibold text-lagoon underline-offset-4 hover:underline">
              {SUPPORT.phone}
            </a>
            .
          </p>
        </div>
      </div>
    </AppShell>
  );
}
