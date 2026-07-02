"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppShell } from "@/components/sailfish/AppShell";

const MOCK = {
  responseTime: "usually within a few minutes",
  supportName: "Dana",
};

export default function NewRequest() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPhoto(url);
  };

  return (
    <AppShell>
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-deepwater">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Link>

      <div className="mt-3">
        <h1 className="font-display text-[30px] leading-tight font-bold text-deepwater">
          What&apos;s going on with your pool?
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Just describe it in your own words — like you&apos;d text a friend.{" "}
          <span className="italic">
            &ldquo;Pump&apos;s making a grinding noise and the water&apos;s going green.&rdquo;
          </span>
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || submitting) return;
          setSubmitting(true);
          setTimeout(() => router.push("/request/status"), 400);
        }}
        className="mt-6"
      >
        <label htmlFor="story" className="sr-only">Describe the issue</label>
        <div className="rounded-3xl bg-card p-2 shadow-card focus-within:ring-2 focus-within:ring-lagoon">
          <textarea
            id="story"
            required
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tell us what you're seeing, hearing, or smelling…"
            className="block h-44 w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-[17px] leading-relaxed text-deepwater placeholder:text-muted-foreground/70 focus:outline-none"
          />
        </div>

        {/* Photo dropzone */}
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-deepwater">
            Add a photo <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          {!photo ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/50 px-4 py-6 text-sm font-medium text-muted-foreground transition hover:border-lagoon hover:text-deepwater"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
                <circle cx="9" cy="11" r="1.5" fill="currentColor" />
                <path d="M21 17l-5-5-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Snap or upload a photo
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Attached" className="h-48 w-full object-cover" />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="absolute right-2 top-2 rounded-full bg-deepwater/85 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
              >
                Remove
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>

        <button
          type="submit"
          disabled={!text.trim() || submitting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-4 text-base font-semibold text-coral-foreground shadow-card transition hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send to Sailfish"}
          {!submitting && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          We&apos;ll read this right away and text you back — {MOCK.responseTime}.
        </p>
      </form>
    </AppShell>
  );
}
