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

// Tones that represent an in-flight state get a gently pulsing dot so the eye is
// drawn to the thing that's actively moving. `pulse` defaults to auto: on for
// scheduled/review/deposit (live), off for done/info (settled).
const livingTones: Record<Tone, boolean> = {
  scheduled: true,
  review: true,
  deposit: true,
  done: false,
  info: false,
};

export function StatusPill({
  tone = "info",
  size = "sm",
  pulse,
  children,
}: {
  tone?: Tone;
  size?: Size;
  pulse?: boolean;
  children: ReactNode;
}) {
  const isLiving = pulse ?? livingTones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide ${sizes[size]} ${tones[tone]}`}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        {isLiving && (
          <span
            aria-hidden
            className="pulse-ring absolute inset-0 rounded-full bg-current"
          />
        )}
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      </span>
      {children}
    </span>
  );
}

export type { Tone };
