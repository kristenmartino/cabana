import type { CSSProperties } from "react";
import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";
import { StatusPill } from "@/components/sailfish/StatusPill";
import { AccessNotesCard } from "@/components/portal/AccessNotesCard";
import { Landing } from "@/components/marketing/Landing";
import { getHomeData } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

// Allows custom CSS variables (--i, --delay, --stagger-step) in inline styles
// to drive the CSS-only stagger/reveal choreography without a JS animation lib.
type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const data = user ? await getHomeData() : null;

  // Unauthenticated: show public landing page
  if (!user) {
    return (
      <AppShell showNav={false}>
        <Landing />
      </AppShell>
    );
  }

  // Authenticated: show member portal
  if (!data) {
    return (
      <AppShell>
        <div className="pt-16 text-center">
          <p className="text-muted-foreground">
            We couldn&apos;t load your account. Please{" "}
            <Link href="/sign-in" className="font-semibold text-lagoon underline-offset-4 hover:underline">
              sign in
            </Link>{" "}
            again.
          </p>
        </div>
      </AppShell>
    );
  }

  const { firstName, nextService, openRequests, history, property } = data;

  return (
    <AppShell>
      <section style={{ "--stagger-step": "60ms" } as CSSVars}>
        <p
          className="rise-sm text-[var(--text-label)] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          style={{ "--i": 0 } as CSSVars}
        >
          Welcome back
        </p>
        <h1
          className="rise-sm mt-1 font-display text-[length:var(--text-h1)] leading-[1.05] font-bold text-deepwater"
          style={{ "--i": 1 } as CSSVars}
        >
          Hi {firstName} <span aria-hidden>👋</span>
        </h1>
      </section>

      {/* Next service hero */}
      {nextService && (
        <section
          className="settle group relative mt-6 overflow-hidden rounded-3xl bg-lagoon text-lagoon-foreground shadow-hero"
          style={{ "--delay": "120ms" } as CSSVars}
        >
          {/* Layered depth: base gradient + a soft top-left highlight so the card
              reads as a lit surface rather than a flat fill. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_oklab,var(--color-lagoon)_86%,white)] via-lagoon to-[color-mix(in_oklab,var(--color-lagoon)_78%,var(--color-deepwater))]"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/18 to-transparent"
          />
          {/* Drifting waves — the water is alive but calm. */}
          <div
            aria-hidden
            className="wave-divider-light wave-divider-drift pointer-events-none absolute inset-x-0 bottom-4 opacity-50"
          />
          <svg
            aria-hidden
            viewBox="0 0 200 80"
            className="pointer-events-none absolute -right-4 -top-4 h-24 w-40 opacity-25 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
          >
            <path d="M0 60 C 30 20, 60 90, 100 55 S 170 20, 200 55" stroke="white" strokeWidth="2" fill="none" />
            <path d="M0 70 C 30 40, 60 100, 100 70 S 170 40, 200 70" stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
          </svg>

          <div
            className="relative p-6"
            style={{ "--stagger-step": "80ms" } as CSSVars}
          >
            <p
              className="rise-sm text-[var(--text-label)] font-semibold uppercase tracking-[0.16em] text-white/75"
              style={{ "--i": 1, "--delay": "180ms" } as CSSVars}
            >
              Your next service
            </p>
            <p
              className="rise-sm mt-2 font-display text-[length:var(--text-hero)] leading-[1.02] font-bold tracking-[-0.02em]"
              style={{ "--i": 2, "--delay": "180ms" } as CSSVars}
            >
              {nextService.dateLabel}
            </p>
            <div
              className="rise-sm mt-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm ring-1 ring-inset ring-white/15 backdrop-blur-sm"
              style={{ "--i": 3, "--delay": "180ms" } as CSSVars}
            >
              <span className="breathe h-2 w-2 rounded-full bg-white/85" />
              {nextService.planName} plan
            </div>
          </div>
        </section>
      )}

      {/* Report a problem CTA */}
      <div className="mt-5">
        <Link
          href="/request"
          className="press press-active group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-coral px-4 py-4 text-base font-semibold text-coral-foreground shadow-card hover:-translate-y-0.5 hover:shadow-hover"
        >
          {/* Sheen sweeps across on hover. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full"
          />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="relative">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span className="relative">Report a problem</span>
        </Link>
      </div>

      {/* Open requests */}
      <section className="mt-9">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[length:var(--text-h2)] font-semibold text-deepwater">Open requests</h2>
          <span className="text-xs text-muted-foreground">{openRequests.length} active</span>
        </div>
        {openRequests.length > 0 ? (
          <div className="mt-3 space-y-3">
            {openRequests.map((r, i) => (
              <Link
                key={r.id}
                href={`/request/${r.id}`}
                className="reveal group block rounded-2xl bg-card p-4 shadow-card transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-hover"
                style={{ "--i": i } as CSSVars}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-medium leading-snug text-deepwater">{r.summary}</p>
                  <StatusPill tone={r.tone}>{r.label}</StatusPill>
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  Sent {r.submitted}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                    className="translate-x-0 opacity-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:opacity-100"
                  >
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-success)_14%,white)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M20 6L9 17l-5-5" stroke="var(--color-success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground">
              Nothing open right now — your pool&apos;s in good hands. Something come up?{" "}
              <Link href="/request" className="font-semibold text-lagoon underline-offset-4 hover:underline">
                Let us know
              </Link>
              .
            </p>
          </div>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section className="mt-9">
          <h2 className="font-display text-[length:var(--text-h2)] font-semibold text-deepwater">Service history</h2>
          <ul className="reveal mt-3 divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-card">
            {history.map((h) => (
              <li key={h.id} className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-lagoon)_12%,white)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M20 6L9 17l-5-5" stroke="var(--color-lagoon)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-medium text-deepwater">{h.title}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{h.date}</span>
                  </div>
                  {h.note && <p className="mt-0.5 text-sm text-muted-foreground">{h.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Access notes — the one member-editable field */}
      {property && <AccessNotesCard propertyId={property.id} notes={property.accessNotes} />}
    </AppShell>
  );
}
