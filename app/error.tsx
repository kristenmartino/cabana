"use client";

import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";

const SUPPORT = { name: "Dana", phone: "(561) 555-0100" };

// Branded error boundary — an unexpected failure shows this, not a stack trace.
// The real detail is in the server logs; the member gets a calm way out.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <div className="mt-10 rounded-2xl bg-card p-6 shadow-card">
        <h1 className="font-display text-2xl font-bold text-deepwater">
          Something went wrong on our end.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          That&apos;s on us, not you. Try again in a moment — nothing you
          submitted is lost.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-coral px-4 py-3 text-sm font-semibold text-coral-foreground shadow-sm transition hover:brightness-95"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-sm font-semibold text-deepwater ring-1 ring-inset ring-border transition hover:bg-muted"
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
    </AppShell>
  );
}
