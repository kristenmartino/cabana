// Minimal shell. Member-facing pages arrive via the fenced Lovable scaffold
// on Day 3 (ADR-05) and are refactored in Cursor before merge.
import type { ReactNode } from "react";

export const metadata = {
  title: "Cabana — Sailfish Pool Care",
  description: "Member portal for Sailfish Pool Care (demo — fictional data).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
