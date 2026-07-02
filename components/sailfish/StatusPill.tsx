import type { ReactNode } from "react";

type Tone = "scheduled" | "review" | "deposit" | "done" | "info";

const tones: Record<Tone, string> = {
  scheduled:
    "bg-[color-mix(in_oklab,var(--color-lagoon)_14%,white)] text-lagoon ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-lagoon)_25%,transparent)]",
  review:
    "bg-[color-mix(in_oklab,var(--color-warn)_22%,white)] text-[oklch(0.42_0.09_75)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-warn)_35%,transparent)]",
  deposit:
    "bg-[color-mix(in_oklab,var(--color-coral)_15%,white)] text-[oklch(0.5_0.16_38)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-coral)_30%,transparent)]",
  done: "bg-[color-mix(in_oklab,var(--color-success)_18%,white)] text-[oklch(0.4_0.09_165)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-success)_30%,transparent)]",
  info: "bg-secondary text-deepwater ring-1 ring-inset ring-border",
};

export function StatusPill({
  tone = "info",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export type { Tone };
