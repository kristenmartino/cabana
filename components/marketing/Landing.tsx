import Link from "next/link";
import { SUPPORT } from "@/lib/brand";
import { enterDemo } from "@/app/actions";

export function Landing() {
  return (
    <div className="flex flex-col items-center justify-center px-0 py-12">
      <div className="w-full max-w-2xl">
        {/* Hero section */}
        <div className="text-center">
          <h1
            className="font-display text-[length:var(--text-h1)] leading-[1.05] font-bold text-deepwater"
          >
            Request service. Stay informed.
          </h1>
          <p
            className="mt-4 text-lg text-muted-foreground max-w-md mx-auto"
          >
            Report a pool problem, check request status, and try a $75 Stripe test deposit.
          </p>
        </div>

        {/* CTA section */}
        <div
          className="mt-12 space-y-3 flex flex-col items-center"
        >
          <form action={enterDemo} className="w-full max-w-sm">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-lagoon transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-lagoon)_90%,var(--color-deepwater))] px-4 py-4 text-base font-semibold text-lagoon-foreground border border-border"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <span>Enter the demo</span>
            </button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            <p>Explore as Ken Alvarez with sample data — no sign-up required.</p>
            <p className="text-xs mt-1">A live demo with fictional data · Stripe in test mode.</p>
          </div>

          <Link
            href="/sign-in"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg font-semibold text-lagoon underline-offset-4 hover:underline"
          >
            Sign in to your account
          </Link>
        </div>

        {/* Support info */}
        <div
          className="mt-16 pt-8 border-t border-border text-center text-sm text-muted-foreground"
        >
          <p>
            Questions? Call {SUPPORT.name} at{" "}
            <a href={`tel:${SUPPORT.phone.replace(/[^\d]/g, "")}`} className="font-semibold text-deepwater hover:underline">
              {SUPPORT.phone}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
