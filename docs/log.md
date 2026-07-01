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

## Day 1 —
_What I did / what I decided / what I explicitly did not do:_
