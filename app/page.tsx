import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";
import { StatusPill } from "@/components/sailfish/StatusPill";
import { AccessNotesCard } from "@/components/portal/AccessNotesCard";
import { Landing } from "@/components/marketing/Landing";
import { getHomeData } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

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
      <section>
        <p
          className="text-[var(--text-label)] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        >
          Welcome back
        </p>
        <h1
          className="mt-1 font-display text-[length:var(--text-h1)] leading-[1.05] font-bold text-deepwater"
        >
          Hi {firstName}
        </h1>
      </section>

      {nextService && (
        <section className="mt-6 rounded-2xl bg-lagoon p-6 text-lagoon-foreground">
          <p className="text-[var(--text-label)] font-semibold uppercase tracking-[0.14em]">
            Regular service day
          </p>
          <p className="mt-2 font-display text-[length:var(--text-hero)] leading-tight font-bold">
            {nextService.dateLabel}
          </p>
          <p className="mt-3 text-sm">{nextService.planName} plan</p>
        </section>
      )}

      {/* Report a problem CTA */}
      <div className="mt-5">
        <Link
          href="/request"
          className="flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-coral transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-coral)_88%,white)] px-4 py-4 text-base font-semibold text-coral-foreground border border-border"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span>Report a problem</span>
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
            {openRequests.map((r) => (
              <Link
                key={r.id}
                href={`/request/${r.id}`}
                className="block rounded-xl border border-border bg-card p-4 transition-colors duration-150 hover:border-lagoon"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-medium leading-snug text-deepwater">{r.summary}</p>
                  <StatusPill tone={r.tone}>{r.label}</StatusPill>
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  Sent {r.submitted}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 border-t border-border py-4 text-sm text-muted-foreground">
            No open requests.
          </p>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section className="mt-9">
          <h2 className="font-display text-[length:var(--text-h2)] font-semibold text-deepwater">Service history</h2>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl bg-card border border-border">
            {history.map((h) => (
              <li key={h.id} className="flex items-start gap-3 p-4">
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
