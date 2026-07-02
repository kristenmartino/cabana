"use client";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/sailfish/AppShell";
import { StatusPill } from "@/components/sailfish/StatusPill";

const MOCK = {
  member: { firstName: "Ken" },
  nextService: {
    dateLabel: "Tuesday, Jul 8",
    windowLabel: "Between 9 AM and 12 PM",
    plan: "Weekly Essential",
    tech: { name: "Marcus T.", initials: "MT" },
  },
  openRequests: [
    {
      id: "r-104",
      summary: "Pump is grinding, water turning green",
      submitted: "Yesterday, 6:42 PM",
      status: "deposit" as const,
      statusLabel: "Awaiting deposit",
    },
    {
      id: "r-103",
      summary: "Skimmer basket lid cracked",
      submitted: "Jun 27",
      status: "scheduled" as const,
      statusLabel: "Scheduled",
    },
  ],
  history: [
    { id: "j-98", date: "Jun 24", title: "Weekly service", note: "Chlorine +2 lbs, brushed tile line" },
    { id: "j-97", date: "Jun 17", title: "Weekly service", note: "Cleared leaves, balanced pH" },
    { id: "j-96", date: "Jun 10", title: "Weekly service", note: "Emptied pump basket" },
    { id: "j-95", date: "Jun 03", title: "Filter cartridge replaced", note: "Included in plan" },
  ],
  access: {
    gateCode: "5182#",
    pets: "Biscuit — friendly golden, may bark at first",
  },
};

export default function Home() {
  const [showCode, setShowCode] = useState(false);
  const m = MOCK;

  return (
    <AppShell>
      <section>
        <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
        <h1 className="mt-0.5 font-display text-[30px] leading-tight font-bold text-deepwater">
          Hi {m.member.firstName} <span aria-hidden>👋</span>
        </h1>
      </section>

      {/* Next service hero */}
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
            {m.nextService.dateLabel}
          </p>
          <p className="mt-1 text-sm text-white/85">{m.nextService.windowLabel}</p>

          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/12 p-3 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-sm font-semibold text-lagoon">
              {m.nextService.tech.initials}
            </div>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{m.nextService.tech.name}</p>
              <p className="text-white/75">{m.nextService.plan} plan</p>
            </div>
          </div>
        </div>
      </section>

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
          <span className="text-xs text-muted-foreground">{m.openRequests.length} active</span>
        </div>
        <div className="mt-3 space-y-3">
          {m.openRequests.map((r) => (
            <Link
              key={r.id}
              href="/request/status"
              className="block rounded-2xl bg-card p-4 shadow-card transition hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-medium leading-snug text-deepwater">
                  {r.summary}
                </p>
                <StatusPill tone={r.status}>{r.statusLabel}</StatusPill>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Sent {r.submitted}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* History */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold text-deepwater">Service history</h2>
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-card">
          {m.history.map((h) => (
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
                <p className="mt-0.5 text-sm text-muted-foreground">{h.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Access notes */}
      <section className="mt-8">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-deepwater">Gate code &amp; pets</h3>
            <button className="text-sm font-semibold text-lagoon underline-offset-4 hover:underline">
              Edit
            </button>
          </div>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Gate code</dt>
              <dd className="flex items-center gap-2 font-mono text-deepwater">
                {showCode ? m.access.gateCode : "•••••"}
                <button
                  onClick={() => setShowCode((v) => !v)}
                  className="font-sans text-xs font-semibold text-lagoon underline-offset-4 hover:underline"
                >
                  {showCode ? "Hide" : "Show"}
                </button>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Pets</dt>
              <dd className="text-right text-deepwater">{m.access.pets}</dd>
            </div>
          </dl>
        </div>
      </section>
    </AppShell>
  );
}
