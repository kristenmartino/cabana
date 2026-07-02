"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SailfishLogo } from "./Logo";

export function AppShell({
  children,
  showNav = true,
}: {
  children: ReactNode;
  showNav?: boolean;
}) {
  const pathname = usePathname();
  const isAuth = pathname === "/sign-in";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center">
            <SailfishLogo />
          </Link>
          {showNav && !isAuth && (
            <Link
              href="/sign-in"
              className="text-xs font-medium text-muted-foreground hover:text-deepwater"
            >
              Sign out
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 pb-24 pt-5">{children}</main>
      <footer className="mx-auto max-w-md px-5 pb-8 text-center text-xs text-muted-foreground">
        <p>Sailfish Pool Care · Jupiter, FL · (561) 555-0100</p>
      </footer>
    </div>
  );
}
