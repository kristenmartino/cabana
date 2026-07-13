import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";

const SUPPORT = { name: "Dana", phone: "(561) 555-0100" };

// Branded 404 — a stale or unknown /request/<id> (e.g. a link to a booking
// that no longer exists) should land here, not on Next's default page.
export default function NotFound() {
  return (
    <AppShell>
      <div className="settle relative mt-10 overflow-hidden rounded-2xl bg-card p-6 shadow-card">
        {/* A drifting wave — the "lost at sea" moment stays calm and on-brand. */}
        <div aria-hidden className="wave-divider wave-divider-drift pointer-events-none absolute inset-x-0 top-0 opacity-20" />
        <div className="relative">
          <span className="pop-in inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-lagoon)_14%,white)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="var(--color-lagoon)" strokeWidth="1.75" />
              <path d="M20 20l-3.5-3.5" stroke="var(--color-lagoon)" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="mt-4 font-display text-[length:var(--text-h1)] font-bold text-deepwater">
            We couldn&apos;t find that.
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            The page or request you were looking for isn&apos;t here — it may have
            been completed, cancelled, or the link may be old.
          </p>
          <Link
            href="/"
            className="press press-active mt-5 inline-flex items-center gap-2 rounded-xl bg-coral px-4 py-3 text-sm font-semibold text-coral-foreground shadow-card transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-hover"
          >
            Back to home
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            Still stuck? Text {SUPPORT.name} at{" "}
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
