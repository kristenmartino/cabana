export function SailfishLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M2 20c4 0 5-3 9-3 3 0 4 2 7 2 4 0 6-4 12-4l-2 3 2 2c-6 0-8 4-12 4-3 0-4-2-7-2-4 0-5 3-9 3z"
          fill="var(--color-lagoon)"
        />
        <path
          d="M20 8c-1 3-2 5-4 6 1 1 3 2 5 2 0-3-1-6-1-8z"
          fill="var(--color-coral)"
        />
        <circle cx="26" cy="12" r="0.9" fill="var(--color-deepwater)" />
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-tight text-deepwater">
        Sailfish Pool Care
      </span>
    </div>
  );
}

export function WaveDivider({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`wave-divider ${className}`} />;
}
