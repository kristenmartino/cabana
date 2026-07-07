import Link from "next/link";
import { AppShell } from "@/components/sailfish/AppShell";

const SUPPORT = { name: "Dana", phone: "(561) 555-0100" };

// Branded 404 — a stale or unknown /request/<id> (e.g. a link to a booking
// that no longer exists) should land here, not on Next's default page.
export default function NotFound() {
  return (
    <AppShell>
      <div className="mt-10 rounded-2xl bg-card p-6 shadow-card">
        <h1 className="font-display text-2xl font-bold text-deepwater">
          We couldn&apos;t find that.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          The page or request you were looking for isn&apos;t here — it may have
          been completed, cancelled, or the link may be old.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-coral px-4 py-3 text-sm font-semibold text-coral-foreground shadow-sm transition hover:brightness-95"
        >
          Back to home
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">
          Still stuck? Text {SUPPORT.name} at{" "}
          <a href={`tel:${SUPPORT.phone.replace(/[^\d]/g, "")}`} className="font-semibold text-lagoon underline-offset-4 hover:underline">
            {SUPPORT.phone}
          </a>
          .
        </p>
      </div>
    </AppShell>
  );
}
