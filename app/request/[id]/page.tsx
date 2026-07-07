import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/sailfish/AppShell";
import { StatusPill } from "@/components/sailfish/StatusPill";
import { getRequestStatus, type StepKey } from "@/lib/portal/data";
import { PayDepositButton } from "@/components/portal/PayDepositButton";
import { AwaitingPaymentRefresh } from "@/components/portal/AwaitingPaymentRefresh";

const STEPS: { key: StepKey; title: string; hint: string }[] = [
  { key: "received", title: "Received", hint: "We've got your note." },
  { key: "reviewed", title: "Reviewed", hint: "Dana checked it over." },
  { key: "deposit", title: "Deposit", hint: "Holds your spot on the schedule." },
  { key: "scheduled", title: "Scheduled", hint: "We'll pick the soonest slot." },
  { key: "confirmed", title: "Confirmed", hint: "Tech and time locked in." },
];

const SUPPORT = { name: "Dana", phone: "(561) 555-0100" };

export default async function RequestStatus({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const resolved = await searchParams;
  const isPaid = resolved.paid ? true : false;
  const req = await getRequestStatus(id);
  if (!req) notFound(); // RLS-scoped: not this member's booking, or unknown id

  const currentIdx = STEPS.findIndex((s) => s.key === req.currentStep);
  const telHref = `tel:${SUPPORT.phone.replace(/[^\d]/g, "")}`;

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
          <h1 className="font-display text-[28px] leading-tight font-bold text-deepwater">Your request</h1>
          <p className="mt-1 text-xs text-muted-foreground">Sent {req.submitted}</p>
        </div>
        <StatusPill tone={req.tone}>{req.label}</StatusPill>
      </div>

      {/* Quoted note */}
      {req.requestText && (
        <blockquote className="mt-5 rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 7h4v4H7c0 3 1 5 4 6M15 7h4v4h-4c0 3 1 5 4 6" stroke="var(--color-lagoon)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            You wrote
          </div>
          <p className="mt-2 font-display text-[19px] leading-snug text-deepwater">
            &ldquo;{req.requestText}&rdquo;
          </p>
        </blockquote>
      )}

      {/* Needs-review holding message (the honest "Dana will text you") */}
      {req.status === "needs_review" && (
        <section className="mt-5 rounded-2xl bg-card p-5 shadow-card">
          <p className="font-display text-lg font-semibold text-deepwater">
            {req.ackDraft ? "We're looking into this." : "Thanks — we've got your note."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {req.ackDraft ?? `${SUPPORT.name} will text you shortly to sort out the details.`}
          </p>
        </section>
      )}

      {/* The AI-drafted acknowledgment for a qualified request (R2). Shown for
          any non-review status that carries one — the deposit card follows. */}
      {req.status !== "needs_review" && req.ackDraft && (
        <section className="mt-5 rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-lagoon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3l2.2 4.9L19.5 9l-3.8 3.4L16.6 18 12 15.3 7.4 18l.9-5.6L4.5 9l5.3-1.1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            Triaged
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-deepwater">{req.ackDraft}</p>
        </section>
      )}

      {/* Deposit due */}
      {req.deposit?.due && (
        <section className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-[color-mix(in_oklab,var(--color-coral)_12%,white)] to-[color-mix(in_oklab,var(--color-coral)_22%,white)] p-6 shadow-card ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-coral)_28%,transparent)]">
          {isPaid && req.status === "awaiting_deposit" ? (
            <>
              <AwaitingPaymentRefresh />
              <h2 className="font-display text-xl font-semibold text-deepwater">
                Confirming your payment…
              </h2>
              <p className="mt-2 text-sm text-deepwater/80">
                This updates automatically once your bank confirms — the page is safe to close.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-deepwater">
                One quick step — your deposit
              </h2>
              <p className="mt-2 text-sm text-deepwater/80">
                Your spot is held until the deposit is in. It goes toward the repair — you&apos;re not
                paying extra.
              </p>
              <PayDepositButton bookingId={req.id} amount={req.deposit.amount} />
              <p className="mt-2 text-center text-xs text-deepwater/70">Secure checkout — powered by Stripe.</p>
            </>
          )}
        </section>
      )}

      {/* Deposit paid */}
      {req.deposit?.status === "paid" && (
        <section className="mt-5 rounded-2xl bg-[color-mix(in_oklab,var(--color-success)_15%,white)] p-5 ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-success)_28%,transparent)]">
          <p className="font-display text-lg font-semibold text-deepwater">Deposit received — thank you!</p>
          <p className="mt-1 text-sm text-deepwater/80">
            We&apos;re locking in the soonest visit and will text you a time.
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
        Questions? Text {SUPPORT.name} at{" "}
        <a href={telHref} className="font-semibold text-lagoon underline-offset-4 hover:underline">
          {SUPPORT.phone}
        </a>
        .
      </div>
    </AppShell>
  );
}
