"use client";
import { useState, useTransition } from "react";
import { updateAccessNotes } from "@/app/actions";

// The one thing a member can edit (R1). Free-text access notes (gate code, pets)
// — a single column, edited inline. The save goes through the access_notes
// column grant + RLS; the stamp trigger audits who/when.
export function AccessNotesCard({
  propertyId,
  notes,
}: {
  propertyId: string;
  notes: string | null;
}) {
  const [current, setCurrent] = useState<string | null>(notes);
  const [value, setValue] = useState(notes ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateAccessNotes(propertyId, value);
      if (res.ok) {
        setCurrent(value.trim() || null);
        setEditing(false);
        // Transient "Saved" confirmation — collapses on its own; purely visual.
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2200);
      } else {
        setError(res.message ?? "Couldn't save.");
      }
    });
  }

  return (
    <section className="mt-8">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-deepwater">Gate code &amp; pets</h3>
            {justSaved && (
              <span className="pop-in inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--color-success)_16%,white)] px-2 py-0.5 text-[11px] font-semibold text-[oklch(0.38_0.09_165)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-success)_28%,transparent)]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Saved
              </span>
            )}
          </div>
          {!editing && (
            <button
              onClick={() => {
                setValue(current ?? "");
                setEditing(true);
              }}
              className="text-sm font-semibold text-lagoon underline-offset-4 hover:underline"
            >
              Edit
            </button>
          )}
        </div>

        {!editing ? (
          <p key="display" className="rise-sm mt-3 whitespace-pre-wrap text-sm text-deepwater">
            {current || (
              <span className="text-muted-foreground">
                No access notes yet — add your gate code and anything we should know about pets.
              </span>
            )}
          </p>
        ) : (
          <div key="edit" className="rise-sm mt-3">
            <label htmlFor="access-notes" className="sr-only">
              Access notes
            </label>
            <textarea
              id="access-notes"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Gate code 4482. Friendly dog, Biscuit — may bark at first."
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-deepwater transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-muted-foreground/70 focus:border-lagoon focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--color-lagoon)_28%,transparent)]"
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={save}
                disabled={pending}
                className="press press-active rounded-lg bg-coral px-4 py-2 text-sm font-semibold text-coral-foreground transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:shadow-card disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-deepwater"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
