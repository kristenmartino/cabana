"use client";

import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <div className="mt-10 rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-[length:var(--text-h1)] font-bold text-deepwater">
          We couldn&apos;t load this page.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Try again, or return home to check your requests.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center rounded-xl bg-coral px-4 py-3 text-sm font-semibold text-coral-foreground transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-coral)_88%,white)]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-border px-4 py-3 text-sm font-semibold text-deepwater transition-colors duration-150 hover:bg-muted"
          >
            Back to home
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
