# Build log

One paragraph per day: decisions, surprises, cuts. Doubles as interview
material — "walk me through the build" is answered here.

## Day 0 — scaffold
Repo scaffolded from the spec package (docs/00–04). Complete and load-bearing:
migrations 0001–0006 (schema, status machine, exclusion constraint, outbox +
emit triggers, RLS + write lockdown, set_actor), seed world (every booking
status represented), triage contract (prompt v1 + zod schema + 20-case golden
set + CI runner), CI (typecheck/lint/test/gitleaks/golden), edge-function
skeletons with the security patterns in place (Stripe signature + idempotency
ledger, Telegram secret token + allowlist, write-back whitelist). Stubs marked
TODO(D#): edge-fn business wiring, RLS suite implementation, chaos script,
n8n workflow exports. Day 1 first hour: `npm install` and reconcile dependency
versions (scaffold versions are starting points, generated offline), commit
the lockfile, then resolve OQ1–OQ3 before anything depends on them.

## Day 1 — toolchain + local stack
`npm install` reconciled offline scaffold versions (Next 15.5, React 19, @supabase/ssr
0.6); lockfile committed. Typed `SetAllCookies` in SSR cookie handlers so strict
typecheck passes; added `.eslintrc.json` (next/core-web-vitals + next/typescript) so
`npm run lint` is non-interactive. `supabase init` + `supabase start` + `db reset`
green after Docker Desktop came up. Seed exposed a bug in 0002: BEFORE INSERT logged
to `booking_transitions` before the parent row existed — fixed in 0007 (append-only).
Verified @supabase/ssr patterns match current docs (async `cookies()`, getAll/setAll).
Did not: install global Supabase CLI (using `npx`), resolve OQ1–OQ3, wire edge fns.

## Day 2 —
Opened the day by reconciling actual repo state against the build plan and
writing `05-execution-plan.md`: phased design/build/test/deploy sequence from
here to v1.0, honoring the gates and cut order in 04. Carried-over debt named
explicitly: OQ1–OQ3 still open (Phase 0, timeboxed ≤2h, Railway default for
OQ2 because chaos needs an n8n kill switch), Replit spike unlogged, golden CI
job silently skipping without the `ANTHROPIC_API_KEY` repo secret. Flagged
that `tests/rls/rls.test.ts` passes vacuously (15 `it.todo`) — it must not
gate anything until implemented (D4, same PR as the CI db job).

Afternoon: found that actor attribution was broken for every status write via
supabase-js — `set_actor()` (0006) is transaction-local by design, but
PostgREST wraps each HTTP request in its own transaction, so
`rpc('set_actor')` + `.update()` spans two transactions and the guard (0007)
audited everything as `system`. Fix: 0008 (append-only) adds
`transition_booking(booking_id, to_status, actor)` — set_config + UPDATE in
one transaction, actor allowlist enforced, service-role only; `admin.ts` now
exposes `transitionBooking()` and deprecates the two-step (`set_actor` stays
for single-transaction SQL contexts like seed and the pg-based tests). Pulled
D6 stripe-webhook wiring forward so the fix has a real consumer: `completed`
→ payment `paid` + `awaiting_deposit→scheduled` via the RPC (audited
`system:stripe`), `expired` → pending-only payment expiry; also made the
ledger reprocess duplicates whose prior attempt died mid-flight
(`processed_at` null) — the old early-ack would have orphaned the event.
CLAUDE.md convention + execution-plan D2/D5/D8 prescriptions updated so the
two-step pattern doesn't come back. Traces: R3/R4 / ADR-03, ADR-04.
