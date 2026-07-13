"use client";
// Deposit payment button. On click, calls startDepositCheckout; if it returns
// an error, shows the message; on success, the redirect takes over.
import { useState, useTransition } from "react";
import { startDepositCheckout } from "@/app/request/[id]/actions";

export function PayDepositButton({
  bookingId,
  amount,
}: {
  bookingId: string;
  amount: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await startDepositCheckout(bookingId);
      if (res?.ok === false) {
        setError(res.message);
      }
      // On success, startDepositCheckout redirects, so no setState here.
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="press press-active group relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-coral px-4 py-3.5 text-base font-semibold text-coral-foreground shadow-card transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-hover disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-card"
      >
        {/* Sheen sweeps across on hover — the tactile cue that this is the action. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full group-disabled:hidden"
        />
        <span className="relative">
          {pending ? "Opening checkout…" : `Pay $${amount} deposit`}
        </span>
      </button>
      {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
