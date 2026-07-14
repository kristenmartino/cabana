import type { CSSProperties } from "react";
import Link from "next/link";
import { SailfishLogo } from "@/components/sailfish/Logo";
import { SUPPORT } from "@/lib/brand";
import { enterDemo } from "@/app/actions";

// Allows custom CSS variables (--i, --delay, --stagger-step) in inline styles
// to drive the CSS-only stagger/reveal choreography without a JS animation lib.
type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

export function Landing() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Hero section */}
        <div style={{ "--stagger-step": "60ms" } as CSSVars} className="text-center">
          <div className="flex justify-center mb-6">
            <SailfishLogo />
          </div>
          <h1
            className="rise-sm font-display text-[length:var(--text-h1)] leading-[1.05] font-bold text-deepwater"
            style={{ "--i": 0 } as CSSVars}
          >
            Request service. Stay informed.
          </h1>
          <p
            className="rise-sm mt-4 text-lg text-muted-foreground max-w-md mx-auto"
            style={{ "--i": 1 } as CSSVars}
          >
            Report issues in your own words, track repairs in real time, and manage your pool service online.
          </p>
        </div>

        {/* CTA section */}
        <div
          className="mt-12 space-y-3 flex flex-col items-center"
          style={{ "--stagger-step": "80ms" } as CSSVars}
        >
          <form action={enterDemo} className="w-full max-w-sm">
            <button
              type="submit"
              className="press press-active group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-lagoon px-4 py-4 text-base font-semibold text-lagoon-foreground shadow-card hover:-translate-y-0.5 hover:shadow-hover"
              style={{ "--i": 2, "--delay": "120ms" } as CSSVars}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full"
              />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="relative">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <span className="relative">Enter the demo</span>
            </button>
          </form>

          <div className="text-center text-sm text-muted-foreground" style={{ "--i": 3, "--delay": "120ms" } as CSSVars}>
            <p>Explore as Ken Alvarez with sample data — no sign-up required.</p>
            <p className="text-xs mt-1">A live demo with fictional data · Stripe in test mode.</p>
          </div>

          <Link
            href="/sign-in"
            className="mt-4 font-semibold text-lagoon underline-offset-4 hover:underline"
            style={{ "--i": 4, "--delay": "120ms" } as CSSVars}
          >
            Sign in to your account
          </Link>
        </div>

        {/* Support info */}
        <div
          className="mt-16 pt-8 border-t border-border text-center text-sm text-muted-foreground"
          style={{ "--i": 5, "--delay": "180ms" } as CSSVars}
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
