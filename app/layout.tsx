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
  // Fraunces is a variable serif. Loading it as a variable font (no fixed
  // `weight`) gives the full wght range; the extra `opsz`/`SOFT` axes add
  // optical sizing and a warmer, softer headline texture at display sizes.
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Sailfish Pool Care",
  description:
    "Request service, track repairs in real time, and manage your pool service online. Your Sailfish Pool Care member portal.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7F2E9",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
