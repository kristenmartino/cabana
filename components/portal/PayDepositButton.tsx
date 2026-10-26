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
        className="mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-coral transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--color-coral)_88%,white)] px-4 py-3.5 text-base font-semibold text-coral-foreground border border-border disabled:opacity-60"
      >
        <span>
          {pending ? "Opening checkout…" : `Pay $${amount} test deposit`}
        </span>
      </button>
      {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
