"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SailfishLogo } from "./Logo";
import { signOut } from "@/app/actions";

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
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/75 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
          <Link
            href="/"
            className="group flex items-center rounded-lg transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px"
          >
            <SailfishLogo />
          </Link>
          {showNav && !isAuth && (
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg px-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-deepwater"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="rise mx-auto max-w-md px-5 pb-24 pt-5">{children}</main>
      <footer className="mx-auto max-w-md px-5 pb-8 text-center text-xs text-muted-foreground">
        <p>Sailfish Pool Care · Jupiter, FL · (561) 555-0100</p>
      </footer>
    </div>
  );
}
