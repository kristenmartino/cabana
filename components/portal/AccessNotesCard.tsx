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
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateAccessNotes(propertyId, value);
      if (res.ok) {
        setCurrent(value.trim() || null);
        setEditing(false);
      } else {
        setError(res.message ?? "Couldn't save.");
      }
    });
  }

  return (
    <section className="mt-8">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-deepwater">Gate code &amp; pets</h3>
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
          <p className="mt-3 whitespace-pre-wrap text-sm text-deepwater">
            {current || (
              <span className="text-muted-foreground">
                No access notes yet — add your gate code and anything we should know about pets.
              </span>
            )}
          </p>
        ) : (
          <div className="mt-3">
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
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-deepwater placeholder:text-muted-foreground/70 focus:border-lagoon focus:outline-none"
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={save}
                disabled={pending}
                className="rounded-lg bg-coral px-4 py-2 text-sm font-semibold text-coral-foreground transition hover:brightness-95 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-deepwater"
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
