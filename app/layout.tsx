// Root layout. Loads the Sailfish fonts (Fraunces display + Inter body) via
// next/font and exposes them as CSS vars the theme (globals.css) references.
// Member-facing pages are the fenced Lovable scaffold (ADR-05), refactored to
// server actions here.
import type { ReactNode } from "react";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Sailfish Pool Care — Member Portal",
  description:
    "Your Sailfish Pool Care member portal — check your next service, report a problem, and stay in touch with Dana's team in Jupiter, Florida.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
