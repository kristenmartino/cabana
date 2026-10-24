import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/sailfish/AppShell";
import { StatusPill } from "@/components/sailfish/StatusPill";
import { getRequestStatus } from "@/lib/portal/data";
import { PayDepositButton } from "@/components/portal/PayDepositButton";
import { AwaitingPaymentRefresh } from "@/components/portal/AwaitingPaymentRefresh";
import { SUPPORT } from "@/lib/brand";

export default async function RequestStatus({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const { paid } = await searchParams;
  const req = await getRequestStatus(id);
  if (!req) notFound();
  // The return URL requests a refresh; only the payment record establishes receipt.
  const confirming = paid === "1" && req.deposit?.due;
  const telHref = `tel:${SUPPORT.phone.replace(/[^\d]/g, "")}`;

  return (
    <AppShell>
      <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-deepwater">
        ← Back to home
      </Link>
      <div className="mt-4">
        <h1 className="font-display text-[length:var(--text-h1)] font-bold text-deepwater">Your request</h1>
        <p className="mt-1 text-xs text-muted-foreground">Sent {req.submitted}</p>
      </div>

      {req.requestText && (
        <blockquote className="mt-5 border-l-2 border-lagoon pl-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">You wrote</p>
          <p className="mt-2 text-[15px] leading-relaxed text-deepwater">{req.requestText}</p>
        </blockquote>
      )}

      <section className="mt-6 border-y border-border py-5" aria-labelledby="request-status">
        <h2 id="request-status" className="mb-3 font-display text-xl font-semibold text-deepwater">Request status</h2>
        <StatusPill tone={req.tone} size="md">{req.label}</StatusPill>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{req.description}</p>
        {req.visitWindow && (
          <dl className="mt-4 text-sm">
            <dt className="font-semibold text-deepwater">Visit window</dt>
            <dd className="mt-1 text-muted-foreground">{req.visitWindow}</dd>
          </dl>
        )}
      </section>

      {req.deposit?.due && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          {confirming ? (
            <>
              <AwaitingPaymentRefresh />
              <h2 className="font-display text-xl font-semibold text-deepwater" role="status">Confirming your payment…</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This page updates when the payment is recorded. You can close it and check back later.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-deepwater">Repair deposit: ${req.deposit.amount}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The deposit goes toward your repair. A visit time will be confirmed separately.
              </p>
              <PayDepositButton bookingId={req.id} amount={req.deposit.amount} />
              <p className="mt-2 text-center text-xs text-muted-foreground">Stripe checkout · test mode. No real payment is collected.</p>
            </>
          )}
        </section>
      )}

      {req.deposit && ["paid", "refunded", "expired"].includes(req.deposit.status) && (
        <section className="mt-6 border-b border-border pb-5">
          <h2 className="font-display text-xl font-semibold text-deepwater">
            {req.deposit.status === "paid" ? "Deposit received" : req.deposit.status === "refunded" ? "Deposit refunded" : "Deposit checkout expired"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            ${req.deposit.amount} · {req.deposit.status === "paid" ? "Recorded payment" : "Payment status"} · Stripe test mode
          </p>
        </section>
      )}

      <p className="mt-8 text-sm text-muted-foreground">
        Questions? Call {SUPPORT.name} at{" "}
        <a href={telHref} className="font-semibold text-deepwater hover:underline">{SUPPORT.phone}</a>.
      </p>
    </AppShell>
  );
}
