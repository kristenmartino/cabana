import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";
import { SUPPORT } from "@/lib/brand";

export default function NotFound() {
  return (
    <AppShell>
      <div className="mt-10 rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-[length:var(--text-h1)] font-bold text-deepwater">
          We couldn&apos;t find that.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          This page or request is unavailable. Check the link or return home.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center rounded-xl bg-coral px-4 py-3 text-sm font-semibold text-coral-foreground transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-coral)_88%,white)]"
        >
          Back to home
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">
          Need help? Call {SUPPORT.name} at{" "}
          <a href={`tel:${SUPPORT.phone.replace(/[^\d]/g, "")}`} className="font-semibold text-lagoon underline-offset-4 hover:underline">
            {SUPPORT.phone}
          </a>
          .
        </p>
      </div>
    </AppShell>
  );
}
