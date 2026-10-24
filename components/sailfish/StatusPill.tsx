import type { ReactNode } from "react";

type Tone = "scheduled" | "review" | "deposit" | "done" | "info";
type Size = "sm" | "md";

const tones: Record<Tone, string> = {
  scheduled:
    "bg-[color-mix(in_oklab,var(--color-lagoon)_14%,white)] text-[oklch(0.42_0.08_195)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-lagoon)_25%,transparent)]",
  review:
    "bg-[color-mix(in_oklab,var(--color-warn)_22%,white)] text-[oklch(0.4_0.09_75)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-warn)_35%,transparent)]",
  deposit:
    "bg-[color-mix(in_oklab,var(--color-coral)_15%,white)] text-[oklch(0.48_0.16_38)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-coral)_30%,transparent)]",
  done: "bg-[color-mix(in_oklab,var(--color-success)_18%,white)] text-[oklch(0.38_0.09_165)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-success)_30%,transparent)]",
  info: "bg-secondary text-deepwater ring-1 ring-inset ring-border",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3 py-1.5 text-xs",
};

export function StatusPill({
  tone = "info",
  size = "sm",
  children,
}: {
  tone?: Tone;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md font-semibold uppercase tracking-wide ${sizes[size]} ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export type { Tone };
