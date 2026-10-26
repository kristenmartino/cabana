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
  const isAuth = pathname === "/sign-in" || pathname.startsWith("/auth/");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 py-1">
          <Link
            href="/"
            className="flex min-h-11 shrink-0 items-center rounded-lg"
          >
            <SailfishLogo />
          </Link>
          {showNav && !isAuth && (
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-deepwater"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 pb-24 pt-5">
        {(showNav || isAuth) && (
          <p className="mb-5 border-b border-border pb-3 text-xs leading-relaxed text-muted-foreground">
            {isAuth
              ? "Fictional service data · Stripe test mode."
              : "Demo · shared fictional data · Stripe test mode. Use sample details only."}
          </p>
        )}
        {children}
      </main>
      <footer className="mx-auto max-w-md px-5 pb-8 text-center text-xs text-muted-foreground">
        <p>Sailfish Pool Care · Fictional company · Jupiter, FL</p>
      </footer>
    </div>
  );
}
