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

Evening: made never-cut #1 and #2 real ahead of schedule. RLS adversarial
suite implemented (18 tests, fixtures Ken/Priya/service-role; pg direct
connection for single-transaction actor + DST assertions; keys read from
`supabase status` at runtime so nothing secret-shaped lands in git) and wired
into CI as the `db` job with a guard that fails on a vacuous (todo/skip-only)
run. Stripe webhook acceptance suite added (12 tests against the real served
function, fixtures signed locally — no Stripe account): signature, ledger
idempotency, died-mid-flight reprocess, unpaid-completion + async settlement,
out-of-order, stale-event. The suites caught three real infrastructure gaps on
day one: (a) current Supabase no longer auto-grants Data API table access —
service_role had zero CRUD, so *every* PostgREST call would have failed local
and cloud → 0009 makes the 0005 privilege model explicit (grants restrict
verbs, RLS restricts rows); (b) `revoke execute from anon, authenticated` on
the write RPCs was a no-op because EXECUTE goes to PUBLIC by default —
verified with has_function_privilege, closed in 0009, asserted by a suite
test; (c) no `[functions.*] verify_jwt = false` existed, so Stripe/Telegram/
Airtable could never have reached the webhook fns (deploys need
`--no-verify-jwt` to match). Hardened stripe-webhook per adversarial review:
`payment_status` guard on completed (async methods complete unpaid) +
`async_payment_succeeded/failed` handlers. An adversarial review pass also
closed RLS-suite blind spots (businesses/techs, memberships/plans reads, RPC
execute-denial). devDeps: pg (transaction-level tests), ws (Node 20 realtime
shim). Did not do: OQ1–OQ3 (still open — now the first item of Day 3) and all
of the Gate-1 spine (needs vendor accounts). Traces: R1/R3/R4/R8 / ADR-03.

Night: OQ1–OQ3 resolved and logged as ADR-09. OQ2 → Railway self-host: the
decisive fact (verified against current docs) is that n8n Cloud has no
instance stop/restart, and the Day-9 chaos run must kill n8n mid-stream.
OQ1 → Airtable Free: Interfaces now exist on every tier; one Interface + 100
automation runs/mo fits R6 at demo volume. OQ3 → Supabase cloud project
`cabana` (uuviebpmiwzjyabucheo, us-east-1) created in the existing paid org:
$10/mo buys away the free-tier 7-day auto-pause that would kill the reviewer
demo link (M1); cost recorded for the README notes. Cloud provisioning begun
the same sitting: migrations 0001–0009 + seed pushed via MCP, all three edge
functions deployed with gateway JWT verification off (they authenticate
callers themselves — ADR-03/07/01). Awaiting owner-side account steps:
BotFather token, Railway n8n, Airtable base, Stripe test keys, `gh secret
set ANTHROPIC_API_KEY`. Traces: R5/R6 shape unblocked / ADR-09.
