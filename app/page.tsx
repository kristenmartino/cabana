import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";
import { StatusPill } from "@/components/sailfish/StatusPill";
import { AccessNotesCard } from "@/components/portal/AccessNotesCard";
import { getHomeData } from "@/lib/portal/data";

export default async function Home() {
  const data = await getHomeData();

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
      <section>
        <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
        <h1 className="mt-0.5 font-display text-[30px] leading-tight font-bold text-deepwater">
          Hi {firstName} <span aria-hidden>👋</span>
        </h1>
      </section>

      {/* Next service hero */}
      {nextService && (
        <section className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-[color-mix(in_oklab,var(--color-lagoon)_92%,white)] to-lagoon text-lagoon-foreground shadow-lift">
          <div className="relative p-6">
            <svg aria-hidden viewBox="0 0 200 80" className="pointer-events-none absolute -right-4 -top-4 h-24 w-40 opacity-25">
              <path d="M0 60 C 30 20, 60 90, 100 55 S 170 20, 200 55" stroke="white" strokeWidth="2" fill="none" />
              <path d="M0 70 C 30 40, 60 100, 100 70 S 170 40, 200 70" stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
            </svg>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
              Your next service
            </p>
            <p className="mt-2 font-display text-[32px] leading-tight font-bold">
              {nextService.dateLabel}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-white/80" />
              {nextService.planName} plan
            </div>
          </div>
        </section>
      )}

      {/* Report a problem CTA */}
      <div className="mt-5">
        <Link
          href="/request"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-4 text-base font-semibold text-coral-foreground shadow-card transition hover:brightness-95 active:brightness-90"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          Report a problem
        </Link>
      </div>

      {/* Open requests */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold text-deepwater">Open requests</h2>
          <span className="text-xs text-muted-foreground">{openRequests.length} active</span>
        </div>
        {openRequests.length > 0 ? (
          <div className="mt-3 space-y-3">
            {openRequests.map((r) => (
              <Link
                key={r.id}
                href={`/request/${r.id}`}
                className="block rounded-2xl bg-card p-4 shadow-card transition hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-medium leading-snug text-deepwater">{r.summary}</p>
                  <StatusPill tone={r.tone}>{r.label}</StatusPill>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Sent {r.submitted}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">
            Nothing open right now — your pool&apos;s in good hands. Something come up?{" "}
            <Link href="/request" className="font-semibold text-lagoon underline-offset-4 hover:underline">
              Let us know
            </Link>
            .
          </p>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold text-deepwater">Service history</h2>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-card">
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
