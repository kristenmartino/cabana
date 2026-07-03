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
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-coral px-4 py-3.5 text-base font-semibold text-coral-foreground shadow-sm transition hover:brightness-95 active:brightness-90 disabled:opacity-60"
      >
        {pending ? "Opening checkout…" : `Pay $${amount} deposit`}
      </button>
      {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
