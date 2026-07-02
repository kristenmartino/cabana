"use client";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/sailfish/AppShell";
import { StatusPill } from "@/components/sailfish/StatusPill";

type StepKey = "received" | "reviewed" | "deposit" | "scheduled" | "confirmed";

const MOCK = {
  submitted: "Yesterday at 6:42 PM",
  quote:
    "Pump's been making a grinding sound since Sunday, and the water looks a little green on the deep end. Not sure if it's related.",
  currentStep: "deposit" as StepKey,
  statusLabel: "Awaiting deposit",
  statusTone: "deposit" as const,
  depositAmount: 75,
  supportName: "Dana",
  supportPhone: "(561) 555-0100",
};

const STEPS: { key: StepKey; title: string; hint: string }[] = [
  { key: "received", title: "Received", hint: "We've got your note." },
  { key: "reviewed", title: "Reviewed", hint: "Dana checked it over." },
  { key: "deposit", title: "Deposit", hint: "Holds your spot on the schedule." },
  { key: "scheduled", title: "Scheduled", hint: "We'll pick the soonest slot." },
  { key: "confirmed", title: "Confirmed", hint: "Tech and time locked in." },
];

export default function RequestStatus() {
  const m = MOCK;
  const currentIdx = STEPS.findIndex((s) => s.key === m.currentStep);
  const [paid, setPaid] = useState(false);

  return (
    <AppShell>
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-deepwater">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to home
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold text-deepwater">
            Your request
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">Sent {m.submitted}</p>
        </div>
        <StatusPill tone={m.statusTone}>{m.statusLabel}</StatusPill>
      </div>

      {/* Quoted note */}
      <blockquote className="mt-5 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M7 7h4v4H7c0 3 1 5 4 6M15 7h4v4h-4c0 3 1 5 4 6" stroke="var(--color-lagoon)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          You wrote
        </div>
        <p className="mt-2 font-display text-[19px] leading-snug text-deepwater">
          &ldquo;{m.quote}&rdquo;
        </p>
      </blockquote>

      {/* Contextual card by status */}
      {m.currentStep === "deposit" && !paid && (
        <section className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-[color-mix(in_oklab,var(--color-coral)_12%,white)] to-[color-mix(in_oklab,var(--color-coral)_22%,white)] p-6 shadow-card ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-coral)_28%,transparent)]">
          <h2 className="font-display text-xl font-semibold text-deepwater">
            One quick step — your deposit
          </h2>
          <p className="mt-2 text-sm text-deepwater/80">
            Your spot is held until the deposit is in. It goes toward the repair — you&apos;re not
            paying extra.
          </p>
          <button
            onClick={() => setPaid(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-coral px-4 py-3.5 text-base font-semibold text-coral-foreground shadow-sm transition hover:brightness-95 active:brightness-90"
          >
            Pay ${m.depositAmount} deposit
          </button>
          <p className="mt-2 text-center text-xs text-deepwater/70">Secure — takes about 20 seconds.</p>
        </section>
      )}

      {m.currentStep === "deposit" && paid && (
        <section className="mt-5 rounded-2xl bg-[color-mix(in_oklab,var(--color-success)_15%,white)] p-5 ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-success)_28%,transparent)]">
          <p className="font-display text-lg font-semibold text-deepwater">Deposit received — thank you!</p>
          <p className="mt-1 text-sm text-deepwater/80">We&apos;re locking in the soonest visit and will text you a time within the hour.</p>
        </section>
      )}

      {m.currentStep === "reviewed" && (
        <section className="mt-5 rounded-2xl bg-card p-5 shadow-card">
          <p className="font-display text-lg font-semibold text-deepwater">
            Thanks — we&apos;ve got your note.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.supportName} will text you shortly to sort out the details.
          </p>
        </section>
      )}

      {/* Stepper */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-deepwater">Progress</h2>
        <ol className="mt-4 space-y-0">
          {STEPS.map((step, i) => {
            const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "todo";
            const isLast = i === STEPS.length - 1;
            return (
              <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[15px] top-8 h-full w-[2px] ${
                      state === "done" ? "bg-lagoon" : "bg-border"
                    }`}
                  />
                )}
                <div className="relative z-10 mt-0.5">
                  {state === "done" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-lagoon text-lagoon-foreground">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                  {state === "current" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-coral text-coral-foreground ring-4 ring-[color-mix(in_oklab,var(--color-coral)_25%,transparent)]">
                      <span className="h-2 w-2 rounded-full bg-white" />
                    </div>
                  )}
                  {state === "todo" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-card text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className={`text-[15px] font-semibold ${state === "todo" ? "text-muted-foreground" : "text-deepwater"}`}>
                    {step.title}
                    {state === "current" && (
                      <span className="ml-2 text-xs font-medium uppercase tracking-wide text-coral">In progress</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-8 rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card">
        Questions? Text {m.supportName} at{" "}
        <a href={`tel:${m.supportPhone.replace(/[^\d]/g, "")}`} className="font-semibold text-lagoon underline-offset-4 hover:underline">
          {m.supportPhone}
        </a>
        .
      </div>
    </AppShell>
  );
}
